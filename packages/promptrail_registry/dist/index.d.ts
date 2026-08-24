import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, Result } from "@stellar/stellar-sdk/contract";
import type { i128 } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CD5OS7U3PO3TFSRKZXV4ZH3AQFKWZSGAPE6ENGBBXCQRLTGDCZF5XB26";
    };
};
export type DataKey = {
    tag: "Endpoint";
    values: readonly [string];
};
export interface Endpoint {
    active: boolean;
    name: string;
    owner: string;
    price: i128;
}
export declare const RegistryError: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
};
export interface Client {
    /**
     * Construct and simulate a get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get: ({ owner }: {
        owner: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>;
    /**
     * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    register: ({ owner, name, price }: {
        owner: string;
        name: string;
        price: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>;
    /**
     * Construct and simulate a set_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    set_active: ({ owner, active }: {
        owner: string;
        active: boolean;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>;
    /**
     * Construct and simulate a update_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    update_price: ({ owner, new_price }: {
        owner: string;
        new_price: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        get: (json: string) => AssembledTransaction<Result<Endpoint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        register: (json: string) => AssembledTransaction<Result<Endpoint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        set_active: (json: string) => AssembledTransaction<Result<Endpoint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
        update_price: (json: string) => AssembledTransaction<Result<Endpoint, import("@stellar/stellar-sdk/contract").ErrorMessage>>;
    };
}
