/*
 * XLM <-> stroop conversion shared by every payment surface.
 */

const STROOPS_PER_XLM = 10_000_000n;

/** Parse a user-entered XLM amount into stroops. */
export function xlmToStroops(value: string): bigint {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error("Enter a positive amount with up to 7 decimal places.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const stroops =
    BigInt(whole) * STROOPS_PER_XLM + BigInt(fraction.padEnd(7, "0"));

  if (stroops <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return stroops;
}

/** Render stroops as a trimmed XLM string. */
export function stroopsToXlm(stroops: bigint): string {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;

  const whole = absolute / STROOPS_PER_XLM;
  const fraction = (absolute % STROOPS_PER_XLM)
    .toString()
    .padStart(7, "0")
    .replace(/0+$/, "");

  const rendered = fraction ? `${whole}.${fraction}` : `${whole}`;

  return negative ? `-${rendered}` : rendered;
}
