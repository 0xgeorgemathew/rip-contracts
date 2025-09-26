// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/InsuranceVault.sol";
import "../src/verifier/Groth16Verifier.sol";
import "../src/Token.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        vm.startBroadcast(deployerPrivateKey);

        // Deploy verifier
        Groth16Verifier zkVerifier = new Groth16Verifier();
        console.log("Verifier deployed at:", address(zkVerifier));

        // Deploy ERC-20 token
        Token mockUSDC = new Token();
        console.log("Token deployed at:", address(mockUSDC));

        // Deploy Insurance Vault contract
        InsuranceVault insuranceVault = new InsuranceVault(address(zkVerifier), address(mockUSDC));
        console.log("InsuranceVault deployed at:", address(insuranceVault));

        // Mint 1000 tokens to InsuranceVault (with 6 decimals = 1000 * 10^6)
        mockUSDC.mint(address(insuranceVault), 1000 * 10**6);
        console.log("Minted 1000 tokens to InsuranceVault");
        console.log("InsuranceVault MockUSDC balance:", mockUSDC.balanceOf(address(insuranceVault)) / 10**6, "USDC");

        // Mint 1000 tokens to deployer for testing (with 6 decimals = 1000 * 10^6)
        mockUSDC.mint(deployerAddress, 1000 * 10**6);
        console.log("Minted 1000 tokens to deployer for testing");
        console.log("Deployer MockUSDC balance:", mockUSDC.balanceOf(deployerAddress) / 10**6, "USDC");

        vm.stopBroadcast();

        // Write deployment addresses to JSON file
        string memory deploymentJson = string(abi.encodePacked(
            '{\n',
            '  "verifier": "', vm.toString(address(zkVerifier)), '",\n',
            '  "token": "', vm.toString(address(mockUSDC)), '",\n',
            '  "vault": "', vm.toString(address(insuranceVault)), '",\n',
            '  "deployer": "', vm.toString(deployerAddress), '",\n',
            '  "timestamp": "', vm.toString(block.timestamp), '"\n',
            '}'
        ));

        vm.writeFile("deployment.json", deploymentJson);
        console.log("Deployment addresses written to deployment.json");
    }
}