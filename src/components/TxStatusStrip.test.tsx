import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import TxStatusStrip from "./TxStatusStrip";

const HASH =
  "04053f6f86d31c2a6ff98081fbc44bd8cf1eb9f8631b3bb64167a1e0243177b6";

describe("TxStatusStrip", () => {
  it("shows the signing state while waiting for the wallet", () => {
    render(<TxStatusStrip status={{ phase: "signing" }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for wallet signature"
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the pending state with a linked tx hash once submitted", () => {
    render(<TxStatusStrip status={{ phase: "pending", hash: HASH }} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "waiting for on-chain confirmation"
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining(HASH)
    );
    expect(link).toHaveTextContent(HASH.slice(0, 8));
  });
});
