import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
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
};
export const RegistryError = {
    1: { message: "EmptyName" },
    2: { message: "NameTooLong" },
    3: { message: "InvalidPrice" },
    4: { message: "EndpointNotFound" },
    5: { message: "EndpointExists" },
    6: { message: "Unauthorized" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy(null, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAQAAAAEAAAAAAAAACEVuZHBvaW50AAAAAQAAABM=",
            "AAAAAQAAAAAAAAAAAAAACEVuZHBvaW50AAAABAAAAAAAAAAGYWN0aXZlAAAAAAABAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAs=",
            "AAAABQAAAAAAAAAAAAAADFByaWNlVXBkYXRlZAAAAAEAAAANcHJpY2VfdXBkYXRlZAAAAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAACW9sZF9wcmljZQAAAAAAAAsAAAAAAAAAAAAAAAluZXdfcHJpY2UAAAAAAAALAAAAAAAAAAI=",
            "AAAABAAAAAAAAAAAAAAADVJlZ2lzdHJ5RXJyb3IAAAAAAAAGAAAAAAAAAAlFbXB0eU5hbWUAAAAAAAABAAAAAAAAAAtOYW1lVG9vTG9uZwAAAAACAAAAAAAAAAxJbnZhbGlkUHJpY2UAAAADAAAAAAAAABBFbmRwb2ludE5vdEZvdW5kAAAABAAAAAAAAAAORW5kcG9pbnRFeGlzdHMAAAAAAAUAAAAAAAAADFVuYXV0aG9yaXplZAAAAAY=",
            "AAAABQAAAAAAAAAAAAAADVN0YXR1c0NoYW5nZWQAAAAAAAABAAAADnN0YXR1c19jaGFuZ2VkAAAAAAACAAAAAAAAAAVvd25lcgAAAAAAABMAAAABAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAAAAAAAAg==",
            "AAAABQAAAAAAAAAAAAAAEkVuZHBvaW50UmVnaXN0ZXJlZAAAAAAAAQAAABNlbmRwb2ludF9yZWdpc3RlcmVkAAAAAAMAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAAAI=",
            "AAAAAAAAAAAAAAADZ2V0AAAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAEAAAPpAAAH0AAAAAhFbmRwb2ludAAAB9AAAAANUmVnaXN0cnlFcnJvcgAAAA==",
            "AAAAAAAAAAAAAAAIcmVnaXN0ZXIAAAADAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAVwcmljZQAAAAAAAAsAAAABAAAD6QAAB9AAAAAIRW5kcG9pbnQAAAfQAAAADVJlZ2lzdHJ5RXJyb3IAAAA=",
            "AAAAAAAAAAAAAAAKc2V0X2FjdGl2ZQAAAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAZhY3RpdmUAAAAAAAEAAAABAAAD6QAAB9AAAAAIRW5kcG9pbnQAAAfQAAAADVJlZ2lzdHJ5RXJyb3IAAAA=",
            "AAAAAAAAAAAAAAAMdXBkYXRlX3ByaWNlAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAluZXdfcHJpY2UAAAAAAAALAAAAAQAAA+kAAAfQAAAACEVuZHBvaW50AAAH0AAAAA1SZWdpc3RyeUVycm9yAAAA"]), options);
        this.options = options;
    }
    fromJSON = {
        get: (this.txFromJSON),
        register: (this.txFromJSON),
        set_active: (this.txFromJSON),
        update_price: (this.txFromJSON)
    };
}
