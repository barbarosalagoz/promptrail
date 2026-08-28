import type { TxStatus } from "../services/soroban";

import { explorerTx } from "../config";

interface TxStatusStripProps {
  status: TxStatus;
}

/**
 * Live indicator for an in-flight transaction:
 * signing (waiting for the wallet) → pending (submitted, hash known).
 */
function TxStatusStrip({ status }: TxStatusStripProps) {
  return (
    <div className="tx-status" role="status">
      <span className="tx-status-spinner" />

      <div>
        <strong>
          {status.phase === "signing"
            ? "Waiting for wallet signature..."
            : "Submitted — waiting for on-chain confirmation..."}
        </strong>

        {status.hash && (
          <a href={explorerTx(status.hash)} target="_blank" rel="noreferrer">
            {status.hash.slice(0, 8)}...{status.hash.slice(-8)} ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default TxStatusStrip;
