import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { StrKey } from "@stellar/stellar-sdk";

import {
  EXPLORER_CONTRACT_URL,
  PAYMENT_TRACKER_ID,
  cancelPayment,
  completePayment,
  createBatch,
  createPayment,
  getSentPayments,
  stroopsToXlm,
  xlmToStroops,
} from "../contract/paymentTracker";

import type { BatchRecipient, TrackedPayment } from "../contract/paymentTracker";

interface PaymentTrackerProps {
  walletAddress: string;
}

interface RecipientRow {
  destination: string;
  amount: string;
}

const emptyRow = (): RecipientRow => ({ destination: "", amount: "" });

const explorerTx = (hash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${hash}`;

const shortenAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-6)}`;

const formatTimestamp = (seconds: number) =>
  seconds ? new Date(seconds * 1000).toLocaleString() : "—";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Payment Tracker panel.
 *
 * Reads the connected wallet's sent payments straight out of the deployed
 * Soroban contract, and drives create / complete / cancel through Freighter.
 */
function PaymentTracker({ walletAddress }: PaymentTrackerProps) {
  const [payments, setPayments] = useState<TrackedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [batchMode, setBatchMode] = useState(false);
  const [rows, setRows] = useState<RecipientRow[]>([emptyRow()]);

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionHash, setActionHash] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  /*
   * Load the sender's payments from the contract's read-only views.
   *
   * `isActive` lets the mount effect drop a response that arrives after the
   * connected wallet has already changed.
   */
  const load = useCallback(
    async (isActive: () => boolean) => {
      try {
        const result = await getSentPayments(walletAddress, walletAddress);

        if (isActive()) {
          setPayments(result);
          setLoadError(null);
        }
      } catch (error) {
        if (isActive()) {
          setLoadError(toMessage(error));
        }
      } finally {
        if (isActive()) {
          setLoading(false);
        }
      }
    },
    [walletAddress]
  );

  useEffect(() => {
    let active = true;

    /*
     * Reading the contract on mount is the "subscribe to an external system"
     * case effects exist for. `load` only touches state after awaiting the RPC
     * round trip, and `active` drops a response that lands too late.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => active);

    return () => {
      active = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load(() => true);
  }, [load]);

  const updateRow = (index: number, patch: Partial<RecipientRow>) => {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...patch } : row
      )
    );
  };

  const addRow = () => setRows((current) => [...current, emptyRow()]);

  const removeRow = (index: number) =>
    setRows((current) =>
      current.length === 1
        ? current
        : current.filter((_, position) => position !== index)
    );

  const enterBatchMode = () => {
    setBatchMode(true);
    setRows((current) => (current.length > 1 ? current : [...current, emptyRow()]));
  };

  const leaveBatchMode = () => {
    setBatchMode(false);
    setRows((current) => [current[0] ?? emptyRow()]);
  };

  /**
   * Validate every row before touching the wallet, so a bad address never
   * reaches a signing prompt.
   */
  const parseRows = (): BatchRecipient[] => {
    const active = batchMode ? rows : rows.slice(0, 1);

    return active.map((row, index) => {
      const destination = row.destination.trim();
      const label = batchMode ? `Recipient ${index + 1}: ` : "";

      if (!StrKey.isValidEd25519PublicKey(destination)) {
        throw new Error(`${label}enter a valid Stellar address (G...).`);
      }

      if (destination === walletAddress) {
        throw new Error(`${label}sender and recipient cannot match.`);
      }

      try {
        return { destination, amount: xlmToStroops(row.amount) };
      } catch (error) {
        throw new Error(`${label}${toMessage(error)}`, { cause: error });
      }
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    setActionError(null);
    setActionHash(null);
    setActionNotice(null);

    let recipients: BatchRecipient[];

    try {
      recipients = parseRows();
    } catch (error) {
      setActionError(toMessage(error));
      return;
    }

    setSubmitting(true);

    try {
      if (batchMode) {
        const result = await createBatch(walletAddress, recipients);

        setActionHash(result.hash);
        setActionNotice(
          `Escrowed ${result.value.length} payments (ids ${result.value.join(", ")}).`
        );
      } else {
        const result = await createPayment(
          walletAddress,
          recipients[0].destination,
          recipients[0].amount
        );

        setActionHash(result.hash);
        setActionNotice(`Payment #${result.value} is now held in escrow.`);
      }

      setRows(batchMode ? [emptyRow(), emptyRow()] : [emptyRow()]);
      await refresh();
    } catch (error) {
      setActionError(toMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const settle = async (payment: TrackedPayment, release: boolean) => {
    setActionError(null);
    setActionHash(null);
    setActionNotice(null);
    setBusyId(payment.id);

    try {
      const result = release
        ? await completePayment(walletAddress, payment.id)
        : await cancelPayment(walletAddress, payment.id);

      setActionHash(result.hash);
      setActionNotice(
        release
          ? `Payment #${payment.id} released to the recipient.`
          : `Payment #${payment.id} refunded to you.`
      );

      await refresh();
    } catch (error) {
      setActionError(toMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const busy = submitting || busyId !== null;

  return (
    <section className="tracker-card">
      <div className="tracker-heading">
        <span className="payment-eyebrow">ON-CHAIN SETTLEMENT</span>

        <h3>Payment Tracker</h3>

        <p>
          Escrowed payments held by a Soroban smart contract. Funds stay locked
          in the contract until you release or refund them.
        </p>

        <div className="tracker-contract">
          <span className="tracker-contract-label">Contract</span>

          <code>{shortenAddress(PAYMENT_TRACKER_ID)}</code>

          <a href={EXPLORER_CONTRACT_URL} target="_blank" rel="noreferrer">
            View contract ↗
          </a>
        </div>
      </div>

      <form className="payment-form tracker-form" onSubmit={submit}>
        <div className="tracker-mode">
          <button
            type="button"
            className={`tracker-tab ${batchMode ? "" : "tracker-tab-active"}`}
            onClick={leaveBatchMode}
            disabled={busy}
          >
            Single payment
          </button>

          <button
            type="button"
            className={`tracker-tab ${batchMode ? "tracker-tab-active" : ""}`}
            onClick={enterBatchMode}
            disabled={busy}
          >
            Batch
          </button>
        </div>

        {(batchMode ? rows : rows.slice(0, 1)).map((row, index) => (
          <div className="tracker-row" key={index}>
            <label>
              {batchMode ? `Recipient ${index + 1}` : "Recipient"}

              <input
                type="text"
                value={row.destination}
                onChange={(event) =>
                  updateRow(index, { destination: event.target.value })
                }
                placeholder="G..."
                autoComplete="off"
                disabled={busy}
              />
            </label>

            <label>
              Amount

              <div className="amount-input">
                <input
                  type="number"
                  min="0.0000001"
                  step="0.0000001"
                  value={row.amount}
                  onChange={(event) =>
                    updateRow(index, { amount: event.target.value })
                  }
                  placeholder="1.00"
                  disabled={busy}
                />

                <span>XLM</span>
              </div>
            </label>

            {batchMode && rows.length > 1 && (
              <button
                type="button"
                className="tracker-remove"
                onClick={() => removeRow(index)}
                disabled={busy}
                aria-label={`Remove recipient ${index + 1}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {batchMode && (
          <button
            type="button"
            className="secondary-button"
            onClick={addRow}
            disabled={busy || rows.length >= 100}
          >
            + Add recipient
          </button>
        )}

        <button className="primary-button" type="submit" disabled={busy}>
          {submitting
            ? "Waiting for Freighter..."
            : batchMode
              ? `Escrow ${rows.length} payments`
              : "Escrow payment"}
        </button>
      </form>

      {actionError && (
        <div className="transaction-result transaction-failure">
          <span className="result-icon">✕</span>

          <div>
            <strong>Could not complete that action</strong>
            <p>{actionError}</p>
          </div>
        </div>
      )}

      {actionNotice && (
        <div className="transaction-result transaction-success">
          <span className="result-icon">✓</span>

          <div>
            <strong>{actionNotice}</strong>

            {actionHash && (
              <a
                href={explorerTx(actionHash)}
                target="_blank"
                rel="noreferrer"
              >
                View transaction ↗
              </a>
            )}
          </div>
        </div>
      )}

      <div className="tracker-list-heading">
        <h4>Your tracked payments</h4>

        <button
          type="button"
          className="balance-refresh"
          onClick={refresh}
          disabled={loading || busy}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loadError && <div className="balance-error">{loadError}</div>}

      {!loadError && payments.length === 0 && !loading && (
        <p className="tracker-empty">
          No tracked payments yet. Escrow one above and it will appear here.
        </p>
      )}

      <ul className="tracker-list">
        {payments.map((payment) => (
          <li className="tracker-item" key={payment.id}>
            <div className="tracker-item-main">
              <span className="tracker-id">#{payment.id}</span>

              <div className="tracker-item-detail">
                <strong>{stroopsToXlm(payment.amount)} XLM</strong>

                <span className="tracker-to">
                  to <code>{shortenAddress(payment.to)}</code>
                </span>

                <span className="tracker-time">
                  {formatTimestamp(payment.updatedAt)}
                </span>
              </div>

              <span
                className={`tracker-status tracker-status-${payment.status.toLowerCase()}`}
              >
                {payment.status}
              </span>
            </div>

            {payment.status === "Pending" && (
              <div className="tracker-actions">
                <button
                  type="button"
                  className="primary-button tracker-action"
                  onClick={() => settle(payment, true)}
                  disabled={busy}
                >
                  {busyId === payment.id ? "Working..." : "Complete"}
                </button>

                <button
                  type="button"
                  className="secondary-button tracker-action"
                  onClick={() => settle(payment, false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <span className="card-note">
        Escrowed funds are held by the contract, not by PromptRail.
      </span>
    </section>
  );
}

export default PaymentTracker;
