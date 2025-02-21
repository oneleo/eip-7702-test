// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {BatchCallDelegation} from "../src/BatchCallDelegation.sol";

contract BatchCallDelegationScript is Script {
    BatchCallDelegation public batchCallDelegation;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        batchCallDelegation = new BatchCallDelegation(msg.sender);

        vm.stopBroadcast();
    }
}
