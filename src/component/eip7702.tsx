import { useState, useEffect } from "react";
import {
  concat,
  AbiCoder,
  Mnemonic,
  Contract,
  Interface,
  parseUnits,
  getAddress,
  dataLength,
  ZeroAddress,
  HDNodeWallet,
  BrowserProvider,
  AbstractProvider,
  getDefaultProvider,
  TransactionRequest,
  ZeroHash,
} from "ethers";

import { stringify, getExplorerUrl } from "~/src/util/general";
import { useEip6963Provider } from "~/src/context/eip6963Provider";

import BatchCallDelegation from "~/out/BatchCallDelegation.sol/BatchCallDelegation.json";

const TARGET_CONTRACT_ADDRESS_KEY = `TargetContractAddressKey`;
const TRANSACTION_HASH_KEY = `TransactionHashKey`;

export function EIP7702() {
  const { eip6963Provider } = useEip6963Provider();
  const [provider, setProvider] = useState<AbstractProvider>(
    getDefaultProvider()
  );
  const [chainId, setChainId] = useState<number>(0);

  const [delegator, setDelegator] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );
  const [relayer, setRelayer] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );
  const [receiver, setReceiver] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );

  const [targetContractAddress, setTargetContractAddress] = useState<string>(
    () => {
      const savedData = localStorage.getItem(TARGET_CONTRACT_ADDRESS_KEY);
      return savedData ? savedData : ZeroAddress;
    }
  );
  const [transactionHash, setTransactionHash] = useState<string>(() => {
    const savedData = localStorage.getItem(TRANSACTION_HASH_KEY);
    return savedData ? savedData : ZeroHash;
  });

  const [executing, setExecuting] = useState<string>(``);
  const [message, setMessage] = useState<string>(``);
  const [errorMessage, setErrorMessage] = useState<string>(``);

  useEffect(() => {
    const fetchChainId = async () => {
      if (eip6963Provider) {
        const pvd = new BrowserProvider(eip6963Provider.provider);
        const network = await pvd.getNetwork();
        console.log(`ChainId from Metamask: ${network.chainId}`);
      }
    };

    fetchChainId();
  }, [eip6963Provider]);

  useEffect(() => {
    if (!eip6963Provider) {
      setErrorMessage(`No Wallet Selected`);
      return;
    }
    setErrorMessage(``);
    const pvd = new BrowserProvider(eip6963Provider.provider);
    setProvider(pvd);

    const mnemonic = Mnemonic.fromPhrase(import.meta.env.VITE_MNEMONIC);

    setDelegator(
      HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/0`).connect(pvd)
    );
    setRelayer(
      HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/1`).connect(pvd)
    );
    setReceiver(
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
  }, [eip6963Provider]);

  // -----------------
  // --- Test Area ---
  // -----------------

  const getNonce = async () => {
    setExecuting(`Querying nonce...`);
    const [delegatorNonce, relayerNonce, receiverNonce] = await Promise.all([
      delegator.getNonce("pending"),
      relayer.getNonce("pending"),
      receiver.getNonce("pending"),
    ]);
    console.log(
      `Delegator nonce: ${delegatorNonce}\nRelayer nonce:${relayerNonce}\nReceiver nonce: ${receiverNonce}`
    );
    setExecuting(``);
  };

  const getFeeData = async () => {
    setExecuting(`Querying fee data...`);
    const feeData = await provider.getFeeData();
    console.log(`feeData: ${stringify(feeData)}`);
    setExecuting(``);
  };

  // ---------------------------
  // --- Set Target Contract ---
  // ---------------------------

  // Deploy new target contract
  const deployTargetContract = async () => {
    setExecuting(`Deploying new target contract...`);
    const bytecode = BatchCallDelegation.bytecode.object;
    const abiCoder = AbiCoder.defaultAbiCoder();
    const constructorArgs = abiCoder.encode(["address"], [relayer.address]);
    const fullBytecode = concat([bytecode, constructorArgs]);
    const tx: TransactionRequest = {
      data: fullBytecode,
    };

    try {
      // Send transaction by relayer
      const txResponse = await relayer.sendTransaction(tx);
      console.log(`sending tx...`);
      const txReceipt = await txResponse.wait();
      console.log(`done!`);

      const txHash = txResponse.hash;
      setTransactionHash(txHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash);

      const msg1 = `Deployment TX: ${getExplorerUrl(chainId)}tx/${txHash}`;
      console.log(msg1);

      const contractAddress = txReceipt?.contractAddress;
      if (contractAddress) {
        setTargetContractAddress(contractAddress);
        localStorage.setItem(TARGET_CONTRACT_ADDRESS_KEY, contractAddress);
      }

      const msg2 = `Deployment TX Receipt: ${stringify(txReceipt)}`;

      console.log(msg2);
      setMessage(`${msg2}\n${msg1}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // Initial deployed target contract
  const initialTargetContract = async () => {
    setExecuting(`Initialing target contract...`);

    const targetContractIface = new Interface(BatchCallDelegation.abi);
    const initializeData = targetContractIface.encodeFunctionData(
      "initialize",
      [333]
    );
    const setUintToKey1Data = targetContractIface.encodeFunctionData(
      "setUintToKey1",
      [666]
    );

    try {
      const feeData = await provider.getFeeData();
      console.log(`feeData: ${stringify(feeData)}`);

      const initializeTx: TransactionRequest = {
        to: targetContractAddress,
        from: relayer.address,
        data: initializeData,
        value: 0,
        nonce: await provider.getTransactionCount(relayer.address, "pending"),
        chainId,
        gasLimit: await provider.estimateGas({
          from: relayer.address,
          to: targetContractAddress,
          data: initializeData,
        }),
        maxFeePerGas: feeData.maxFeePerGas || parseUnits("30", "gwei"),
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas || parseUnits("2", "gwei"),
      };
      console.log(`initializeTx: ${stringify(initializeTx)}`);

      // Send transaction by relayer
      const initializeTxResponse = await relayer.sendTransaction(initializeTx);
      await initializeTxResponse.wait();

      const initializeTxHash = initializeTxResponse.hash;
      setTransactionHash(initializeTxHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, initializeTxHash);

      const setUintToKey1Tx: TransactionRequest = {
        to: targetContractAddress,
        from: relayer.address,
        data: setUintToKey1Data,
        value: 0,
        nonce: await provider.getTransactionCount(relayer.address, "pending"),
        chainId,
        gasLimit: await provider.estimateGas({
          from: relayer.address,
          to: targetContractAddress,
          data: setUintToKey1Data,
        }),
        maxFeePerGas: feeData.maxFeePerGas || parseUnits("30", "gwei"),
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas || parseUnits("2", "gwei"),
      };
      console.log(`setUintToKey1Tx: ${stringify(setUintToKey1Tx)}`);

      // Send transaction by relayer
      const setUintToKey1TxResponse = await relayer.sendTransaction(
        setUintToKey1Tx
      );
      await setUintToKey1TxResponse.wait();

      const setUintToKey1TxHash = setUintToKey1TxResponse.hash;
      setTransactionHash(setUintToKey1TxHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, setUintToKey1TxHash);

      const msg = `Initialize TX: ${getExplorerUrl(
        chainId
      )}tx/${initializeTxHash}\nsetUintToKey1 TX: ${getExplorerUrl(
        chainId
      )}tx/${setUintToKey1TxHash}`;

      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // ---------------------------
  // --- Get Target Contract ---
  // ---------------------------

  // Get target contract code
  const getTargetContractCode = async () => {
    setExecuting(`Getting code from target contract...`);
    try {
      const code = await provider.getCode(targetContractAddress);
      const msg = `Target contract code: ${code}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  // Get target contract state
  const getTargetContractState = async () => {
    setExecuting(`Getting state from target contract...`);
    const targetContract = new Contract(
      targetContractAddress,
      BatchCallDelegation.abi,
      provider
    );

    try {
      const owner = await targetContract.owner();
      const valueFromKey0Before = await targetContract.getUintFromKey0();
      const valueFromKey1Before = await targetContract.getUintFromKey1();

      const msg = `Target contract owner: ${owner}\nTarget contract valueFromKey0: ${valueFromKey0Before}\nTarget contract valueFromKey1: ${valueFromKey1Before}`;

      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // ---------------------
  // --- Set Delegator ---
  // ---------------------

  // Delegate EOA to contract
  const delegateEoaToContract = async () => {
    setExecuting(`Delegating EOA to target contract...`);

    try {
      // Sign authorization by delegator
      const authorization = await delegator.authorize({
        address: targetContractAddress,
      });

      // Send transaction by relayer
      const transaction = await relayer.sendTransaction({
        type: 4,
        to: ZeroAddress,
        authorizationList: [authorization],
      });
      const response = await transaction.wait();
      console.log(`response: ${stringify(response)}`);

      const txHash = transaction.hash;
      setTransactionHash(txHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash);

      const msg = `Sent TX: ${getExplorerUrl(chainId)}tx/${txHash}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  // Initial EOA delegator
  const initialEoaDelegator = async () => {
    setExecuting(`Initialing EOA contract...`);

    const eoaContractIface = new Interface(BatchCallDelegation.abi);
    const setUintToKey1Data = eoaContractIface.encodeFunctionData(
      "setUintToKey1",
      [666]
    );

    try {
      const feeData = await provider.getFeeData();
      console.log(`feeData: ${stringify(feeData)}`);

      const setUintToKey1Tx: TransactionRequest = {
        to: delegator.address,
        from: relayer.address,
        data: setUintToKey1Data,
        value: 0,
        nonce: await provider.getTransactionCount(relayer.address, "pending"),
        chainId,
        gasLimit: await provider.estimateGas({
          from: relayer.address,
          to: delegator.address,
          data: setUintToKey1Data,
        }),
        maxFeePerGas: feeData.maxFeePerGas || parseUnits("30", "gwei"),
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas || parseUnits("2", "gwei"),
      };
      console.log(`setUintToKey1Tx: ${stringify(setUintToKey1Tx)}`);

      // Send transaction by relayer
      const setUintToKey1TxResponse = await relayer.sendTransaction(
        setUintToKey1Tx
      );
      await setUintToKey1TxResponse.wait();

      const setUintToKey1TxHash = setUintToKey1TxResponse.hash;
      setTransactionHash(setUintToKey1TxHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, setUintToKey1TxHash);

      const msg = `setUintToKey1 TX: ${getExplorerUrl(
        chainId
      )}tx/${setUintToKey1TxHash}`;

      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  // Revert delegator to EOA
  const revertDelegatorToEoa = async () => {
    setExecuting(`Delegating EOA to target contract...`);
    try {
      // Sign authorization by delegator
      const authorization = await delegator.authorize({
        address: ZeroAddress,
      });

      // Send transaction by relayer
      const transaction = await relayer.sendTransaction({
        type: 4,
        to: ZeroAddress,
        authorizationList: [authorization],
      });
      const response = await transaction.wait();
      console.log(`response: ${stringify(response)}`);

      const txHash = transaction.hash;
      setTransactionHash(txHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash);

      const msg = `Sent TX: ${getExplorerUrl(chainId)}tx/${txHash}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  // ---------------------
  // --- Get Delegator ---
  // ---------------------

  // Get EOA delegator code
  const getEoaDelegatorCode = async () => {
    setExecuting(`Getting code from EOA contract...`);
    try {
      const code = await provider.getCode(delegator.address);
      const msg = `EOA contract code: ${code}`;
      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  // Get EOA delegator state
  const getEoaDelegatorState = async () => {
    setExecuting(`Getting state from EOA contract...`);
    const eoaContract = new Contract(
      delegator.address,
      BatchCallDelegation.abi,
      provider
    );
    try {
      const owner = await eoaContract.owner();
      const valueFromKey0Before = await eoaContract.getUintFromKey0();
      const valueFromKey1Before = await eoaContract.getUintFromKey1();

      const msg = `EOA contract owner: ${owner}\nEOA contract valueFromKey0: ${valueFromKey0Before}\nEOA contract valueFromKey1: ${valueFromKey1Before}`;

      console.log(msg);
      setMessage(msg);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // -------------------------
  // --- Query Transaction ---
  // -------------------------
  const getTransaction = async () => {
    try {
      const txReceipt = await provider.getTransactionReceipt(transactionHash);

      const msg = `Transaction Receipt: ${stringify(txReceipt)}`;
      console.log(msg);
      setMessage(msg);
      return txReceipt;
    } catch (error) {
      console.error("Error fetching transaction:", error);
    }
  };

  // ---------------------
  // --- Other Handler ---
  // ---------------------

  const handleTargetContractChange = (input: string) => {
    setTargetContractAddress(input);
    try {
      getAddress(input);
      setErrorMessage(``);
      localStorage.setItem(TARGET_CONTRACT_ADDRESS_KEY, input);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setErrorMessage(`Invalid address: ${errorMessage}`);
    }
  };

  const handleTransactionHashChange = (input: string) => {
    setTransactionHash(input);
    try {
      if (dataLength(input) != 32) {
        throw new Error(`Invalid transaction hash length`);
      }
      setErrorMessage(``);
      localStorage.setItem(TRANSACTION_HASH_KEY, input);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setErrorMessage(`Invalid transaction hash: ${errorMessage}`);
    }
  };

  // ----------------
  // --- React UI ---
  // ----------------

  return (
    <>
      <div className="card">
        <div>
          <label>
            Dalegator (EOA):{" "}
            <a
              href={`${getExplorerUrl(chainId)}address/${delegator.address}`}
              target="_blank"
            >
              {`${delegator.address}`}
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

      <div className="card">
        <h3>Test</h3>
        <button onClick={getNonce} disabled={!!executing || !!errorMessage}>
          Get Nonce
        </button>
        <button onClick={getFeeData} disabled={!!executing || !!errorMessage}>
          Get Fee Data
        </button>
      </div>

      <div className="card">
        <h3>Target Contract (Set)</h3>
        <button
          onClick={deployTargetContract}
          disabled={!!executing || !!errorMessage}
        >
          Deploy Contract
        </button>
        <button
          onClick={initialTargetContract}
          disabled={!!executing || !!errorMessage}
        >
          Set Contract "State"
        </button>
      </div>

      <div className="card">
        <h3>Target Contract (Get)</h3>

        <button
          onClick={getTargetContractCode}
          disabled={!!executing || !!errorMessage}
        >
          Get Contract "Code"
        </button>
        <button
          onClick={getTargetContractState}
          disabled={!!executing || !!errorMessage}
        >
          Get Contract "State"
        </button>
      </div>

      <div className="card">
        <h3>Delegator (Set)</h3>
        <button
          onClick={delegateEoaToContract}
          disabled={!!executing || !!errorMessage}
        >
          Delegate to "Target Contract"
        </button>
        <button
          onClick={initialEoaDelegator}
          disabled={!!executing || !!errorMessage}
        >
          Set Delegator "State"
        </button>
        <button
          onClick={revertDelegatorToEoa}
          disabled={!!executing || !!errorMessage}
        >
          Revert to EOA
        </button>
      </div>

      <div className="card">
        <h3>Delegator (Get)</h3>
        <button
          onClick={getEoaDelegatorCode}
          disabled={!!executing || !!errorMessage}
        >
          Get Delegator "Code"
        </button>
        <button
          onClick={getEoaDelegatorState}
          disabled={!!executing || !!errorMessage}
        >
          Get Delegator "State"
        </button>
      </div>

      <div>
        <h3>Query Transaction</h3>
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
    </>
  );
}
