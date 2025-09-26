import { ethers } from "ethers";
import * as fs from "fs/promises";

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

const CONTRACT_ABI = [
  "function claimProtection(uint256 policyId, uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[7] calldata _pubSignals) external",
  "function policies(uint256) view returns (bytes32 commitment, bytes32 asinHash, uint256 purchaseDate, uint256 premium, uint256 maxCoverage, bool claimed, address owner)",
  "event ClaimProcessed(uint256 indexed policyId, uint256 payout, address indexed recipient)",
];

async function claimProtection() {
  try {
    // Load proof and policy data
    const proofDataRaw = await fs.readFile("proof-data.json", "utf-8");
    const proofData = JSON.parse(proofDataRaw);

    const policyDataRaw = await fs.readFile("policy-data.json", "utf-8");
    const policyData = JSON.parse(policyDataRaw);

    const policyId = policyData.policyId;

    // Connect to contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      wallet
    );

    console.log("🚀 Submitting claim...");
    console.log("Policy ID:", policyId);
    console.log("Connected as:", wallet.address);

    // Check policy status
    const policy = await contract.policies(policyId);
    if (policy.claimed) {
      console.log("❌ Policy already claimed!");
      return;
    }

    console.log("Policy Commitment:", policy.commitment);
    console.log("Policy ASIN Hash:", policy.asinHash);

    // Submit claim with ZK proof
    console.log("\n📤 Submitting ZK proof...");
    const tx = await contract.claimProtection(
      policyId,
      proofData.proof.a,
      proofData.proof.b,
      proofData.proof.c,
      proofData.publicSignals
    );

    console.log("📡 Transaction submitted:", tx.hash);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("✅ Claim processed!");
    console.log("Block:", receipt.blockNumber);

    // Parse events
    const event = receipt.logs.find((log: any) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return parsedLog?.name === "ClaimProcessed";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsedEvent = contract.interface.parseLog(event);
      const payout = parsedEvent?.args[1];
      console.log("💰 Payout received:", ethers.formatUnits(payout, 2), "INR");
    }
  } catch (error) {
    console.error("Error claiming protection:", error);
    throw error;
  }
}

// Main execution
(async () => {
  await claimProtection();
})().catch(console.error);
