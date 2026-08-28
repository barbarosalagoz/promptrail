import { describe, expect, it } from "vitest";

import {
  AppError,
  classifyError,
  classifyHorizonError,
  insufficientBalance,
  userRejected,
  walletNotFound,
} from "./errors";

describe("classifyError", () => {
  it("maps wallet-missing messages to WALLET_NOT_FOUND", () => {
    for (const raw of [
      "Freighter is not installed",
      "Wallet is not available",
      "extension not found",
    ]) {
      expect(classifyError(new Error(raw)).kind).toBe("WALLET_NOT_FOUND");
    }
  });

  it("carries an install hint for known wallets", () => {
    const error = walletNotFound("Freighter");

    expect(error.kind).toBe("WALLET_NOT_FOUND");
    expect(error.message).toContain("Freighter");
    expect(error.hint).toContain("freighter.app");
  });

  it("maps declined requests to USER_REJECTED", () => {
    for (const raw of [
      "User rejected the connection request",
      "Request was denied by the user",
      "Action cancelled by user",
      "The user dismissed the popup",
    ]) {
      expect(classifyError(new Error(raw)).kind).toBe("USER_REJECTED");
    }
  });

  it("distinguishes connection from signature rejections", () => {
    expect(userRejected("connection").message).toContain("connection");
    expect(userRejected("signature").message).toContain("signature");
  });

  it("maps balance failures to INSUFFICIENT_BALANCE", () => {
    for (const raw of [
      "op_underfunded",
      "HostError: balance is not sufficient to spend",
      "tx_insufficient_balance",
    ]) {
      expect(classifyError(new Error(raw)).kind).toBe("INSUFFICIENT_BALANCE");
    }
  });

  it("keeps an explicit pre-check message intact", () => {
    const error = insufficientBalance("Escrowing 5 XLM exceeds 2 XLM.");

    expect(classifyError(error)).toBe(error);
    expect(error.message).toBe("Escrowing 5 XLM exceeds 2 XLM.");
  });

  it("decodes contract error codes through the right contract table", () => {
    const raw = new Error("HostError: Error(Contract, #5)");

    expect(classifyError(raw, undefined, "tracker").message).toContain(
      "already completed or cancelled"
    );
    expect(classifyError(raw, undefined, "registry").message).toContain(
      "provider"
    );
    expect(classifyError(raw, undefined, "router").message).toContain(
      "deactivated"
    );
  });

  it("falls back to the raw code for unknown contract errors", () => {
    const error = classifyError(new Error("Error(Contract, #42)"), undefined, "router");

    expect(error.kind).toBe("UNKNOWN");
    expect(error.message).toContain("#42");
  });

  it("passes AppErrors through unchanged", () => {
    const original = new AppError("WRONG_NETWORK", "Testnet only.");

    expect(classifyError(original)).toBe(original);
  });
});

describe("classifyHorizonError", () => {
  const horizonFailure = (codes: {
    transaction?: string;
    operations?: string[];
  }) => ({
    response: { data: { extras: { result_codes: codes } } },
  });

  it("maps op_underfunded to INSUFFICIENT_BALANCE", () => {
    const error = classifyHorizonError(
      horizonFailure({ transaction: "tx_failed", operations: ["op_underfunded"] })
    );

    expect(error.kind).toBe("INSUFFICIENT_BALANCE");
  });

  it("reports other operation codes verbatim", () => {
    const error = classifyHorizonError(
      horizonFailure({ transaction: "tx_failed", operations: ["op_no_destination"] })
    );

    expect(error.kind).toBe("UNKNOWN");
    expect(error.message).toContain("op_no_destination");
  });

  it("falls back to classifyError for non-Horizon failures", () => {
    const error = classifyHorizonError(new Error("User rejected the request"));

    expect(error.kind).toBe("USER_REJECTED");
  });
});
