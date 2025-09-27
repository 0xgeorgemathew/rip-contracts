import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { getContractInstance, loadDeploymentAddresses } from "./utils/contractLoader";

dotenv.config();

const TOKEN_ADDRESS = "0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9";

async function validateEnvironment(): Promise<void> {
  if (!process.env.USER_PRIVATE_KEY)
    throw new Error("USER_PRIVATE_KEY environment variable required");
  if (!process.env.RPC_URL)
    throw new Error("RPC_URL environment variable required");

  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    await provider.getNetwork();
  } catch (error) {
    throw new Error(`RPC connection failed: ${error}`);
  }
}

async function main(): Promise<void> {
  try {
    console.log("Validating environment...");
    await validateEnvironment();

    console.log("Loading deployment addresses...");
    const deployment = await loadDeploymentAddresses();
    if (!deployment.vault)
      throw new Error("Vault address not found in deployment");

    console.log("Connecting to blockchain...");
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
    const userAddress = await signer.getAddress();

    console.log("Loading token contract...");
    const token = await getContractInstance("Token", TOKEN_ADDRESS, signer);

    console.log(`\nUser: ${userAddress}`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`Vault: ${deployment.vault}`);

    console.log("\nChecking current state...");
    const balance = await token.balanceOf(userAddress);
    const currentAllowance = await token.allowance(userAddress, deployment.vault);

    console.log(`Token Balance: $${ethers.formatUnits(balance, 6)}`);
    console.log(`Current Allowance: $${ethers.formatUnits(currentAllowance, 6)}`);

    if (currentAllowance >= ethers.MaxUint256 / 2n) {
      console.log("✅ Token already has infinite approval for vault");
      return;
    }

    console.log("\nApproving infinite token spending...");
    const approveTx = await token.approve(deployment.vault, ethers.MaxUint256);
    console.log(`Transaction submitted: ${approveTx.hash}`);

    console.log("Waiting for confirmation...");
    const receipt = await approveTx.wait();
    console.log(`✅ Approval confirmed in block ${receipt.blockNumber}`);

    console.log(`Explorer: https://sepolia.etherscan.io/tx/${receipt.hash}`);

    console.log("\nVerifying approval...");
    const newAllowance = await token.allowance(userAddress, deployment.vault);
    console.log(`New Allowance: ${newAllowance.toString()}`);

    if (newAllowance === ethers.MaxUint256) {
      console.log("✅ Infinite approval successfully set!");
    } else {
      console.log("⚠️ Approval may not have been set correctly");
    }

  } catch (error: any) {
    console.error(`\nToken Approval Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}