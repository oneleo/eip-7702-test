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
} from "ethers";

import { stringify, getExplorerUrl } from "~/src/util/general";
import { getAuthorizationList, getSignedTransaction } from "~/src/util/eip7702";
import { useEip6963Provider } from "~/src/context/eip6963Provider";

import BatchCallDelegation from "~/out/BatchCallDelegation.sol/BatchCallDelegation.json";

export function EIP7702() {
  const { eip6963Provider } = useEip6963Provider();
  const [provider, setProvider] = useState<AbstractProvider>(
    getDefaultProvider()
  );
  const [chainId, setChainId] = useState<number>(0);

  const [eoaDelegator, setEoaDelegator] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );
  const [deployerTxRelayer, setDeployerTxRelayer] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );
  const [receiver, setReceiver] = useState<HDNodeWallet>(
    HDNodeWallet.createRandom()
  );

  const [targetContractAddress, setTargetContractAddress] =
    useState<string>(ZeroAddress);
  const [transactionHash, setTransactionHash] = useState<string>(
    "0x3142de7ba571e18173d69232d00d8609543d2e4335ba2688c2495dbf7b9e689a"
  );

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
    setTargetContractAddress("0x4Ad240Ec5960338Ca7e0c56363Ef0Fc26D078B5A");

    const mnemonic = Mnemonic.fromPhrase(import.meta.env.VITE_MNEMONIC);

    setEoaDelegator(
      HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/0`).connect(pvd)
    );
    setDeployerTxRelayer(
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
    const eoaDelegatorNonce = BigInt(await eoaDelegator.getNonce("pending"));
    const relayerNonce = BigInt(await deployerTxRelayer.getNonce("pending"));
    const receiverNonce = BigInt(await receiver.getNonce("pending"));
    console.log(
      `eoaDelegatorNonce: ${eoaDelegatorNonce}\nrelayerNonce:${relayerNonce}\nreceiverNonce: ${receiverNonce}`
    );
    setExecuting(``);
  };

  // --------------------------------------------
  // --- Deploy & Initial New Target Contract ---
  // --------------------------------------------

  // Deploy new target contract
  const deployTargetContract = async () => {
    setExecuting(`Deploying new target contract...`);
    const bytecode = BatchCallDelegation.bytecode.object;
    const abiCoder = AbiCoder.defaultAbiCoder();
    const constructorArgs = abiCoder.encode(
      ["address"],
      [deployerTxRelayer.address]
    );
    const fullBytecode = concat([bytecode, constructorArgs]);
    const tx: TransactionRequest = {
      data: fullBytecode,
    };

    try {
      const txResponse = await deployerTxRelayer.sendTransaction(tx);
      await txResponse.wait();

      const txHash = txResponse.hash;

      setTransactionHash(txHash);

      const msg1 = `Deployment TX: ${getExplorerUrl(chainId)}tx/${txHash}`;

      console.log(msg1);
      setMessage(msg1);

      const txReceipt = await provider.getTransactionReceipt(txHash);

      const contractAddress = txReceipt?.contractAddress;

      if (contractAddress) {
        setTargetContractAddress(contractAddress);
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
        from: deployerTxRelayer.address,
        data: initializeData,
        value: 0,
        nonce: await provider.getTransactionCount(
          deployerTxRelayer.address,
          "pending"
        ),
        chainId,
        gasLimit: await provider.estimateGas({
          from: deployerTxRelayer.address,
          to: targetContractAddress,
          data: initializeData,
        }),
        maxFeePerGas: feeData.maxFeePerGas || parseUnits("30", "gwei"),
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas || parseUnits("2", "gwei"),
      };
      console.log(`initializeTx: ${stringify(initializeTx)}`);

      const initializeTxResponse = await deployerTxRelayer.sendTransaction(
        initializeTx
      );
      await initializeTxResponse.wait();

      const initializeTxHash = initializeTxResponse.hash;

      setTransactionHash(initializeTxHash);

      const setUintToKey1Tx: TransactionRequest = {
        to: targetContractAddress,
        from: deployerTxRelayer.address,
        data: setUintToKey1Data,
        value: 0,
        nonce: await provider.getTransactionCount(
          deployerTxRelayer.address,
          "pending"
        ),
        chainId,
        gasLimit: await provider.estimateGas({
          from: deployerTxRelayer.address,
          to: targetContractAddress,
          data: setUintToKey1Data,
        }),
        maxFeePerGas: feeData.maxFeePerGas || parseUnits("30", "gwei"),
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas || parseUnits("2", "gwei"),
      };
      console.log(`setUintToKey1Tx: ${stringify(setUintToKey1Tx)}`);

      const setUintToKey1TxResponse = await deployerTxRelayer.sendTransaction(
        setUintToKey1Tx
      );
      await setUintToKey1TxResponse.wait();

      const setUintToKey1TxHash = setUintToKey1TxResponse.hash;

      setTransactionHash(setUintToKey1TxHash);

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

  // ----------------------------------------
  // --- Get Target Contract Code & State ---
  // ----------------------------------------

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

  // ------------------------------------------
  // --- Delegate or Revert EOA to Contract ---
  // ------------------------------------------

  // Delegate EOA to contract
  const delegateEoaToContract = async () => {
    setExecuting(`Delegating EOA to target contract...`);

    const delegator = eoaDelegator;
    const relayer = deployerTxRelayer;
    const authAddress = targetContractAddress;
    // const authAddress = ZeroAddress;
    const pkDelegator = delegator.privateKey;
    try {
      const authNonce = BigInt(await delegator.getNonce("pending"));
      const relayerNonce = BigInt(await relayer.getNonce("pending"));
      console.log(`authNonce: ${authNonce}\nrelayerNonce:${relayerNonce}`);

      const authorizationList = getAuthorizationList(
        BigInt(chainId),
        authNonce,
        pkDelegator,
        authAddress
      );
      console.log(`authorizationList: ${stringify(authorizationList)}`);

      const encodedSignedTx = await getSignedTransaction(
        provider,
        relayer.signingKey,
        authorizationList
      );
      console.log(`encodedSignedTx: ${encodedSignedTx}`);

      const txHash = (await (provider as BrowserProvider).send(
        "eth_sendRawTransaction",
        [encodedSignedTx]
      )) as string;

      setTransactionHash(txHash);

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
        to: eoaDelegator.address,
        from: deployerTxRelayer.address,
        data: setUintToKey1Data,
        value: 0,
        nonce: await provider.getTransactionCount(
          deployerTxRelayer.address,
          "pending"
        ),
        chainId,
        gasLimit: await provider.estimateGas({
          from: deployerTxRelayer.address,
          to: eoaDelegator.address,
          data: setUintToKey1Data,
        }),
        maxFeePerGas: feeData.maxFeePerGas || parseUnits("30", "gwei"),
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas || parseUnits("2", "gwei"),
      };
      console.log(`setUintToKey1Tx: ${stringify(setUintToKey1Tx)}`);

      const setUintToKey1TxResponse = await deployerTxRelayer.sendTransaction(
        setUintToKey1Tx
      );
      await setUintToKey1TxResponse.wait();

      const setUintToKey1TxHash = setUintToKey1TxResponse.hash;

      setTransactionHash(setUintToKey1TxHash);

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

    const delegator = eoaDelegator;
    const relayer = receiver;
    // const authAddress = targetContractAddress;
    const authAddress = ZeroAddress;
    const pkDelegator = delegator.privateKey;
    try {
      const authNonce = BigInt(await delegator.getNonce("pending"));
      const relayerNonce = BigInt(await relayer.getNonce("pending"));
      console.log(`authNonce: ${authNonce}\nrelayerNonce:${relayerNonce}`);

      const authorizationList = getAuthorizationList(
        BigInt(chainId),
        authNonce,
        pkDelegator,
        authAddress
      );
      console.log(`authorizationList: ${stringify(authorizationList)}`);

      const encodedSignedTx = await getSignedTransaction(
        provider,
        relayer.signingKey,
        authorizationList
      );
      console.log(`encodedSignedTx: ${encodedSignedTx}`);

      const txHash = (await (provider as BrowserProvider).send(
        "eth_sendRawTransaction",
        [encodedSignedTx]
      )) as string;

      setTransactionHash(txHash);

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

  // --------------------------------------
  // --- Get EOA Delegator Code & State ---
  // --------------------------------------

  // Get EOA delegator code
  const getEoaDelegatorCode = async () => {
    setExecuting(`Getting code from EOA contract...`);
    try {
      const code = await provider.getCode(eoaDelegator.address);
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
      eoaDelegator.address,
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

  return (
    <>
      <div className="card">
        <div>
          <label>
            EIP-7702 EOA/Contract:{" "}
            <a
              href={`${getExplorerUrl(chainId)}address/${eoaDelegator.address}`}
              target="_blank"
            >
              {`${eoaDelegator.address}`}
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
        <h3>Test Area</h3>
        <button onClick={getNonce} disabled={!!executing || !!errorMessage}>
          Get nonce
        </button>
      </div>

      <div className="card">
        <h3>Deploy & Initial New Target Contract</h3>
        <button
          onClick={deployTargetContract}
          disabled={!!executing || !!errorMessage}
        >
          Deploy New Target Contract
        </button>
        <button
          onClick={initialTargetContract}
          disabled={!!executing || !!errorMessage}
        >
          Initial Deployed Target Contract
        </button>
      </div>

      <div className="card">
        <h3>Get Target Contract Code & State</h3>
        <button
          onClick={getTargetContractCode}
          disabled={!!executing || !!errorMessage}
        >
          Get Target Contract Code
        </button>
        <button
          onClick={getTargetContractState}
          disabled={!!executing || !!errorMessage}
        >
          Get Target Contract State
        </button>
      </div>

      <div className="card">
        <h3>Delegate or Revert EOA to Contract</h3>

        <div>
          {" "}
          <button
            onClick={delegateEoaToContract}
            disabled={!!executing || !!errorMessage}
          >
            Delegate EOA to Contract
          </button>
          <button
            onClick={initialEoaDelegator}
            disabled={!!executing || !!errorMessage}
          >
            Initial EOA Delegator
          </button>
        </div>
        <div>
          <button
            onClick={revertDelegatorToEoa}
            disabled={!!executing || !!errorMessage}
          >
            Revert Delegator to EOA
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Get EOA Delegator Code & State</h3>
        <button
          onClick={getEoaDelegatorCode}
          disabled={!!executing || !!errorMessage}
        >
          Get EOA Delegator Code
        </button>
        <button
          onClick={getEoaDelegatorState}
          disabled={!!executing || !!errorMessage}
        >
          Get EOA Delegator State
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
