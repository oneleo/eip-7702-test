// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StorageSlot} from "@openzeppelin/contracts/utils/StorageSlot.sol";
import {SlotDerivation} from "@openzeppelin/contracts/utils/SlotDerivation.sol";

contract BatchCallDelegation is Ownable, Initializable {
    string private constant _NAMESPACE = "BatchCallDelegation.SlotDerivation.StorageSlot.NameSpace";

    struct Call {
        bytes data;
        address to;
        uint256 value;
    }

    constructor(address owner) Ownable(owner) {}

    function initialize(uint256 value) external initializer onlyOwner {
        _setValueInNamespace(0, value);
    }

    function getUintFromKey0() external view returns (uint256) {
        return _getValueInNamespace(0);
    }

    function getUintFromKey1() external view returns (uint256) {
        return _getValueInNamespace(1);
    }

    function setUintToKey0(uint256 value) external onlyOwner {
        _setValueInNamespace(0, value);
    }

    function setUintToKey1(uint256 value) external {
        _setValueInNamespace(1, value);
    }

    function execute(Call[] calldata calls) external payable {
        for (uint256 i = 0; i < calls.length; i++) {
            Call memory call = calls[i];
            (bool success,) = call.to.call{value: call.value}(call.data);
            require(success, "call reverted");
        }
    }

    function _setValueInNamespace(uint256 _key, uint256 _newValue) internal {
        StorageSlot.getUint256Slot(SlotDerivation.deriveMapping(SlotDerivation.erc7201Slot(_NAMESPACE), _key)).value =
            _newValue;
    }

    function _getValueInNamespace(uint256 _key) internal view returns (uint256) {
        return
            StorageSlot.getUint256Slot(SlotDerivation.deriveMapping(SlotDerivation.erc7201Slot(_NAMESPACE), _key)).value;
    }
}
