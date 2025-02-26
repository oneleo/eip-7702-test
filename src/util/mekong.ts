export type Fee = {
  type: "maximum" | "actual";
  value: string;
};

export type AddressParam = {
  hash: string;
  implementation_name: string;
  name: string;
  ens_domain_name?: string;
  metadata: Record<string, any>;
  is_contract: boolean;
  private_tags?: AddressTag[];
  watchlist_names?: WatchlistName[];
  public_tags?: AddressTag[];
  is_verified: boolean;
};

export type AddressTag = {
  address_hash: string;
  display_name: string;
  label: string;
};

export type WatchlistName = {
  display_name: string;
  label: string;
};

export type TokenTransfer = {
  // Define the TokenTransfer fields as needed
};

export type TransactionAction =
  | TransactionActionAaveV3LiquidationCall
  | TransactionActionAaveV3BSWRF
  | TransactionActionAaveV3EnableDisableCollateral
  | TransactionActionUniswapV3MintNFT
  | TransactionActionUniswapV3BCS;

export type TransactionActionAaveV3LiquidationCall = {
  data: Record<string, any>;
  protocol: "aave_v3";
  type: "liquidation_call";
};

export type TransactionActionAaveV3BSWRF = {
  data: Record<string, any>;
  protocol: "aave_v3";
  type: "borrow" | "supply" | "withdraw" | "repay" | "flash_loan";
};

export type TransactionActionAaveV3EnableDisableCollateral = {
  data: Record<string, any>;
  protocol: "aave_v3";
  type: "enable_collateral" | "disable_collateral";
};

export type TransactionActionUniswapV3MintNFT = {
  data: Record<string, any>;
  protocol: "uniswap_v3";
  type: "mint_nft";
};

export type TransactionActionUniswapV3BCS = {
  data: Record<string, any>;
  protocol: "uniswap_v3";
  type: "burn" | "collect" | "swap";
};

export type DecodedInputParameter = {
  name: string;
  type: string;
  value: string;
};

export type DecodedInput = {
  method_call: string;
  method_id: string;
  parameters: DecodedInputParameter[];
};

export type Transaction = {
  timestamp: string;
  fee: Fee;
  gas_limit: number;
  block_number: number;
  status: "ok" | "error";
  method: string;
  confirmations: number;
  type: number;
  exchange_rate: string;
  to: AddressParam;
  transaction_burnt_fee: string;
  max_fee_per_gas: string;
  result: string;
  hash: string;
  gas_price: string;
  priority_fee: string;
  base_fee_per_gas: string;
  from: AddressParam;
  token_transfers: TokenTransfer[];
  transaction_types: string[];
  gas_used: string;
  created_contract: AddressParam;
  position: number;
  nonce: number;
  has_error_in_internal_transactions: boolean;
  actions: TransactionAction[];
  decoded_input: DecodedInput;
  token_transfers_overflow: boolean;
  raw_input: string;
  value: string;
  max_priority_fee_per_gas: string;
  revert_reason: string;
  confirmation_duration: number[];
  transaction_tag: string;
};

export const getTransactionReceipt = async (
  hash: string
): Promise<Transaction | null> => {
  const fetchUrl = `https://explorer-api.mekong.ethpandaops.io/api/v2/transactions/${hash}`;

  try {
    const response = await fetch(fetchUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Network error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    if (!data) {
      return null;
    }

    return data as Transaction;
  } catch (error) {
    console.error(
      `Error fetching transaction receipt: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
};
