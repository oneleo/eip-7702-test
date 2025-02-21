import { useState, useEffect } from "react";
import "./App.css";

import {
  HDNodeWallet,
  AbstractProvider,
  getDefaultProvider,
  JsonRpcProvider,
  AbiCoder,
  ZeroAddress,
  concat,
  TransactionRequest,
  Mnemonic,
  getAddress,
  dataLength,
} from "ethers";

import BatchCallDelegation from "../out/BatchCallDelegation.sol/BatchCallDelegation.json";
import {
  stringify,
  delay,
  getTransactionReceipt,
  getExplorerUrl,
} from "./util";

import { createWalletClient, http, parseEther, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  eip7702Actions,
  type SignAuthorizationReturnType,
} from "viem/experimental";

import { mekong } from "viem/chains";

function App() {
  const [nodeRpcUrl, setNodeRpcUrl] = useState<string>("");
  const [provider, setProvider] = useState<AbstractProvider>(
    getDefaultProvider()
  );
  const [chainId, setChainId] = useState<number>(0);

  const [eoaToContract, setEoaToContract] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );
  const [contractDeployer, setContractDeployer] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );
  const [receiverCaller, setReceiverCaller] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );

  const [targetContractAddress, setTargetContractAddress] =
    useState<string>(ZeroAddress);

  const [signedAuthorization, setSignedAuthorization] =
    useState<SignAuthorizationReturnType>({
      contractAddress: `0x`,
      chainId: 0,
      nonce: 0,
      r: "0x",
      s: "0x",
      yParity: 0,
    });
  const [transactionHash, setTransactionHash] = useState<string>(
    "0x3142de7ba571e18173d69232d00d8609543d2e4335ba2688c2495dbf7b9e689a"
  );

  const [executing, setExecuting] = useState<string>(``);
  const [message, setMessage] = useState<string>(``);
  const [errorMessage, setErrorMessage] = useState<string>(``);

  useEffect(() => {
    const rpcUrl = import.meta.env.VITE_NODE_RPC_URL;
    setNodeRpcUrl(rpcUrl);
    const pvd = new JsonRpcProvider(rpcUrl);
    setProvider(pvd);
    setTargetContractAddress("0xe432A91273a4201BD355190C20B6C86f9492bfB8");

    const mnemonic = Mnemonic.fromPhrase(import.meta.env.VITE_MNEMONIC);

    setEoaToContract(
      HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/0`).connect(pvd)
    );
    setContractDeployer(
      HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/1`).connect(pvd)
    );
    setReceiverCaller(
      HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/2`).connect(pvd)
    );

    const asyncFn = async () => {
      setExecuting(`Getting chain ID...`);
      const nwk = await pvd.getNetwork();
      const cId = Number(nwk.chainId);
      setChainId(cId);

      const msg = `Chain ID: ${cId}`;
      console.log(msg);
      setMessage(msg);
      setExecuting(``);
    };

    asyncFn();
  }, []);

  const deployTargetContract = async () => {
    setExecuting(`Deploying new target contract...`);
    const bytecode = BatchCallDelegation.bytecode.object;
    const abiCoder = AbiCoder.defaultAbiCoder();
    const constructorArgs = abiCoder.encode(
      ["address"],
      [contractDeployer.address]
    );
    const fullBytecode = concat([bytecode, constructorArgs]);
    const tx: TransactionRequest = { data: fullBytecode };

    try {
      const txResponse = await contractDeployer.sendTransaction(tx);

      // Error: could not coalesce error (error={ "code": -32601, "message": "method ignored by upstream: 7 upstream skipped" }, payload={ "id": 14, "jsonrpc": "2.0", "method": "eth_getTransactionReceipt", "params": [ "0x963dfdc25bf556bbfb295b17a34d5946aa289bae40cb8e9f4d71e9630f47e35f" ] }, code=UNKNOWN_ERROR, version=6.13.5)
      //   await txResponse.wait();
      await delay(9000);

      const txHash = txResponse.hash;

      const msg1 = `Deployment TX: ${getExplorerUrl(chainId)}tx/${txHash}`;

      console.log(msg1);
      setMessage(msg1);

      const txReceipt = await getTransactionReceipt(txHash);

      if (txReceipt?.created_contract.hash) {
        setTargetContractAddress(txReceipt?.created_contract.hash);
      }

      const msg2 = `Deployment TX Receipt: ${stringify(txReceipt)}`;

      console.log(msg2);
      setMessage(msg2);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  const getCode = async () => {
    setExecuting(`Getting code from EOA...`);
    try {
      const code = await provider.getCode(eoaToContract.address);
      const msg = `code: ${code}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  const signEoaToContractTx = async () => {
    setExecuting(`Signing transaction...`);

    const walletClient = createWalletClient({
      account: privateKeyToAccount(eoaToContract.privateKey as `0x${string}`),
      transport: http(nodeRpcUrl),
    }).extend(eip7702Actions());

    try {
      const nonce = await eoaToContract.getNonce();
      console.log(`Nonce now is: ${nonce}`);

      const viemEoaToContract = createWalletClient({
        account: privateKeyToAccount(eoaToContract.privateKey as `0x${string}`),
        transport: http(nodeRpcUrl),
      }).extend(eip7702Actions());

      // Refer: https://viem.sh/experimental/eip7702
      const auth = await viemEoaToContract.prepareAuthorization({
        contractAddress: targetContractAddress as `0x${string}`,
        chainId,
        nonce: nonce + 1,
      });
      const signedAuth = await walletClient.signAuthorization(auth);
      setSignedAuthorization(signedAuth);

      const msg = `Signed TX: ${stringify(signedAuth)}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  const signContractToEoaTx = async () => {
    setExecuting(`Signing transaction...`);
    const viemEoaToContract = createWalletClient({
      account: privateKeyToAccount(eoaToContract.privateKey as `0x${string}`),
      transport: http(nodeRpcUrl),
    }).extend(eip7702Actions());

    try {
      const nonce = await eoaToContract.getNonce();
      console.log(`Nonce now is: ${nonce}`);

      // Refer: https://viem.sh/experimental/eip7702
      const auth = await viemEoaToContract.prepareAuthorization({
        contractAddress: ZeroAddress as `0x${string}`,
        chainId,
        nonce: nonce + 1,
      });
      const signedAuth = await viemEoaToContract.signAuthorization(auth);
      setSignedAuthorization(signedAuth);

      const msg = `Signed TX: ${stringify(signedAuth)}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  const sendTransaction = async () => {
    setExecuting(`Sending transaction...`);
    const viemEoaToContract = createWalletClient({
      account: privateKeyToAccount(eoaToContract.privateKey as `0x${string}`),
      chain: mekong,
      transport: http(nodeRpcUrl),
    }).extend(eip7702Actions());

    try {
      // 2. Invoke the Contract's `execute` function to perform batch calls.
      const txHash = await viemEoaToContract.sendTransaction({
        authorizationList: [signedAuthorization],
        to: ZeroAddress as `0x${string}`,
      });
      setTransactionHash(txHash);

      const msg = `Sent TX: ${getExplorerUrl(chainId)}tx/${txHash}`;
      console.log(msg);
      setMessage(`${msg}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  const sendTransactionWithContractCalldata = async () => {
    setExecuting("Sending transaction with calldata...");
    const viemEoaToContract = createWalletClient({
      account: privateKeyToAccount(eoaToContract.privateKey as `0x${string}`),
      chain: mekong,
      transport: http(nodeRpcUrl),
    }).extend(eip7702Actions());

    try {
      // 2. Invoke the Contract's `execute` function to perform batch calls.
      const hash = await viemEoaToContract.sendTransaction({
        authorizationList: [signedAuthorization],
        data: encodeFunctionData({
          abi: BatchCallDelegation.abi,
          functionName: "execute",
          args: [
            [
              {
                data: "0x",
                to: receiverCaller.address as `0x${string}`,
                value: parseEther("0.001"),
              },
              {
                data: "0x",
                to: receiverCaller.address as `0x${string}`,
                value: parseEther("0.002"),
              },
            ],
          ],
        }),
        to: viemEoaToContract.account.address,
      });
      const msg = `Sent TX: ${getExplorerUrl(chainId)}tx/${hash}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  const handleTargetContractChange = (input: string) => {
    setTargetContractAddress(input);

    try {
      getAddress(input);
      setErrorMessage(``);
    } catch (error) {
      setErrorMessage(`Invalid address`);
    }
  };

  const handleTransactionHashChange = (input: string) => {
    setTransactionHash(input);
    try {
      dataLength(input) != 32;
    } catch (error) {
      setErrorMessage(`Invalid transaction hash`);
    }
  };

  const getTransaction = async () => {
    try {
      const txReceipt = await getTransactionReceipt(transactionHash);

      const msg = `Transaction Receipt: ${stringify(txReceipt)}`;
      console.log(msg);
      setMessage(msg);
      return txReceipt;
    } catch (error) {
      console.error("Error fetching transaction:", error);
    }
  };

  return (
    <>
      <h1>Vite + React</h1>

      <div className="card">
        <div>
          <label>
            EIP-7702 EOA/Contract:{" "}
            <a
              href={`${getExplorerUrl(chainId)}address/${
                eoaToContract.address
              }`}
              target="_blank"
            >
              {`${eoaToContract.address}`}
            </a>
          </label>
        </div>

        <div>
          <label>
            Target Contract:{" "}
            <input
              type="text"
              style={{ width: "350px" }}
              value={targetContractAddress}
              onChange={(e) => handleTargetContractChange(e.target.value)}
              placeholder="Enter target contract address"
            />
          </label>
        </div>
        <div>
          <a
            href={`${getExplorerUrl(chainId)}address/${targetContractAddress}`}
            target="_blank"
            style={{
              visibility: errorMessage ? "hidden" : "visible",
            }}
          >
            {`${getExplorerUrl(chainId)}address/${targetContractAddress}`}
          </a>
        </div>

        <div>
          {executing && (
            <div>
              <span>Status: </span>
              <span style={{ color: "white" }}>{executing}</span>
            </div>
          )}
          {errorMessage && (
            <div>
              <span>Error: </span>
              <span
                style={{
                  color: "red",
                  textAlign: "left",
                }}
              >
                {errorMessage}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* <div className="card">
        <button onClick={deployTargetContract} disabled={!!executing || !!errorMessage}>
          Deploy New Target Contract
        </button>
      </div> */}

      <div className="card">
        <button onClick={getCode} disabled={!!executing || !!errorMessage}>
          Get EIP-7702 EOA/Contract Code
        </button>
      </div>

      <div className="card">
        <button
          onClick={signEoaToContractTx}
          disabled={!!executing || !!errorMessage}
        >
          Sign EOA to Contract TX
        </button>
        <button
          onClick={signContractToEoaTx}
          disabled={!!executing || !!errorMessage}
        >
          Sign Contract to EOA TX
        </button>
      </div>

      <div className="card">
        <button
          onClick={sendTransaction}
          disabled={!!executing || !!errorMessage}
        >
          Send TX
        </button>
        <button
          onClick={sendTransactionWithContractCalldata}
          disabled={!!executing || !!errorMessage}
        >
          Send TX with Contract Calldata
        </button>
      </div>

      <div>
        <label>
          Transaction Hash:{" "}
          <input
            type="text"
            style={{ width: "500px" }}
            value={transactionHash}
            onChange={(e) => handleTransactionHashChange(e.target.value)}
            placeholder="Enter recipient address"
          />
        </label>
      </div>
      <div>
        <button
          onClick={getTransaction}
          disabled={!!executing || !!errorMessage}
        >
          Get Transaction Receipt
        </button>
      </div>

      <div className="card">
        Message:{" "}
        {message && (
          <pre
            style={{
              color: "white",
              textAlign: "left",
            }}
          >
            {message}
          </pre>
        )}
      </div>

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
