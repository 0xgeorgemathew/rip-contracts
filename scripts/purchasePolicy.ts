import { ethers } from "ethers";
import * as fs from "fs/promises";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

const CONTRACT_ABI = [
  "function getQuote(string calldata asin) external view returns (uint256 premium, uint256 maxCoverage, uint256 currentPrice)",
  "function purchasePolicy(bytes32 commitment, string calldata asin) external payable returns (uint256 policyId)",
  "event PolicyPurchased(uint256 indexed policyId, bytes32 indexed commitment, bytes32 indexed asinHash, address owner)",
];

async function purchasePolicy() {
  try {
    // Load commitment data
    const commitmentDataRaw = await fs.readFile(
      "commitment-data.json",
      "utf-8"
    );
    const commitmentData = JSON.parse(commitmentDataRaw);

    // Connect to contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      wallet
    );

    const asin = commitmentData.invoice.asin;

    console.log("📊 Getting quote for ASIN:", asin);

    // Get quote
    const quote = await contract.getQuote(asin);
    const premium = quote.premium;
    const maxCoverage = quote.maxCoverage;
    const currentPrice = quote.currentPrice;

    console.log("Current Price:", ethers.formatUnits(currentPrice, 2), "INR");
    console.log("Premium Required:", ethers.formatUnits(premium, 2), "INR");
    console.log("Max Coverage:", ethers.formatUnits(maxCoverage, 2), "INR");

    // Purchase policy
    console.log("\n🛡️ Purchasing policy...");
    console.log("Commitment:", commitmentData.commitment);

    const tx = await contract.purchasePolicy(commitmentData.commitment, asin, {
      value: premium,
    });

    console.log("📡 Transaction submitted:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("✅ Policy purchased!");
    console.log("Block:", receipt.blockNumber);

    // Parse events to get policy ID
    const event = receipt.logs.find((log: any) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return parsedLog?.name === "PolicyPurchased";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsedEvent = contract.interface.parseLog(event);
      const policyId = parsedEvent?.args[0];
      console.log("📝 Policy ID:", policyId.toString());

      // Save policy data
      const policyData = {
        policyId: policyId.toString(),
        commitment: commitmentData.commitment,
        asin,
        asinHash: commitmentData.asinHash,
        premium: premium.toString(),
        maxCoverage: maxCoverage.toString(),
        purchaseDate: Date.now(),
        txHash: tx.hash,
      };

      await fs.writeFile(
        "policy-data.json",
        JSON.stringify(policyData, null, 2)
      );
      console.log("Policy data saved to policy-data.json");
    }
  } catch (error) {
    console.error("Error purchasing policy:", error);
    throw error;
  }
}

// Main execution
(async () => {
  await purchasePolicy();
})().catch(console.error);
