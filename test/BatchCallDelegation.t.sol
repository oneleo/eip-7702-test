// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {BatchCallDelegation} from "../src/BatchCallDelegation.sol";

contract BatchCallDelegationTest is Test {
    BatchCallDelegation public batchCallDelegation;
    address public batchCallDelegationAddress;
    address public owner;
    uint256 public ownerKey;
    address public other;
    address public receiver;

    function setUp() public {
        (owner, ownerKey) = makeAddrAndKey("owner");
        batchCallDelegation = new BatchCallDelegation(owner);
        batchCallDelegationAddress = address(batchCallDelegation);

        vm.startPrank(owner);
        batchCallDelegation.initialize(333);
        vm.stopPrank();

        other = makeAddr("other");
        receiver = makeAddr("recipient");
        vm.deal(batchCallDelegationAddress, 999 ether);
    }

    function testSetUp() public view {
        console.logAddress(address(batchCallDelegation));
        assertEq(batchCallDelegation.owner(), owner);
        assertEq(batchCallDelegation.getUintFromKey0(), 333);
        assertEq(batchCallDelegationAddress.balance, 999 ether);
    }

    function testCannotReinitialize() public {
        vm.expectRevert(abi.encodeWithSelector(Initializable.InvalidInitialization.selector));
        vm.startPrank(owner);
        batchCallDelegation.initialize(999);
        vm.stopPrank();
    }

    function testSetUintToKey1() public {
        vm.startPrank(owner);
        batchCallDelegation.setUintToKey1(999);
        vm.stopPrank();

        assertEq(batchCallDelegation.getUintFromKey1(), 999);
    }

    function testCannotSetUintToKey0ByOther() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));

        vm.startPrank(other);
        batchCallDelegation.setUintToKey0(999);
        vm.stopPrank();
    }

    function testExecute() public {
        BatchCallDelegation.Call[] memory calls = new BatchCallDelegation.Call[](1);

        calls[0] = BatchCallDelegation.Call({to: receiver, value: 1 ether, data: bytes("")});

        bytes memory executeData = abi.encodeWithSelector(BatchCallDelegation.execute.selector, calls);

        vm.startPrank(owner);
        (bool success,) = batchCallDelegationAddress.call(executeData);
        vm.stopPrank();

        assertEq(success, true);
        assertEq(receiver.balance, 1 ether);
    }

    function testCannotSetUintToKey1ByContract() public {
        BatchCallDelegation.Call[] memory calls = new BatchCallDelegation.Call[](1);

        calls[0] = BatchCallDelegation.Call({
            to: batchCallDelegationAddress,
            value: 0,
            data: abi.encodeWithSelector(BatchCallDelegation.setUintToKey1.selector, 999)
        });

        bytes memory executeData = abi.encodeWithSelector(BatchCallDelegation.execute.selector, calls);

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, batchCallDelegationAddress));

        vm.startPrank(owner);
        (bool success,) = batchCallDelegationAddress.call(executeData);
        vm.stopPrank();

        assertEq(success, false);
    }
}
