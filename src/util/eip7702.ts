// Refer: https://github.com/5afe/safe-eip7702
import {
  concat,
  toBeHex,
  keccak256,
  encodeRlp,
  toBeArray,
  getBigInt,
  SigningKey,
  ZeroAddress,
  accessListify,
  computeAddress,
  type Provider,
  type BytesLike,
  type Signature,
  type AddressLike,
  type BigNumberish,
  type AccessListish,
} from "ethers";

export type AuthorizationListEntryAny = {
  chainId: bigint;
  address: string;
  nonce: bigint;
  yParity: any;
  r: any;
  s: any;
};

export type AuthEntry7702RLPType = [
  Uint8Array,
  string,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array
];

export type Auth7702RLPType = Array<AuthEntry7702RLPType>;

const formatNumber = (_value: BigNumberish): Uint8Array => {
  const value = getBigInt(_value, "value");
  return toBeArray(value);
};

const formatAccessList = (
  value: AccessListish
): Array<[string, Array<string>]> => {
  return accessListify(value).map((set) => [set.address, set.storageKeys]);
};

export const encodeRLPAuthorizationEntryUnsigned = (
  chainId: bigint,
  address: any,
  nonce: bigint
): string => {
  // MAGIC = "0x05" defined in ERC-7702
  return concat([
    "0x05",
    encodeRlp([formatNumber(chainId), address, formatNumber(nonce)]),
  ]);
};

const formatAuthorizationEntry = (
  set: AuthorizationListEntryAny
): AuthEntry7702RLPType => {
  return [
    formatNumber(set.chainId),
    set.address,
    formatNumber(set.nonce),
    formatNumber(set.yParity),
    toBeArray(set.r),
    toBeArray(set.s),
  ];
};

const formatAuthorizationList = (
  value: AuthorizationListEntryAny[]
): Auth7702RLPType => {
  return value.map((set: AuthorizationListEntryAny) =>
    formatAuthorizationEntry(set)
  );
};

// Refer: https://github.com/5afe/safe-eip7702/blob/main/safe-eip7702-contracts/src/utils/encodeRLP.ts
export const serializeEip7702 = (tx: any, sig: null | Signature): string => {
  const fields: Array<any> = [
    formatNumber(tx.chainId),
    formatNumber(tx.nonce),
    formatNumber(tx.maxPriorityFeePerGas || 0),
    formatNumber(tx.maxFeePerGas || 0),
    formatNumber(tx.gasLimit),
    tx.to,
    formatNumber(tx.value),
    tx.data,
    formatAccessList(tx.accessList || []),
    formatAuthorizationList(tx.authorizationList || []),
  ];

  if (sig) {
    fields.push(formatNumber(sig.yParity));
    fields.push(toBeArray(sig.r));
    fields.push(toBeArray(sig.s));
  }

  return concat(["0x04", encodeRlp(fields)]);
};

export const getAuthorizationList = (
  chainId: bigint,
  nonce: bigint,
  privateKey: BytesLike,
  authorizer: string
): AuthorizationListEntryAny[] => {
  const dataToSign = encodeRLPAuthorizationEntryUnsigned(
    chainId,
    authorizer,
    nonce
  );
  const authHash = keccak256(dataToSign);
  const authSignature = new SigningKey(privateKey).sign(authHash);

  // [[chain_id, address, nonce, y_parity, r, s]]
  return [
    {
      chainId: chainId,
      address: authorizer,
      nonce: nonce,
      yParity: authSignature.yParity,
      r: authSignature.r,
      s: authSignature.s,
    },
  ];
};

export const getSignedTransaction = async (
  provider: Provider,
  relayerSigningKey: SigningKey,
  authorizationList: AuthorizationListEntryAny[],
  to: AddressLike = ZeroAddress,
  value: BigNumberish = 0,
  data: BytesLike = "0x",
  nonce?: number
) => {
  const relayerAddress = computeAddress(relayerSigningKey.publicKey);
  const relayerNonce =
    nonce || (await provider.getTransactionCount(relayerAddress));
  const tx = {
    from: relayerAddress,
    nonce: relayerNonce,
    gasLimit: toBeHex(21000000),
    gasPrice: toBeHex(3100),
    data: data,
    to: to,
    value: value,
    chainId: (await provider.getNetwork()).chainId,
    type: 4,
    maxFeePerGas: toBeHex(30000),
    maxPriorityFeePerGas: toBeHex(30000),
    accessList: [],
    authorizationList: authorizationList,
  };

  const encodedTx = serializeEip7702(tx, null);
  const txHashToSign = keccak256(encodedTx);
  const signature = relayerSigningKey.sign(txHashToSign);
  return serializeEip7702(tx, signature);
};

export const ACCOUNT_CODE_PREFIX = "0xef0100";
