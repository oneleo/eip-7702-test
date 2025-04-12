import {
  Signer,
  Contract,
  Interface,
  ContractRunner,
  ContractTransactionReceipt,
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

export const logNonces = async (
  title: string,
  signers: Signer[],
  symbols: string[] = ["Signer1", "Signer2", "Signer3"]
): Promise<string> => {
  const rawNonces = await Promise.all(
    signers.map((signer) => signer.getNonce("pending"))
  );
  const bigIntNonces = rawNonces.map((nonce) => BigInt(nonce));

  const details = bigIntNonces
    .map((nonce, i) => `${symbols[i]} nonce: ${nonce}`)
    .join("\n");

  return `${title}:\n${details}`;
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
