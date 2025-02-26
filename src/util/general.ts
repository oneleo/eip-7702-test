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
    default: {
      return `https://explorer.mekong.ethpandaops.io/`;
    }
  }
};
