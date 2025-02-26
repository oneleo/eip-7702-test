import "~/src/App.css";
import { Eip6963ProviderContextProvider } from "~/src/context/eip6963Provider";
import { EIP7702 } from "~/src/component/eip7702";
import { DiscoverWalletProviders } from "~/src/component/walletProviders";

function App() {
  return (
    <Eip6963ProviderContextProvider>
      <h1>Vite + React</h1>
      <DiscoverWalletProviders />
      <EIP7702 />
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </Eip6963ProviderContextProvider>
  );
}

export default App;
