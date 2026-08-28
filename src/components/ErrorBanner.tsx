import type { AppError } from "../errors";

/*
 * Banner titles per error kind — the named review cases (wallet not found,
 * user rejected, insufficient balance) read distinctly everywhere.
 */
const ERROR_TITLES: Partial<Record<AppError["kind"], string>> = {
  WALLET_NOT_FOUND: "Wallet not found",
  USER_REJECTED: "Request declined in wallet",
  INSUFFICIENT_BALANCE: "Insufficient balance",
  WRONG_NETWORK: "Wrong network",
};

interface ErrorBannerProps {
  error: AppError;
  /** Fallback title when the kind has no dedicated one. */
  fallbackTitle?: string;
}

/** Standard failure banner: per-kind title, message, and follow-up hint. */
function ErrorBanner({ error, fallbackTitle = "Something went wrong" }: ErrorBannerProps) {
  return (
    <div className="transaction-result transaction-failure" role="alert">
      <span className="result-icon">✕</span>

      <div>
        <strong>{ERROR_TITLES[error.kind] ?? fallbackTitle}</strong>
        <p>{error.message}</p>
        {error.hint && <p className="error-hint">{error.hint}</p>}
      </div>
    </div>
  );
}

export default ErrorBanner;
