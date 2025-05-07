import {
  BrowserProvider,
  Contract,
  ContractRunner,
  ContractTransactionReceipt,
  Interface,
  Signature,
  Signer,
  hexlify,
  isHexString,
  randomBytes,
  recoverAddress,
  toBeHex,
} from "ethers";

export const stringify = (info: any) =>
  JSON.stringify(
    info,
    (_, value) => {
      return typeof value === "bigint" ? value.toString() : value;
    },
    2
  );

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const fetchChainId = async (
  provider: BrowserProvider
): Promise<number> => {
  try {
    const network = await provider.getNetwork();
    return Number(network.chainId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to get chain id: ${errorMessage}`);
  }
  return 0;
};

export const fetchClientVersion = async (
  provider: BrowserProvider
): Promise<string> => {
  try {
    return await provider.send(`web3_clientVersion`, []);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to get client version: ${errorMessage}`);
  }
  return ``;
};

export const formatNoncesText = async (
  title: string,
  signers: Signer[],
  symbols: string[] = ["Signer1", "Signer2", "Signer3"]
): Promise<string> => {
  try {
    const rawNonces = await Promise.all(
      signers.map((signer) => signer.getNonce("pending"))
    );
    const bigIntNonces = rawNonces.map((nonce) => BigInt(nonce));
    const details = bigIntNonces
      .map((nonce, i) => `${symbols[i]} nonce: ${nonce}`)
      .join("\n");
    return `${title}:\n${details}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to get nonce: ${errorMessage}`);
  }
  return ``;
};

export const getExplorerUrl = (chainId: number): string => {
  switch (chainId) {
    case 7078815900: {
      return `https://explorer.mekong.ethpandaops.io/`;
    }
    case 11155111: {
      return `https://sepolia.etherscan.io/`;
    }
    case 17000: {
      return `https://holesky.etherscan.io/`;
    }
    case 560048: {
      return `https://hoodi.etherscan.io/`;
    }
    default: {
      return `https://explorer.mekong.ethpandaops.io/`;
    }
  }
};

export type AuthorizationListItem = {
  address: string;
  chainId: string; // hex string
  nonce: string; // hex string
  r: string;
  s: string;
  yParity: string; // hex string
};

export type AccessListItem = {
  address: string;
  storageKeys: string[];
};

export type RawTransactionResponse = {
  accessList: AccessListItem[];
  authorizationList: AuthorizationListItem[];
  blockHash: string;
  blockNumber: string;
  chainId: string;
  from: string;
  gas: string;
  gasPrice: string;
  hash: string;
  input: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  nonce: string;
  r: string;
  s: string;
  to: string;
  transactionIndex: string;
  type: string;
  v: string;
  value: string;
  yParity: string;
};

export const getTransactionViaRpc = async (
  provider: BrowserProvider,
  transactionHash: string
): Promise<RawTransactionResponse | null> => {
  if (!isHexString(transactionHash)) {
    return null;
  }

  try {
    return await (provider as BrowserProvider).send(
      `eth_getTransactionByHash`,
      [transactionHash]
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to get transaction response: ${errorMessage}`);
  }
  return null;
};

const CURVE_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

export const generateSignature = (
  unsignedDigest: string
): { signature: Signature; signerAddress: string } => {
  let attempts = 0;

  while (true) {
    attempts++;

    // Generate canonical s (s <= N / 2)
    const sRaw = BigInt(hexlify(randomBytes(32))) % CURVE_N;
    const s = sRaw > CURVE_N / 2n ? CURVE_N - sRaw : sRaw;

    // Random r (32 bytes)
    const r = hexlify(randomBytes(32));
    // const r = hexlify(`0x${"e".repeat(64)}`);

    // v is usually 0x1b or 0x1c (27 or 28)
    const v = Math.random() > 0.5 ? "0x1b" : "0x1c";

    const signature = Signature.from({ r, s: toBeHex(s, 32), v });

    try {
      // Check if recoverAddress works with this signature
      const signer = recoverAddress(unsignedDigest, signature);
      console.log(`Valid signature found after ${attempts} tries`);
      return { signature, signerAddress: signer };
    } catch {
      // Try again on failure
      continue;
    }
  }
};

export type Call = {
  data: string;
  to: string;
  value: bigint;
};

export class BatchCallDelegationContract {
  private static abi = [
    "function execute(tuple(bytes data, address to, uint256 value)[] calls) external payable",
  ];

  public readonly address: string;
  private batchCall: Contract;

  public static init(address: string, singer: ContractRunner) {
    const batchCall = new Contract(
      address as string,
      BatchCallDelegationContract.abi,
      singer
    );
    return new BatchCallDelegationContract(batchCall, address);
  }

  private constructor(batchCall: Contract, address: string) {
    this.batchCall = batchCall;
    this.address = address;
  }

  public async execute(calls: Call[]): Promise<ContractTransactionReceipt> {
    const tx = await this.batchCall.execute(calls);
    return await tx.wait();
  }

  public static encodeExecuteData(calls: Call[]) {
    const iface = new Interface(BatchCallDelegationContract.abi);
    return iface.encodeFunctionData("execute", [calls]);
  }
}
