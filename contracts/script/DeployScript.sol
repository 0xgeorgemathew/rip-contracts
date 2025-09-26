// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/InsuranceVault.sol";
import "../src/verifier/PriceProtectionVerifier.sol";
import "forge-std/interfaces/IERC20.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        // LOAD USER ADDRESS FROM ENV
        address userAddress = vm.envAddress("USER_ADDRESS");
        console.log("User address:", userAddress);
        vm.startBroadcast(deployerPrivateKey);

        // Deploy verifier
        Groth16Verifier zkPriceProtectionVerifier = new Groth16Verifier();
        console.log("zkPriceProtectionVerifier deployed at:", address(zkPriceProtectionVerifier));

        // Use existing PYUSD token
        address PYUSD_ADDRESS = 0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9;
        console.log("Using PYUSD at:", PYUSD_ADDRESS);

        // Deploy Insurance Vault contract
        InsuranceVault insuranceVault = new InsuranceVault(address(zkPriceProtectionVerifier), PYUSD_ADDRESS);
        console.log("InsuranceVault deployed at:", address(insuranceVault));

        // Transfer 10 PYUSD to InsuranceVault (PYUSD has 6 decimals)
        IERC20 pyusdToken = IERC20(PYUSD_ADDRESS);
        uint256 transferAmount = 10 * 10**6; // 10 PYUSD with 6 decimals
        pyusdToken.transfer(address(insuranceVault), transferAmount);
        console.log("Transferred 10 PYUSD to InsuranceVault");

        vm.stopBroadcast();

        // Write deployment addresses to JSON file
        string memory deploymentJson = string(abi.encodePacked(
            '{\n',
            '  "verifier": "', vm.toString(address(zkPriceProtectionVerifier)), '",\n',
            '  "token": "', vm.toString(PYUSD_ADDRESS), '",\n',
            '  "vault": "', vm.toString(address(insuranceVault)), '",\n',
            '  "deployer": "', vm.toString(deployerAddress), '",\n',
            '  "timestamp": "', vm.toString(block.timestamp), '"\n',
            '}'
        ));

        vm.writeFile("deployment.json", deploymentJson);
        console.log("Deployment addresses written to deployment.json");
    }
}