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

- EIP-7702 supports only `ethers.SigningKey.sign(hash)` and not `(await new ethers.BrowserProvider(eip6963Provider.provider).getSigner()).signMessage(hash);` which includes the `\x19Ethereum Signed Message:\n` prefix. Please provide your mnemonic in the `.env` file.

- This tool uses the wallet’s provider. Make sure your wallet’s node RPC URL supports EIP-7702 transactions (public URLs usually don’t). If not, update it to one that does.

![MetaMask edit existing network RPC](https://csct-assets.infura-ipfs.io/ipfs/QmWxzwju4HzkBaVYnvV39pBQH8Ws4Uk6vN6d91aVamsvSH "Locate the desired network you want to edit and click the 3 dots to edit.")

![MetaMask add RPC URL](https://csct-assets.infura-ipfs.io/ipfs/QmdNcQ2MiuSfdSMnNr9ATxndC3ShxLVvVXMW8JbFtJHhRf "Enter the URL, nickname, and save your configurations.")
