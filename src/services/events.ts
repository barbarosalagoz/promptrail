import {
  scValToNative,
} from "@stellar/stellar-sdk";

import {
  Server as RpcServer,
} from "@stellar/stellar-sdk/rpc";

import {
  REGISTRY_CONTRACT_ID,
} from "./registry";

const RPC_URL =
  "https://soroban-testnet.stellar.org";

const POLL_INTERVAL_MS =
  3_000;

const INITIAL_LOOKBACK_LEDGERS =
  720;

const MAX_EVENTS_PER_REQUEST =
  100;

const rpcServer =
  new RpcServer(
    RPC_URL,
    {
      timeout: 10_000,
    },
  );

type GetEventsResponse =
  Awaited<
    ReturnType<
      typeof rpcServer.getEvents
    >
  >;

type RpcEvent =
  GetEventsResponse["events"][number];

export type RegistryActivityType =
  | "EndpointRegistered"
  | "PriceUpdated"
  | "StatusChanged";

export interface RegistryActivity {
  id: string;

  type:
    RegistryActivityType;

  owner: string;

  name?: string;

  priceStroops?: bigint;

  oldPriceStroops?: bigint;

  newPriceStroops?: bigint;

  active?: boolean;

  ledger: number;

  txHash: string;

  ledgerClosedAt?: string;
}

export interface RegistryEventFeed {
  stop: () => void;
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<
    string,
    unknown
  >;
}

function asString(
  value: unknown,
): string | undefined {
  return typeof value ===
    "string"
    ? value
    : undefined;
}

function asBigInt(
  value: unknown,
): bigint | undefined {
  return typeof value ===
    "bigint"
    ? value
    : undefined;
}

function asBoolean(
  value: unknown,
): boolean | undefined {
  return typeof value ===
    "boolean"
    ? value
    : undefined;
}

function parseRegistryEvent(
  event: RpcEvent,
): RegistryActivity | null {
  try {
    const firstTopic =
      event.topic?.[0];

    const ownerTopic =
      event.topic?.[1];

    if (
      !firstTopic ||
      !ownerTopic
    ) {
      return null;
    }

    const eventName =
      scValToNative(
        firstTopic,
      );

    const owner =
      scValToNative(
        ownerTopic,
      );

    if (
      typeof eventName !==
        "string" ||
      typeof owner !==
        "string"
    ) {
      return null;
    }

    const decodedData =
      scValToNative(
        event.value,
      );

    const data =
      asRecord(
        decodedData,
      );

    if (!data) {
      return null;
    }

    const base = {
      id:
        event.id,

      owner,

      ledger:
        event.ledger,

      txHash:
        event.txHash,

      ledgerClosedAt:
        event.ledgerClosedAt,
    };

    switch (
      eventName
    ) {
      case "endpoint_registered":
        return {
          ...base,

          type:
            "EndpointRegistered",

          name:
            asString(
              data.name,
            ),

          priceStroops:
            asBigInt(
              data.price,
            ),
        };

      case "price_updated":
        return {
          ...base,

          type:
            "PriceUpdated",

          oldPriceStroops:
            asBigInt(
              data.old_price,
            ),

          newPriceStroops:
            asBigInt(
              data.new_price,
            ),
        };

      case "status_changed":
        return {
          ...base,

          type:
            "StatusChanged",

          active:
            asBoolean(
              data.active,
            ),
        };

      default:
        /*
         * Ignore events that are not part
         * of PromptRail Registry's public
         * activity model.
         */
        return null;
    }
  } catch (
    error
  ) {
    console.warn(
      "Could not decode Registry event:",
      error,
    );

    return null;
  }
}

function newestFirst(
  activities:
    RegistryActivity[],
): RegistryActivity[] {
  return [
    ...activities,
  ].sort(
    (a, b) =>
      b.ledger -
      a.ledger,
  );
}

export async function fetchRecentRegistryEvents():
Promise<RegistryActivity[]> {
  const latest =
    await rpcServer
      .getLatestLedger();

  const startLedger =
    Math.max(
      1,
      latest.sequence -
        INITIAL_LOOKBACK_LEDGERS,
    );

  const response =
    await rpcServer
      .getEvents({
        startLedger,

        filters: [
          {
            type:
              "contract",

            contractIds: [
              REGISTRY_CONTRACT_ID,
            ],
          },
        ],

        limit:
          MAX_EVENTS_PER_REQUEST,
      });

  const parsed =
    response.events
      .map(
        parseRegistryEvent,
      )
      .filter(
        (
          event,
        ): event is
          RegistryActivity =>
          event !== null,
      );

  return newestFirst(
    parsed,
  );
}

export async function startRegistryEventFeed(
  onEvents: (
    events:
      RegistryActivity[],
  ) => void,

  onError?: (
    error: Error,
  ) => void,
): Promise<RegistryEventFeed> {
  let stopped =
    false;

  let requestRunning =
    false;

  let cursor:
    | string
    | undefined;

  const seenIds =
    new Set<string>();

  /*
   * Initial query intentionally looks
   * backwards so the user immediately
   * sees recent Registry activity.
   */
  const latest =
    await rpcServer
      .getLatestLedger();

  const initialStartLedger =
    Math.max(
      1,
      latest.sequence -
        INITIAL_LOOKBACK_LEDGERS,
    );

  const poll =
    async (
      initial = false,
    ) => {
      if (
        stopped ||
        requestRunning
      ) {
        return;
      }

      requestRunning =
        true;

      try {
        const response =
          await rpcServer
            .getEvents(
              cursor
                ? {
                    cursor,

                    filters: [
                      {
                        type:
                          "contract",

                        contractIds:
                          [
                            REGISTRY_CONTRACT_ID,
                          ],
                      },
                    ],

                    limit:
                      MAX_EVENTS_PER_REQUEST,
                  }
                : {
                    startLedger:
                      initialStartLedger,

                    filters: [
                      {
                        type:
                          "contract",

                        contractIds:
                          [
                            REGISTRY_CONTRACT_ID,
                          ],
                      },
                    ],

                    limit:
                      MAX_EVENTS_PER_REQUEST,
                  },
            );

        if (
          response.cursor
        ) {
          cursor =
            response.cursor;
        }

        const freshEvents =
          response.events
            .filter(
              (event) => {
                if (
                  seenIds.has(
                    event.id,
                  )
                ) {
                  return false;
                }

                seenIds.add(
                  event.id,
                );

                return true;
              },
            )
            .map(
              parseRegistryEvent,
            )
            .filter(
              (
                event,
              ): event is
                RegistryActivity =>
                event !==
                null,
            );

        if (
          freshEvents.length >
          0
        ) {
          onEvents(
            newestFirst(
              freshEvents,
            ),
          );
        } else if (
          initial
        ) {
          /*
           * Let the UI know the first
           * fetch completed even when
           * no events exist.
           */
          onEvents([]);
        }
      } catch (
        error
      ) {
        const normalized =
          error instanceof Error
            ? error
            : new Error(
                String(
                  error,
                ),
              );

        console.error(
          "Registry event feed failed:",
          normalized,
        );

        onError?.(
          normalized,
        );
      } finally {
        requestRunning =
          false;
      }
    };

  await poll(true);

  const interval =
    window.setInterval(
      () => {
        void poll();
      },
      POLL_INTERVAL_MS,
    );

  return {
    stop: () => {
      stopped =
        true;

      window.clearInterval(
        interval,
      );
    },
  };
}