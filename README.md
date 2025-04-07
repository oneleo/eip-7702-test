# EIP-7702 test

## Set .env

```shell
> code .env
```

## Build project

```shell
> npm install
> forge install
> forge build
```

## Start Vite

```
> npm run dev
```

## Notes

- Please add your mnemonic to `.env` and fund the `relayer` (m/44'/60'/0'/0/1) wallet.

- EIP-7702 is available in ethers [v6.13.6+](https://www.npmjs.com/package/ethers). See [eip7702.tsx](src/component/eip7702.tsx) and [BatchCallDelegation.sol](src/BatchCallDelegation.sol) for details.

- Please ensure your wallet’s RPC supports EIP-7702. Public URLs often don’t—switch to a supported one if needed:

![MetaMask edit existing network RPC](https://csct-assets.infura-ipfs.io/ipfs/QmWxzwju4HzkBaVYnvV39pBQH8Ws4Uk6vN6d91aVamsvSH "Locate the desired network you want to edit and click the 3 dots to edit.")

![MetaMask add RPC URL](https://csct-assets.infura-ipfs.io/ipfs/QmdNcQ2MiuSfdSMnNr9ATxndC3ShxLVvVXMW8JbFtJHhRf "Enter the URL, nickname, and save your configurations.")
