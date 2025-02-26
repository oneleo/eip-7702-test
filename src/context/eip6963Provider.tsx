import { useState, createContext, useContext, type ReactNode } from "react";

import { type EIP6963ProviderDetail } from "~/src/util/eip6963";

interface eip6963ProviderContextType {
  eip6963Provider: EIP6963ProviderDetail | null;
  connectWallet: (providerWithInfo: EIP6963ProviderDetail) => Promise<void>;
  disconnectWallet: () => void;
}

const Eip6963ProviderContext = createContext<
  eip6963ProviderContextType | undefined
>(undefined);

export function Eip6963ProviderContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedWallet, setSelectedWallet] =
    useState<EIP6963ProviderDetail | null>(null);

  const connectWallet = async (providerWithInfo: EIP6963ProviderDetail) => {
    try {
      const accounts: string[] | undefined = (await providerWithInfo.provider
        .request({ method: "eth_requestAccounts" })
        .catch(console.error)) as string[] | undefined;

      if (accounts?.[0]) {
        setSelectedWallet(providerWithInfo);
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  const disconnectWallet = () => {
    setSelectedWallet(null);
  };

  return (
    <Eip6963ProviderContext.Provider
      value={{
        eip6963Provider: selectedWallet,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </Eip6963ProviderContext.Provider>
  );
}

export const useEip6963Provider = () => {
  const context = useContext(Eip6963ProviderContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
