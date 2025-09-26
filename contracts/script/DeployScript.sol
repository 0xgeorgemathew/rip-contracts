// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/PriceProtectionOracle.sol";
import "../src/verifier/Groth16Verifier.sol";
import "../src/Token.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        // Deploy verifier
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Verifier deployed at:", address(verifier));

        // Deploy ERC-20 token
        Token token = new Token();
        console.log("Token deployed at:", address(token));

        // Deploy main contract
        PriceProtectionOracle oracle = new PriceProtectionOracle(address(verifier), address(token));
        console.log("PriceProtectionOracle deployed at:", address(oracle));

        // Mint 1000 tokens to Oracle (with 6 decimals = 1000 * 10^6)
        token.mint(address(oracle), 1000 * 10**6);
        console.log("Minted 1000 tokens to PriceProtectionOracle");
        console.log("PriceProtectionOracle MockUSDC balance:", token.balanceOf(address(oracle)) / 10**6, "USDC");

        // Mint 1000 tokens to deployer for testing (with 6 decimals = 1000 * 10^6)
        token.mint(deployerAddress, 1000 * 10**6);
        console.log("Minted 1000 tokens to deployer for testing");
        console.log("Deployer MockUSDC balance:", token.balanceOf(deployerAddress) / 10**6, "USDC");

        vm.stopBroadcast();

        // Write deployment addresses to JSON file
        string memory deploymentJson = string(abi.encodePacked(
            '{\n',
            '  "verifier": "', vm.toString(address(verifier)), '",\n',
            '  "token": "', vm.toString(address(token)), '",\n',
            '  "oracle": "', vm.toString(address(oracle)), '",\n',
            '  "deployer": "', vm.toString(deployerAddress), '",\n',
            '  "timestamp": "', vm.toString(block.timestamp), '"\n',
            '}'
        ));

        vm.writeFile("deployment.json", deploymentJson);
        console.log("Deployment addresses written to deployment.json");
    }
}