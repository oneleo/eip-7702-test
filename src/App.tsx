import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

import { JsonRpcProvider, Wallet } from "ethers";

import { createWalletClient, http, parseEther, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mekong } from "viem/chains";
import {
  eip7702Actions,
  type PrepareAuthorizationReturnType,
  type SignAuthorizationReturnType,
} from "viem/experimental";

const mekongProvider = new JsonRpcProvider(
  import.meta.env.VITE_MEKONG_NODE_RPC_URL
);
const chainId = parseInt(import.meta.env.VITE_CHAIN_ID);
const privateKey = import.meta.env.VITE_PRIVATE_KEY;
const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
const receiver = import.meta.env.VITE_RECEIVER_ADDRESS;

const wallet = new Wallet(privateKey, mekongProvider);
const walletClient = createWalletClient({
  account: privateKeyToAccount(privateKey),
  chain: mekong,
  transport: http(),
}).extend(eip7702Actions());

function App() {
  const [authorization, setAuthorization] =
    useState<PrepareAuthorizationReturnType>({
      contractAddress,
      chainId,
      nonce: 0,
    });
  const [signedAuthorization, setSignedAuthorization] =
    useState<SignAuthorizationReturnType>({
      contractAddress,
      chainId,
      nonce: 0,
      r: "0x",
      s: "0x",
      yParity: 0,
    });
  const [executing, setExecuting] = useState<boolean>(false);

  const prepareAuthorization = async () => {
    setExecuting(true);
    // console.log(`walletClient: ${stringify(walletClient)}`);

    try {
      const nonce = await wallet.getNonce();
      console.log(`nonce: ${nonce}`);

      // Refer: https://viem.sh/experimental/eip7702
      const auth = await walletClient.prepareAuthorization({
        contractAddress,
        chainId,
        nonce: nonce + 1,
      });
      setAuthorization(auth);
      console.log(`authorization: ${stringify(authorization)}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(false);
  };

  const signAuthorization = async () => {
    setExecuting(true);
    try {
      // 1. Authorize injection of the Contract's bytecode into our Account.
      const signedAuth = await walletClient.signAuthorization(authorization);
      setSignedAuthorization(signedAuth);
      console.log(`signedAuthorization: ${stringify(signedAuth)}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(false);
  };

  const sendBatchEther = async () => {
    setExecuting(true);

    try {
      // 2. Invoke the Contract's `execute` function to perform batch calls.
      const hash = await walletClient.sendTransaction({
        authorizationList: [signedAuthorization],
        data: encodeFunctionData({
          abi,
          functionName: "execute",
          args: [
            [
              {
                data: "0x",
                to: receiver,
                value: parseEther("0.001"),
              },
              {
                data: "0x",
                to: receiver,
                value: parseEther("0.002"),
              },
            ],
          ],
        }),
        to: walletClient.account.address,
      });
      console.log(`hash: https://explorer.mekong.ethpandaops.io/tx/${hash}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(false);
  };

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={prepareAuthorization} disabled={executing}>
          Prepare Authorization
        </button>
        <button onClick={signAuthorization} disabled={executing}>
          Sign Authorization
        </button>
        <button onClick={sendBatchEther} disabled={executing}>
          Send Batch Ether
        </button>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;

const abi = [
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          {
            name: "data",
            type: "bytes",
          },
          {
            name: "to",
            type: "address",
          },
          {
            name: "value",
            type: "uint256",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

const stringify = (info: any) =>
  JSON.stringify(
    info,
    (_, value) => {
      return typeof value === "bigint" ? value.toString() : value;
    },
    2
  );
