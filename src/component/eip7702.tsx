import { useState, useEffect } from "react";
import {
  concat,
  AbiCoder,
  ZeroHash,
  Mnemonic,
  Contract,
  Interface,
  parseUnits,
  getAddress,
  dataLength,
  ZeroAddress,
  HDNodeWallet,
  JsonRpcProvider,
  BrowserProvider,
  AbstractProvider,
  getDefaultProvider,
  TransactionRequest,
  verifyAuthorization,
} from "ethers";

import {
  logNonces,
  stringify,
  getExplorerUrl,
  BatchCallDelegationContract,
  type Call,
  type RawTransactionResponse,
} from "~/src/util/general";
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

  // ---------------------------
  // --- Set Target Contract ---
  // ---------------------------

  // Deploy new target contract
  const deployTargetContract = async () => {
    setExecuting(`Deploying new target contract...`);
    console.log(`Deploying new target contract...`);
    const bytecode = BatchCallDelegation.bytecode.object;
    const abiCoder = AbiCoder.defaultAbiCoder();
    const constructorArgs = abiCoder.encode(["address"], [relayer.address]);
    const fullBytecode = concat([bytecode, constructorArgs]);
    const tx: TransactionRequest = {
      data: fullBytecode,
    };

    try {
      // Send transaction by Relayer
      const txResponse = await relayer.sendTransaction(tx);
      const txReceipt = await txResponse.wait();
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
    console.log(`Initialing target contract...`);

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

      // Send transaction by Relayer
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

      // Send transaction by Relayer
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

  // Delegate EOA to contract by Relayer
  const delegateEoaToContractByRelayer = async () => {
    setExecuting(`Delegating EOA to target contract...`);
    console.log(`Delegating EOA to target contract...`);

    try {
      console.log(
        await logNonces(
          `Before delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );

      // Sign authorization by Delegator
      const authorization = await delegator.authorize({
        address: targetContractAddress,
      });
      console.log(`Signed authorization: ${stringify(authorization)}`);

      // Send transaction by `Relayer`
      const transaction = await relayer.sendTransaction({
        type: 4,
        to: ZeroAddress, // If `to` is Delegator, implement `fallback() payable`
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

      console.log(
        await logNonces(
          `After delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // Delegate EOA to contract by Delegator
  const delegateEoaToContractByDelegator = async () => {
    setExecuting(`Delegating EOA to target contract...`);
    console.log(`Delegating EOA to target contract...`);

    try {
      console.log(
        await logNonces(
          `Before delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );

      // Sign authorization by Delegator
      const authorization = await delegator.authorize({
        address: targetContractAddress,
        nonce: (await delegator.getNonce("pending")) + 1, // To send Type 4 via Delegator, use current nonce + 1; otherwise, transformation fails
      });
      console.log(`Signed authorization: ${stringify(authorization)}`);

      // Send transaction by `Delegator`
      const transaction = await delegator.sendTransaction({
        type: 4,
        to: ZeroAddress, // If `to` is Delegator, implement `fallback() payable`
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

      console.log(
        await logNonces(
          `After delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
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
    console.log(`Initialing EOA contract...`);

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

      // Send transaction by Relayer
      const setUintToKey1TxResponse = await relayer.sendTransaction(
        setUintToKey1Tx
      );
      await setUintToKey1TxResponse.wait();
      console.log(`response: ${stringify(setUintToKey1TxResponse)}`);

      const setUintToKey1TxHash = setUintToKey1TxResponse.hash;
      setTransactionHash(setUintToKey1TxHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, setUintToKey1TxHash);

      const msg = `setUintToKey1 TX: ${getExplorerUrl(
        chainId
      )}tx/${setUintToKey1TxHash}`;

      console.log(msg);
      setMessage(msg);

      console.log(
        await logNonces(
          `Current nonce`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }
    setExecuting(``);
  };

  const executeBatchCall = async () => {
    setExecuting(`Executing batch call...`);
    console.log(`Executing batch call...`);

    try {
      const batchContract = BatchCallDelegationContract.init(
        delegator.address,
        relayer
      );

      const calls: Call[] = [
        {
          to: delegator.address, // To accept ETH, Delegator needs `receive() payable`
          value: parseUnits("0.001", 18),
          data: "0x",
        },
        {
          to: relayer.address,
          value: parseUnits("0.000001", 18),
          data: "0x",
        },
        {
          to: receiver.address,
          value: parseUnits("0.000000001", 18),
          data: "0x",
        },
      ];
      const receipt = await batchContract.execute(calls);

      const txHash = receipt.hash;
      setTransactionHash(txHash);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash);

      const msg = `Sent TX: ${getExplorerUrl(chainId)}tx/${txHash}`;
      console.log(msg);
      setMessage(msg);

      console.log(
        await logNonces(
          `Current nonce`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // Delegate EOA to contract and execute batch by Relayer
  const delegateAndExecuteAndRevertByRelayer = async () => {
    setExecuting(`Delegating and executing...`);
    console.log(`Delegating and executing...`);

    try {
      console.log(
        await logNonces(
          `Before delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );

      // Sign authorization by Delegator
      const authorizationToContract = await delegator.authorize({
        address: targetContractAddress,
      });

      // Sign authorization by Delegator
      const authorizationToZero = await delegator.authorize({
        address: ZeroAddress,
        nonce: (await delegator.getNonce("pending")) + 1,
      });

      // Send transaction by `Relayer`
      const transaction1 = await relayer.sendTransaction({
        type: 4,
        authorizationList: [authorizationToContract],
        to: delegator.address,
        data: BatchCallDelegationContract.encodeExecuteData([
          {
            to: delegator.address, // To accept ETH, Delegator needs `receive() payable`
            value: parseUnits("0.001", 18),
            data: "0x",
          },
          {
            to: relayer.address,
            value: parseUnits("0.000001", 18),
            data: "0x",
          },
          {
            to: receiver.address,
            value: parseUnits("0.000000001", 18),
            data: "0x",
          },
        ]),
      });

      await transaction1.wait();
      const txHash1 = transaction1.hash;
      setTransactionHash(txHash1);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash1);

      // Send transaction by `Relayer`
      const transaction2 = await relayer.sendTransaction({
        type: 4,
        to: ZeroAddress,
        authorizationList: [authorizationToZero],
      });

      await transaction2.wait();
      const txHash2 = transaction2.hash;
      setTransactionHash(txHash2);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash2);

      const msg = `Sent TX:\n${getExplorerUrl(
        chainId
      )}tx/${txHash1}\n${getExplorerUrl(chainId)}tx/${txHash2}`;
      console.log(msg);
      setMessage(msg);

      console.log(
        await logNonces(
          `After delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // Delegate EOA to contract and execute batch by Delegator
  const delegateAndExecuteAndRevertByDelegator = async () => {
    setExecuting(`Delegating and executing...`);
    console.log(`Delegating and executing...`);

    try {
      console.log(
        await logNonces(
          `Before delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );

      // Sign authorization by Delegator
      const authorizationToContract = await delegator.authorize({
        address: targetContractAddress,
        nonce: (await delegator.getNonce("pending")) + 1,
      });

      // Sign authorization by Delegator
      const authorizationToZero = await delegator.authorize({
        address: ZeroAddress,
        nonce: (await delegator.getNonce("pending")) + 3,
      });

      // Send transaction by `Delegator`
      const transaction1 = await delegator.sendTransaction({
        type: 4,
        authorizationList: [authorizationToContract],
        to: delegator.address,
        data: BatchCallDelegationContract.encodeExecuteData([
          {
            to: delegator.address, // To accept ETH, Delegator needs `receive() payable`
            value: parseUnits("0.001", 18),
            data: "0x",
          },
          {
            to: relayer.address,
            value: parseUnits("0.000001", 18),
            data: "0x",
          },
          {
            to: receiver.address,
            value: parseUnits("0.000000001", 18),
            data: "0x",
          },
        ]),
      });

      await transaction1.wait();
      const txHash1 = transaction1.hash;
      setTransactionHash(txHash1);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash1);

      // Send transaction by `Delegator`
      const transaction2 = await delegator.sendTransaction({
        type: 4,
        to: ZeroAddress,
        authorizationList: [authorizationToZero],
      });

      await transaction2.wait();
      const txHash2 = transaction2.hash;
      setTransactionHash(txHash2);
      localStorage.setItem(TRANSACTION_HASH_KEY, txHash2);

      const msg = `Sent TX:\n${getExplorerUrl(
        chainId
      )}tx/${txHash1}\n${getExplorerUrl(chainId)}tx/${txHash2}`;
      console.log(msg);
      setMessage(msg);

      console.log(
        await logNonces(
          `After delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // Revert delegator to EOA by Relayer
  const revertDelegatorToEoaByRelayer = async () => {
    setExecuting(`Reverting delegator back to EOA...`);
    console.log(`Reverting delegator back to EOA...`);

    try {
      console.log(
        await logNonces(
          `Before delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );

      // Sign authorization by `Delegator`
      const authorization = await delegator.authorize({
        address: ZeroAddress,
      });
      console.log(`Signed authorization: ${stringify(authorization)}`);

      // Send transaction by `Relayer`
      const transaction = await relayer.sendTransaction({
        type: 4,
        to: ZeroAddress, // Reverting to EOA: `to` can be any address
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

      console.log(
        await logNonces(
          `After delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    }

    setExecuting(``);
  };

  // Revert delegator to EOA by Delegator
  const revertDelegatorToEoaByDelegator = async () => {
    setExecuting(`Reverting delegator back to EOA...`);
    console.log(`Reverting delegator back to EOA...`);

    try {
      console.log(
        await logNonces(
          `Before delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );

      // Sign authorization by `Delegator`
      const authorization = await delegator.authorize({
        address: ZeroAddress,
        nonce: (await delegator.getNonce("pending")) + 1, // To send Type 4 via Delegator, use current nonce + 1; otherwise, transformation fails
      });
      console.log(`Signed authorization: ${stringify(authorization)}`);

      // Send transaction by `Delegator`
      const transaction = await delegator.sendTransaction({
        type: 4,
        to: ZeroAddress, // Reverting to EOA: `to` can be any address
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

      console.log(
        await logNonces(
          `After delegating`,
          [delegator, relayer, receiver],
          [`delegator`, `relayer`, `receiver`]
        )
      );
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

  // -----------------
  // --- Test Area ---
  // -----------------

  const getNonce = async () => {
    setExecuting(`Querying nonce...`);
    const msg = await logNonces(
      `Current nonce`,
      [delegator, relayer, receiver],
      [`delegator`, `relayer`, `receiver`]
    );

    console.log(msg);
    setMessage(msg);
    setExecuting(``);
  };

  const getFeeData = async () => {
    setExecuting(`Querying fee data...`);
    const feeData = await provider.getFeeData();
    const msg = `feeData: ${stringify(feeData)}`;
    console.log(msg);
    setMessage(msg);
    setExecuting(``);
  };

  // -------------------------
  // --- Query Transaction ---
  // -------------------------
  const getTransactionReceipt = async () => {
    try {
      const txReceipt = await provider.getTransactionReceipt(transactionHash);
      const msg = `Transaction response: ${stringify(txReceipt)}`;
      console.log(msg);
      setMessage(msg);
      return txReceipt;
    } catch (error) {
      console.error("Error fetching transaction:", error);
    }
  };

  const getTransactionResponse = async () => {
    try {
      const txResponse = await provider.getTransaction(transactionHash);

      const msg = `Transaction response: ${stringify(txResponse)}`;
      console.log(msg);
      setMessage(msg);
      return txResponse;
    } catch (error) {
      console.error("Error fetching transaction:", error);
    }
  };

  const getTransactionViaRpc = async () => {
    try {
      const txResponse: RawTransactionResponse | null = await (
        provider as JsonRpcProvider
      ).send(`eth_getTransactionByHash`, [transactionHash]);

      const recoveredAddress: string[] = [];

      if (txResponse?.authorizationList?.[0]) {
        txResponse.authorizationList.forEach((auth) => {
          // Recover delegator address from authorization
          recoveredAddress.push(
            verifyAuthorization(
              {
                address: auth.address,
                nonce: BigInt(auth.nonce),
                chainId: auth.chainId,
              },
              {
                r: auth.r,
                s: auth.s,
                yParity: auth.yParity === `0x0` ? 0 : 1,
              }
            )
          );
        });
      }

      const msg = `Transaction response: ${stringify(txResponse)}`;
      console.log(msg);
      console.log(`Recovered Addresses: ${stringify(recoveredAddress)}`);
      setMessage(msg);
      return txResponse;
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
            Relayer:{" "}
            <a
              href={`${getExplorerUrl(chainId)}address/${relayer.address}`}
              target="_blank"
            >
              {`${relayer.address}`}
            </a>
          </label>
        </div>

        <div>
          <label>
            Receiver:{" "}
            <a
              href={`${getExplorerUrl(chainId)}address/${receiver.address}`}
              target="_blank"
            >
              {`${receiver.address}`}
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
        <div>
          <button
            onClick={delegateEoaToContractByRelayer}
            disabled={!!executing || !!errorMessage}
          >
            Delegate to "Target Contract" by Relayer
          </button>
          <button
            onClick={delegateEoaToContractByDelegator}
            disabled={!!executing || !!errorMessage}
          >
            Delegate to "Target Contract" by Delegator
          </button>
        </div>

        <div>
          <button
            onClick={initialEoaDelegator}
            disabled={!!executing || !!errorMessage}
          >
            Set Delegator "State"
          </button>
          <button
            onClick={executeBatchCall}
            disabled={!!executing || !!errorMessage}
          >
            Execute batch call
          </button>
        </div>

        <div>
          <button
            onClick={revertDelegatorToEoaByRelayer}
            disabled={!!executing || !!errorMessage}
          >
            Revert to "EOA" by Relayer
          </button>
          <button
            onClick={revertDelegatorToEoaByDelegator}
            disabled={!!executing || !!errorMessage}
          >
            Revert to "EOA" by Delegator
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Delegator (Complex)</h3>
        <button
          onClick={delegateAndExecuteAndRevertByRelayer}
          disabled={!!executing || !!errorMessage}
        >
          Delegate and Execute Batch by Relayer
        </button>
        <button
          onClick={delegateAndExecuteAndRevertByDelegator}
          disabled={!!executing || !!errorMessage}
        >
          Delegate and Execute Batch by Delegator
        </button>
      </div>

      <div className="card">
        <h3>Delegator (Get)</h3>

        <div>
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
          <button onClick={getNonce} disabled={!!executing || !!errorMessage}>
            Get Nonce
          </button>
          <button onClick={getFeeData} disabled={!!executing || !!errorMessage}>
            Get Fee Data
          </button>
        </div>
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
          onClick={getTransactionReceipt}
          disabled={!!executing || !!errorMessage}
        >
          Get Transaction Receipt
        </button>
        <button
          onClick={getTransactionResponse}
          disabled={!!executing || !!errorMessage}
        >
          Get Transaction Response
        </button>
        <button
          onClick={getTransactionViaRpc}
          disabled={!!executing || !!errorMessage}
        >
          Get Transaction Response via JSON-RPC
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
