import { useState } from "react";
import type { FormEvent } from "react";

import { StrKey } from "@stellar/stellar-sdk";

import { registerService, REGISTRY_ID } from "../contract/serviceRegistry";
import { payForService, ROUTER_ID } from "../contract/paymentRouter";

import type { Service } from "../contract/serviceRegistry";

import { stroopsToXlm, xlmToStroops } from "../services/amounts";

import type { TxStatus } from "../services/soroban";

import { useServices } from "../hooks/useServices";
import { useReceipts } from "../hooks/useReceipts";
import { useActivityFeed } from "../hooks/useActivityFeed";

import { AppError, classifyError, insufficientBalance } from "../errors";

import { explorerContract, explorerTx } from "../config";

import ErrorBanner from "./ErrorBanner";
import Skeleton from "./Skeleton";
import TxStatusStrip from "./TxStatusStrip";

interface ServicesProps {
  walletAddress: string;
  /** Spendable XLM balance, used to pre-check payments before signing. */
  xlmBalance: string | null;
}

const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-6)}`;

const formatTimestamp = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toLocaleString() : "—";

const formatEventTime = (iso: string) => {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? iso : time.toLocaleTimeString();
};

const EVENT_ICONS: Record<string, string> = {
  service_registered: "+",
  service_updated: "~",
  service_deactivated: "✕",
  service_paid: "✓",
};

/**
 * Services marketplace panel: browse the on-chain registry, pay for a
 * service through the router's cross-contract call, offer a service as a
 * provider, and watch receipts + the merged event feed update live.
 */
function Services({ walletAddress, xlmBalance }: ServicesProps) {
  const [busyServiceId, setBusyServiceId] = useState<number | null>(null);
  const [registering, setRegistering] = useState(false);

  const busy = busyServiceId !== null || registering;

  const services = useServices(walletAddress, busy);
  const receipts = useReceipts(walletAddress, busy);
  const activity = useActivityFeed(busy);

  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionHash, setActionHash] = useState<string | null>(null);

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [payoutAddress, setPayoutAddress] = useState("");

  const resetBanners = () => {
    setActionError(null);
    setActionNotice(null);
    setActionHash(null);
  };

  const pay = async (service: Service) => {
    resetBanners();

    try {
      /*
       * Insufficient balance is pre-checked before any signing prompt; the
       * on-chain SAC error maps to the same typed case if it slips through.
       */
      if (xlmBalance && service.price >= xlmToStroops(xlmBalance)) {
        throw insufficientBalance(
          `"${service.name}" costs ${stroopsToXlm(service.price)} XLM, but your spendable balance is ${xlmBalance} XLM.`
        );
      }

      setBusyServiceId(service.id);

      const result = await payForService(walletAddress, service.id, setTxStatus);

      setActionNotice(
        `Paid ${stroopsToXlm(service.price)} XLM for "${service.name}" — receipt #${result.value}.`
      );
      setActionHash(result.hash);

      await receipts.refresh();
      await activity.refresh();
    } catch (error) {
      setActionError(classifyError(error, undefined, "router"));
    } finally {
      setTxStatus(null);
      setBusyServiceId(null);
    }
  };

  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault();
    resetBanners();

    let price: bigint;
    const payout = payoutAddress.trim() || walletAddress;

    try {
      if (!serviceName.trim()) {
        throw new AppError("UNKNOWN", "Give the service a name.");
      }

      if (!StrKey.isValidEd25519PublicKey(payout)) {
        throw new AppError(
          "UNKNOWN",
          "Enter a valid payout address (G...), or leave it empty to receive payouts yourself."
        );
      }

      price = xlmToStroops(servicePrice);
    } catch (error) {
      setActionError(classifyError(error, undefined, "registry"));
      return;
    }

    setRegistering(true);

    try {
      const result = await registerService(
        walletAddress,
        serviceName.trim(),
        price,
        payout,
        setTxStatus
      );

      setActionNotice(
        `Service #${result.value} "${serviceName.trim()}" is now live on the registry.`
      );
      setActionHash(result.hash);

      setServiceName("");
      setServicePrice("");
      setPayoutAddress("");
      setShowRegisterForm(false);

      await services.refresh();
      await activity.refresh();
    } catch (error) {
      setActionError(classifyError(error, undefined, "registry"));
    } finally {
      setTxStatus(null);
      setRegistering(false);
    }
  };

  return (
    <section className="tracker-card services-card">
      <div className="tracker-heading">
        <span className="payment-eyebrow">SERVICE MARKETPLACE</span>

        <h3>On-Chain Services</h3>

        <p>
          Services registered on the Service Registry contract. Paying routes
          through the Payment Router, which resolves the service on-chain with
          a cross-contract call.
        </p>

        <div className="tracker-contract services-contracts">
          <span className="tracker-contract-label">Registry</span>
          <code>{shortenAddress(REGISTRY_ID)}</code>
          <a href={explorerContract(REGISTRY_ID)} target="_blank" rel="noreferrer">
            view ↗
          </a>

          <span className="tracker-contract-label">Router</span>
          <code>{shortenAddress(ROUTER_ID)}</code>
          <a href={explorerContract(ROUTER_ID)} target="_blank" rel="noreferrer">
            view ↗
          </a>
        </div>
      </div>

      {txStatus && <TxStatusStrip status={txStatus} />}

      {actionError && (
        <ErrorBanner error={actionError} fallbackTitle="Could not complete that action" />
      )}

      {actionNotice && (
        <div className="transaction-result transaction-success">
          <span className="result-icon">✓</span>

          <div>
            <strong>{actionNotice}</strong>

            {actionHash && (
              <a href={explorerTx(actionHash)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Active services ---------------- */}

      <div className="tracker-list-heading">
        <h4>
          Active services
          <span className="tracker-live">
            <span className="tracker-live-dot" />
            LIVE
          </span>
        </h4>

        <button
          type="button"
          className="balance-refresh"
          onClick={services.refresh}
          disabled={services.loading || busy}
        >
          {services.loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {services.loading && !services.data && <Skeleton rows={3} />}

      {services.error && (
        <ErrorBanner error={services.error} fallbackTitle="Could not load services" />
      )}

      {services.data && services.data.length === 0 && !services.loading && (
        <p className="tracker-empty">
          No active services yet. Be the first to offer one below.
        </p>
      )}

      {services.data && services.data.length > 0 && (
        <ul className="service-list">
          {services.data.map((service) => (
            <li className="service-item" key={service.id}>
              <div className="service-main">
                <span className="tracker-id">#{service.id}</span>

                <div className="service-detail">
                  <strong>{service.name}</strong>

                  <span className="service-provider">
                    by <code>{shortenAddress(service.provider)}</code>
                    {service.provider === walletAddress && (
                      <em className="service-yours">yours</em>
                    )}
                  </span>
                </div>

                <span className="service-price">
                  {stroopsToXlm(service.price)} XLM
                </span>

                <button
                  type="button"
                  className="primary-button service-pay"
                  onClick={() => pay(service)}
                  disabled={busy}
                >
                  {busyServiceId === service.id ? "Paying..." : "Pay"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- Provider flow ---------------- */}

      {showRegisterForm ? (
        <form className="payment-form tracker-form" onSubmit={submitRegistration}>
          <div className="payment-heading">
            <span className="payment-eyebrow">PROVIDER</span>
            <h4>Offer a service</h4>
          </div>

          <label>
            Service name
            <input
              type="text"
              value={serviceName}
              onChange={(event) => setServiceName(event.target.value)}
              placeholder="Translation API"
              maxLength={80}
              disabled={busy}
            />
          </label>

          <label>
            Price
            <div className="amount-input">
              <input
                type="number"
                min="0.0000001"
                step="0.0000001"
                value={servicePrice}
                onChange={(event) => setServicePrice(event.target.value)}
                placeholder="5.00"
                disabled={busy}
              />
              <span>XLM</span>
            </div>
          </label>

          <label>
            Payout address (optional — defaults to your wallet)
            <input
              type="text"
              value={payoutAddress}
              onChange={(event) => setPayoutAddress(event.target.value)}
              placeholder="G..."
              autoComplete="off"
              disabled={busy}
            />
          </label>

          <button className="primary-button" type="submit" disabled={busy}>
            {registering ? "Waiting for your wallet..." : "Register service"}
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowRegisterForm(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            resetBanners();
            setShowRegisterForm(true);
          }}
          disabled={busy}
        >
          + Offer a service
        </button>
      )}

      {/* ---------------- Receipts ---------------- */}

      <div className="tracker-list-heading">
        <h4>
          Your receipts
          <span className="tracker-live">
            <span className="tracker-live-dot" />
            LIVE
          </span>
        </h4>
      </div>

      {receipts.loading && !receipts.data && <Skeleton rows={2} />}

      {receipts.error && (
        <ErrorBanner error={receipts.error} fallbackTitle="Could not load receipts" />
      )}

      {receipts.data && receipts.data.length === 0 && !receipts.loading && (
        <p className="tracker-empty">
          No receipts yet. Pay for a service above and the receipt appears
          here.
        </p>
      )}

      {receipts.data && receipts.data.length > 0 && (
        <ul className="tracker-list">
          {receipts.data.map((receipt) => (
            <li className="tracker-item" key={receipt.id}>
              <div className="tracker-item-main">
                <span className="tracker-id">#{receipt.id}</span>

                <div className="tracker-item-detail">
                  <strong>{stroopsToXlm(receipt.amount)} XLM</strong>

                  <span className="tracker-to">
                    service #{receipt.serviceId} · provider{" "}
                    <code>{shortenAddress(receipt.provider)}</code>
                  </span>

                  <span className="tracker-time">
                    {formatTimestamp(receipt.timestamp)}
                  </span>
                </div>

                <span className="tracker-status tracker-status-completed">
                  Paid
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- Merged activity feed ---------------- */}

      {activity.data && activity.data.length > 0 && (
        <div className="tracker-events">
          <div className="tracker-list-heading">
            <h4>Marketplace activity</h4>

            <span className="tracker-events-caption">
              registry + router events, via Soroban RPC
            </span>
          </div>

          <ul className="tracker-event-list">
            {activity.data.map((item) => (
              <li className="tracker-event" key={item.id}>
                <span className={`tracker-event-icon activity-${item.kind}`}>
                  {EVENT_ICONS[item.kind] ?? "•"}
                </span>

                <div className="tracker-event-detail">
                  <span>{item.label}</span>

                  <span className="tracker-event-time">
                    {formatEventTime(item.closedAt)} · ledger {item.ledger}
                  </span>
                </div>

                <a href={explorerTx(item.txHash)} target="_blank" rel="noreferrer">
                  tx ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <span className="card-note">
        Payments settle provider-side instantly — the router never holds
        funds.
      </span>
    </section>
  );
}

export default Services;
