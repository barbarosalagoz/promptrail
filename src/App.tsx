import { useEffect, useState } from "react";
import {
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import "./App.css";

function App() {
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(
    null
  );

  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

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

  const connectWallet = async () => {
    try {
      setConnecting(true);
      setConnectionError(null);

      // Freighter gerçekten erişilebilir mi tekrar kontrol ediyoruz.
      const connectionResult = await isConnected();

      if (!connectionResult.isConnected) {
        setFreighterInstalled(false);

        throw new Error(
          "Freighter could not be detected. Please unlock Freighter and refresh the page."
        );
      }

      // Kullanıcıdan uygulamaya erişim izni ister.
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

        <div className="network-badge">
          <span className="network-dot" />
          TESTNET
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