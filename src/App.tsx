import "./App.css";

function App() {
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

        <h3>Connect your wallet</h3>

        <p>
          Connect Freighter to access your Stellar Testnet account.
        </p>

        <button className="primary-button">
          Connect Freighter
        </button>

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