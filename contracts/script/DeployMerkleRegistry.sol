// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/MerkleRootBlobRegistry.sol";

contract DeployMerkleRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);

        console.log("Deploying MerkleRootBlobRegistry...");
        console.log("Deployer address:", deployerAddress);

        vm.startBroadcast(deployerPrivateKey);

        MerkleRootBlobRegistry merkleRegistry = new MerkleRootBlobRegistry();
        console.log(
            "MerkleRootBlobRegistry deployed at:",
            address(merkleRegistry)
        );
        console.log("Owner set to:", merkleRegistry.owner());

        vm.stopBroadcast();

        string memory deploymentJson = string(
            abi.encodePacked(
                "{\n",
                '  "merkleRegistry": "',
                vm.toString(address(merkleRegistry)),
                '",\n',
                '  "owner": "',
                vm.toString(merkleRegistry.owner()),
                '",\n',
                '  "deployer": "',
                vm.toString(deployerAddress),
                '",\n',
                '  "timestamp": "',
                vm.toString(block.timestamp),
                '"\n',
                "}"
            )
        );

        vm.writeFile("merkle-registry-deployment.json", deploymentJson);
        console.log(
            "Deployment addresses written to merkle-registry-deployment.json"
        );

        console.log("\n=== Deployment Summary ===");
        console.log("Contract: MerkleRootBlobRegistry");
        console.log("Address:", address(merkleRegistry));
        console.log("Owner:", merkleRegistry.owner());
        console.log("Network: Use --rpc-url to specify");
        console.log("Next steps:");
        console.log(
            "1. Use updateMerkleRoot() with EIP-4844 blob transactions"
        );
        console.log("2. Only owner can update merkle roots");
        console.log("========================\n");
    }
}
