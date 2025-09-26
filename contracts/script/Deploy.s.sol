// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import "../src/PriceProtectionOracle.sol";
import "../src/verifier/Groth16Verifier.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy verifier
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Verifier deployed at:", address(verifier));
        
        // Deploy main contract
        PriceProtectionOracle oracle = new PriceProtectionOracle(address(verifier));
        console.log("PriceProtectionOracle deployed at:", address(oracle));
        
        vm.stopBroadcast();
    }
}