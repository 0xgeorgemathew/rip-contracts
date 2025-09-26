import { ethers } from "ethers";
import dotenv from "dotenv";
import { loadContractABI, loadDeploymentAddresses } from "./utils/contractLoader";
dotenv.config();

// TOKEN_MULTIPLIER constant for 6 decimal conversions
const TOKEN_MULTIPLIER = 1000000; // 10^6 for 6 decimals

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

async function debugPolicy() {
  console.log("🔍 Debugging on-chain policy data vs proof data...");

  try {
    // Load deployment addresses
    const deployment = await loadDeploymentAddresses();
    const CONTRACT_ADDRESS = deployment.oracle;

    if (!CONTRACT_ADDRESS) {
      throw new Error("Contract address not found in deployment.json");
    }

    // Load contract ABI and connect
    const contractABI = await loadContractABI("PriceProtectionOracle");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

    const policyId = 1;
    console.log(`\n📄 Querying policy ${policyId} from contract...`);

    const policy = await contract.policies(policyId);
    console.log("On-chain policy data:");
    console.log("  secretCommitment:", policy.secretCommitment);
    console.log("  productId:", policy.productId);
    console.log("  policyPurchaseDate:", policy.policyPurchaseDate.toString(), "(seconds)");
    console.log("  paidPremium:", ethers.formatUnits(policy.paidPremium, 6), "USDC");
    console.log("  purchasePrice:", ethers.formatUnits(policy.purchasePrice, 6), "USDC");
    console.log("  alreadyClaimed:", policy.alreadyClaimed);
    console.log("  buyer:", policy.buyer);

    // Get current price
    const currentPrice = await contract.currentPrices(policy.productId);
    console.log("\n💰 Current oracle price:");
    console.log("  Product:", policy.productId);
    console.log("  Current price:", ethers.formatUnits(currentPrice, 6), "USDC");
    console.log("  Price difference:", ethers.formatUnits(policy.purchasePrice - currentPrice, 6), "USDC");

    // Load local proof data for comparison
    const fs = await import("fs/promises");
    const proofData = JSON.parse(await fs.readFile("proof-data.json", "utf-8"));

    console.log("\n🔍 Comparing with proof data:");
    console.log("Proof publicSignals[2] (commitment):", proofData.publicSignals[2]);
    console.log("Contract commitment:", policy.secretCommitment);
    console.log("Match:", BigInt(proofData.publicSignals[2]).toString() === policy.secretCommitment.toString());

    console.log("\nProof publicSignals[4] (policyStartDate):", proofData.publicSignals[4]);
    console.log("Contract policyPurchaseDate:", policy.policyPurchaseDate.toString());
    console.log("Match:", proofData.publicSignals[4] === policy.policyPurchaseDate.toString());

    console.log("\nProof publicSignals[5] (currentPrice):", proofData.publicSignals[5]);
    console.log("Contract currentPrice:", currentPrice.toString());
    console.log("Match:", proofData.publicSignals[5] === currentPrice.toString());

    console.log("\nProof publicSignals[6] (policyId):", proofData.publicSignals[6]);
    console.log("Contract policyId:", policyId.toString());
    console.log("Match:", proofData.publicSignals[6] === policyId.toString());

  } catch (error) {
    console.error("Error debugging policy:", error);
  }
}

(async () => {
  await debugPolicy();
})().catch(console.error);