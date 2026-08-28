import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import Services from "./Services";

import type { Service } from "../contract/serviceRegistry";

/*
 * The component reaches the chain only through the typed clients and the
 * shared transport — mock those modules so the tests drive pure UI states.
 * Mocking services/soroban also keeps the wallet kit out of jsdom.
 */
vi.mock("../services/soroban", () => ({
  fetchEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("../contract/serviceRegistry", () => ({
  REGISTRY_ID: "C".padEnd(56, "A"),
  listActiveServices: vi.fn(),
  registerService: vi.fn(),
}));

vi.mock("../contract/paymentRouter", () => ({
  ROUTER_ID: "C".padEnd(56, "B"),
  payForService: vi.fn(),
  getPayerReceipts: vi.fn().mockResolvedValue([]),
}));

import { listActiveServices } from "../contract/serviceRegistry";

const listMock = vi.mocked(listActiveServices);

const WALLET = "GAFA264FOUNCKK7K4LP2U2T3ETQTN2PGW5ONQUE4RC5QSBN6V6246V3I";

const DEMO_SERVICES: Service[] = [
  {
    id: 0,
    provider: "GDMLL4EVSZHPFB3IES7XH72TNFITQ64G3S57SAHOE5L6LBZV4LPRZDJY",
    name: "Translation API",
    price: 50_000_000n,
    payoutAddress: "GDMLL4EVSZHPFB3IES7XH72TNFITQ64G3S57SAHOE5L6LBZV4LPRZDJY",
    active: true,
  },
  {
    id: 1,
    provider: "GDMLL4EVSZHPFB3IES7XH72TNFITQ64G3S57SAHOE5L6LBZV4LPRZDJY",
    name: "Image Generation API",
    price: 100_000_000n,
    payoutAddress: "GDMLL4EVSZHPFB3IES7XH72TNFITQ64G3S57SAHOE5L6LBZV4LPRZDJY",
    active: true,
  },
];

describe("Services list states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading skeleton before the first fetch settles", () => {
    listMock.mockReturnValue(new Promise(() => {})); // never resolves

    render(<Services walletAddress={WALLET} xlmBalance="100" />);

    // Both the services and receipts regions skeleton while loading.
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("renders the fetched services with prices and Pay buttons", async () => {
    listMock.mockResolvedValue(DEMO_SERVICES);

    render(<Services walletAddress={WALLET} xlmBalance="100" />);

    await waitFor(() =>
      expect(screen.getByText("Translation API")).toBeInTheDocument()
    );

    expect(screen.getByText("Image Generation API")).toBeInTheDocument();
    expect(screen.getByText("5 XLM")).toBeInTheDocument();
    expect(screen.getByText("10 XLM")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Pay" })
    ).toHaveLength(2);
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();
  });

  it("shows an empty state when the registry has no active services", async () => {
    listMock.mockResolvedValue([]);

    render(<Services walletAddress={WALLET} xlmBalance="100" />);

    await waitFor(() =>
      expect(
        screen.getByText(/No active services yet/i)
      ).toBeInTheDocument()
    );
  });

  it("surfaces a fetch failure as a distinct error banner", async () => {
    listMock.mockRejectedValue(new Error("network down"));

    render(<Services walletAddress={WALLET} xlmBalance="100" />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Could not load services"
      )
    );
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
  });
});
