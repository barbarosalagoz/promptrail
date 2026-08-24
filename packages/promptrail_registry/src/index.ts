import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CD5OS7U3PO3TFSRKZXV4ZH3AQFKWZSGAPE6ENGBBXCQRLTGDCZF5XB26",
  }
} as const

export type DataKey = {tag: "Endpoint", values: readonly [string]};


export interface Endpoint {
  active: boolean;
  name: string;
  owner: string;
  price: i128;
}


export const RegistryError = {
  1: {message:"EmptyName"},
  2: {message:"NameTooLong"},
  3: {message:"InvalidPrice"},
  4: {message:"EndpointNotFound"},
  5: {message:"EndpointExists"},
  6: {message:"Unauthorized"}
}



export interface Client {
  /**
   * Construct and simulate a get transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register: ({owner, name, price}: {owner: string, name: string, price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>

  /**
   * Construct and simulate a set_active transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_active: ({owner, active}: {owner: string, active: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>

  /**
   * Construct and simulate a update_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_price: ({owner, new_price}: {owner: string, new_price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Endpoint>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAQAAAAEAAAAAAAAACEVuZHBvaW50AAAAAQAAABM=",
        "AAAAAQAAAAAAAAAAAAAACEVuZHBvaW50AAAABAAAAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAs=",
        "AAAABQAAAAAAAAAAAAAADFByaWNlVXBkYXRlZAAAAAEAAAANcHJpY2VfdXBkYXRlZAAAAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACW9sZF9wcmljZQAAAAAAAAsAAAAAAAAAAAAAAAluZXdfcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAABAAAAAAAAAAAAAAADVJlZ2lzdHJ5RXJyb3IAAAAAAAAGAAAAAAAAAAlFbXB0eU5hbWUAAAAAAAABAAAAAAAAAAtOYW1lVG9vTG9uZwAAAAACAAAAAAAAAAxJbnZhbGlkUHJpY2UAAAADAAAAAAAAABBFbmRwb2ludE5vdEZvdW5kAAAABAAAAAAAAAAORW5kcG9pbnRFeGlzdHMAAAAAAAUAAAAAAAAADFVuYXV0aG9yaXplZAAAAAY=",
        "AAAABQAAAAAAAAAAAAAADVN0YXR1c0NoYW5nZWQAAAAAAAABAAAADnN0YXR1c19jaGFuZ2VkAAAAAAACAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEkVuZHBvaW50UmVnaXN0ZXJlZAAAAAAAAQAAABNlbmRwb2ludF9yZWdpc3RlcmVkAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAADZ2V0AAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAPpAAAH0AAAAAhFbmRwb2ludAAAB9AAAAANUmVnaXN0cnlFcnJvcgAAAA==",
        "AAAAAAAAAAAAAAAIcmVnaXN0ZXIAAAADAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAVwcmljZQAAAAAAAAsAAAABAAAD6QAAB9AAAAAIRW5kcG9pbnQAAAfQAAAADVJlZ2lzdHJ5RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAAKc2V0X2FjdGl2ZQAAAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAABAAAD6QAAB9AAAAAIRW5kcG9pbnQAAAfQAAAADVJlZ2lzdHJ5RXJyb3IAAAA=",
        "AAAAAAAAAAAAAAAMdXBkYXRlX3ByaWNlAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAluZXdfcHJpY2UAAAAAAAALAAAAAQAAA+kAAAfQAAAACEVuZHBvaW50AAAH0AAAAA1SZWdpc3RyeUVycm9yAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    get: this.txFromJSON<Result<Endpoint>>,
        register: this.txFromJSON<Result<Endpoint>>,
        set_active: this.txFromJSON<Result<Endpoint>>,
        update_price: this.txFromJSON<Result<Endpoint>>
  }
}