import { useEffect, useState } from "react";

import { useEip6963Provider } from "~/src/context/eip6963Provider";
import { useSyncProviders } from "~/src/hook/useSyncProviders";
import { type EIP6963ProviderDetail } from "~/src/util/eip6963";

export const DiscoverWalletProviders = () => {
  const { eip6963Provider, connectWallet, disconnectWallet } =
    useEip6963Provider();
  const [userAccount, setUserAccount] = useState<string>("");
  const providers = useSyncProviders();

  useEffect(() => {
    setUserAccount("");

    const fetchAccount = async () => {
      const accounts: string[] | undefined = (await eip6963Provider?.provider
        .request({ method: "eth_requestAccounts" })
        .catch(console.error)) as string[] | undefined;

      if (accounts?.[0]) {
        setUserAccount(accounts?.[0]);
      }
    };

    fetchAccount();
  }, [eip6963Provider]);

  return (
    <>
      {userAccount ? (
        <></>
      ) : (
        <>
          <h2>Wallets Detected:</h2>
          <div>
            {providers.length > 0 ? (
              providers?.map((provider: EIP6963ProviderDetail) => (
                <button
                  key={provider.info.uuid}
                  onClick={() => connectWallet(provider)}
                >
                  <img src={provider.info.icon} alt={provider.info.name} />
                  <div>{provider.info.name}</div>
                </button>
              ))
            ) : (
              <div>No Announced Wallet Providers</div>
            )}
          </div>
        </>
      )}
      <h2>{userAccount ? "" : "No "}Wallet Selected</h2>
      {userAccount && (
        <div>
          <div>
            <img
              src={eip6963Provider?.info.icon}
              alt={eip6963Provider?.info.name}
            />
            <div>{eip6963Provider?.info.name}</div>
          </div>
          <button
            onClick={disconnectWallet}
            style={{ marginTop: "10px", color: "red" }}
          >
            Disconnect Wallet
          </button>
        </div>
      )}
      <hr />
    </>
  );
};
