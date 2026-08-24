import { useEffect, useState } from "react";
import {
  isConnected,
  requestAccess,
  getNetworkDetails,
} from "@stellar/freighter-api";
import "./App.css";

function App() {
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(
    null
  );

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [network, setNetwork] = useState<string | null>(null);

  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const result = await isConnected();

        if (result.error) {
          console.error("Freighter check error:", result.error);
          setFreighterInstalled(false);
          return;
        }

        setFreighterInstalled(result.isConnected);
      } catch (error) {
        console.error("Freighter detection failed:", error);
        setFreighterInstalled(false);
      }
    };

    checkFreighter();
  }, []);

  const checkNetwork = async () => {
    try {
      const networkResult = await getNetworkDetails();

      if (networkResult.error) {
        throw new Error("Could not read the Freighter network.");
      }

      setNetwork(networkResult.network);

      return networkResult.network;
    } catch (error) {
      console.error("Network check failed:", error);

      setNetwork(null);

      throw error;
    }
  };

  const connectWallet = async () => {
    try {
      setConnecting(true);
      setConnectionError(null);

      const connectionResult = await isConnected();

      if (!connectionResult.isConnected) {
        setFreighterInstalled(false);

        throw new Error(
          "Freighter could not be detected. Please unlock Freighter and refresh the page."
        );
      }

      const accessResult = await requestAccess();

      if (accessResult.error) {
        throw new Error(accessResult.error.message);
      }

      if (!accessResult.address) {
        throw new Error(
          "Freighter did not return a wallet address. Please unlock your wallet and try again."
        );
      }

      setWalletAddress(accessResult.address);

      const activeNetwork = await checkNetwork();

      if (activeNetwork !== "TESTNET") {
        setConnectionError(
          `PromptRail requires Stellar Testnet. Your Freighter wallet is currently using ${activeNetwork}. Please switch Freighter to Testnet.`
        );
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);

      setConnectionError(
        error instanceof Error
          ? error.message
          : "Could not connect to Freighter."
      );
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    setNetwork(null);
    setConnectionError(null);
  };

  const recheckNetwork = async () => {
    try {
      setConnectionError(null);

      const activeNetwork = await checkNetwork();

      if (activeNetwork !== "TESTNET") {
        setConnectionError(
          `PromptRail requires Stellar Testnet. Your Freighter wallet is currently using ${activeNetwork}. Please switch Freighter to Testnet.`
        );
      }
    } catch {
      setConnectionError(
        "Could not check the active Stellar network."
      );
    }
  };

  const isTestnet = network === "TESTNET";

  return (
    <main className="app">
      <header className="navbar">
        <div className="brand">
          <div className="brand-mark">P</div>

          <div>
            <h1>PromptRail</h1>
            <span>Machine Payments on Stellar</span>
          </div>
        </div>

        <div
          className={`network-badge ${
            network && !isTestnet ? "network-badge-wrong" : ""
          }`}
        >
          <span
            className={`network-dot ${
              network && !isTestnet ? "network-dot-wrong" : ""
            }`}
          />

          {network ?? "TESTNET"}
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">STELLAR WHITE BELT</div>

        <h2>
          The payment rail
          <br />
          for the agentic web.
        </h2>

        <p>
          Connect your Stellar wallet and make your first
          machine-to-machine payment on Testnet.
        </p>
      </section>

      <section className="wallet-card">
        <div className="card-icon">✦</div>

        {walletAddress ? (
          <>
            <h3>Wallet connected</h3>

            <p>
              Your Freighter wallet is connected to PromptRail.
            </p>

            <div className="connected-status">
              <span className="connected-dot" />
              Connected
            </div>

            <div className="wallet-address">
              <span className="wallet-address-label">
                Stellar Address
              </span>

              <strong>
                {walletAddress.slice(0, 10)}
                ...
                {walletAddress.slice(-10)}
              </strong>
            </div>

            {network && (
              <div
                className={`network-panel ${
                  isTestnet ? "network-panel-good" : "network-panel-wrong"
                }`}
              >
                <span className="network-panel-label">
                  ACTIVE NETWORK
                </span>

                <strong>
                  {isTestnet ? "✓ Stellar Testnet" : `⚠ ${network}`}
                </strong>

                <span>
                  {isTestnet
                    ? "Ready for test transactions."
                    : "Switch Freighter to Testnet before continuing."}
                </span>
              </div>
            )}

            <button
              className="secondary-button"
              onClick={recheckNetwork}
            >
              Recheck Network
            </button>

            <button
              className="disconnect-button"
              onClick={disconnectWallet}
            >
              Disconnect Wallet
            </button>
          </>
        ) : (
          <>
            <h3>Connect your wallet</h3>

            <p>
              Connect Freighter to access your Stellar Testnet account.
            </p>

            {freighterInstalled === null ? (
              <button
                className="primary-button"
                disabled
              >
                Checking Freighter...
              </button>
            ) : freighterInstalled ? (
              <button
                className="primary-button"
                onClick={connectWallet}
                disabled={connecting}
              >
                {connecting
                  ? "Connecting..."
                  : "Connect Freighter"}
              </button>
            ) : (
              <>
                <a
                  className="primary-button install-link"
                  href="https://www.freighter.app/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Install Freighter
                </a>

                <button
                  className="secondary-button"
                  onClick={() => window.location.reload()}
                >
                  I've installed it — Refresh
                </button>
              </>
            )}
          </>
        )}

        {connectionError && (
          <div className="connection-error">
            {connectionError}
          </div>
        )}

        <span className="card-note">
          Your private keys never leave your wallet.
        </span>
      </section>

      <footer>
        Built on Stellar · PromptRail Launchpad
      </footer>
    </main>
  );
}

export default App;