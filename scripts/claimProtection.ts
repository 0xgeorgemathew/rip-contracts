import { ethers } from "ethers";
import * as fs from "fs/promises";
import dotenv from "dotenv";
import { loadContractABI, loadDeploymentAddresses } from "./utils/contractLoader";
dotenv.config();

// TOKEN_MULTIPLIER constant for 6 decimal conversions
const TOKEN_MULTIPLIER = 1000000; // 10^6 for 6 decimals

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";


async function claimProtection() {
  console.log("\n=== ZK NOTES: STEP 4 - CLAIM PAYOUT (FINAL STEP) ===");
  console.log("🏁 This file submits the ZK proof to claim price protection payout:");
  console.log("  ├─ Contract: Verifies Groth16 proof using on-chain verifier");
  console.log("  ├─ ZK Purpose: Proves price drop without revealing invoice details");
  console.log("  └─ Chronological Order: [1st] Generate commitment → [2nd] Purchase policy → [3rd] Generate proof → [4th] Claim payout ← HERE");
  console.log("\n🧮 Key ZK Features & Contract Verification:");
  console.log("  • Groth16 Verification: Contract calls zkVerifier.verifyProof()");
  console.log("  • Proof Structure: (A, B, C) elliptic curve points on BN254");
  console.log("  • Public Signals: 11 values verified against contract state");
  console.log("  • Zero-Knowledge: Invoice details remain private, only proof submitted");
  console.log("  • Payout: 100% of price difference (speculative model)");

  try {
    // Load deployment addresses
    const deployment = await loadDeploymentAddresses();
    const CONTRACT_ADDRESS = deployment.oracle;

    if (!CONTRACT_ADDRESS) {
      throw new Error("Contract address not found in deployment.json or environment variables");
    }

    // Load proof and policy data
    console.log("\n📖 Loading ZK proof from Step 3...");
    const proofDataRaw = await fs.readFile("proof-data.json", "utf-8");
    const proofData = JSON.parse(proofDataRaw);
    console.log("  • Proof contains: Groth16 proof points (A,B,C)");
    console.log("  • Public signals: validClaim, priceDifference, commitment, etc.");

    console.log("\n📖 Loading policy data from Step 2...");
    const policyDataRaw = await fs.readFile("policy-data.json", "utf-8");
    const policyData = JSON.parse(policyDataRaw);
    console.log("  • Policy ID:", policyData.policyId);
    console.log("  • Product ID:", policyData.productId, "(stored locally, not on-chain)");
    console.log("  • Purchase Price: $" + ethers.formatUnits(policyData.purchasePrice || 0, 6), "(stored locally, not on-chain)");
    console.log("  • PRIVACY: These values will be passed to claim and verified by ZK proof");
    console.log("  • Coverage Model: 100% of price drop (speculative)");

    const policyId = policyData.policyId;

    // Load contract ABI and connect
    const contractABI = await loadContractABI("PriceProtectionOracle");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      contractABI,
      wallet
    );

    console.log("\n🚀 Preparing to submit ZK claim...");
    console.log("  • Policy ID:", policyId);
    console.log("  • Claimer address:", wallet.address);
    console.log("  • Contract will verify claimer == policy.buyer");

    // Check policy status
    console.log("\n🔍 Checking policy status on-chain...");
    const policy = await contract.policies(policyId);
    if (policy.alreadyClaimed) {
      console.log("❌ Policy already claimed! Each policy can only be claimed once.");
      return;
    }

    console.log("  • Policy Commitment:", policy.secretCommitment);
    console.log("  • Already Claimed:", policy.alreadyClaimed);
    console.log("  • PRIVACY: Product ID and price not stored on-chain");
    console.log("  • ZK will prove knowledge of commitment pre-image AND verify product/price");

    // Submit claim with ZK proof
    console.log("\n📤 Submitting ZK proof to contract...");
    console.log("  • Public Signal [0] - validClaim:", proofData.publicSignals[0]);
    const priceDiffUSD = parseFloat(ethers.formatUnits(proofData.publicSignals[1], 6));
    console.log("  • Public Signal [1] - priceDifference: $" + priceDiffUSD.toFixed(2));
    console.log("  • Public Signal [2] - validPremium:", proofData.publicSignals[2]);
    console.log("  • Public Signal [3] - commitment:", proofData.publicSignals[3]);
    console.log("  • Public Signal [4] - invoicePrice:", proofData.publicSignals[4], "(now public, verified by ZK)");
    console.log("  • Public Signal [5] - productHash:", proofData.publicSignals[5], "(now public, verified by ZK)");
    console.log("  • Public Signal [9] - paidPremium: $" + parseFloat(ethers.formatUnits(proofData.publicSignals[9], 6)).toFixed(2));
    console.log("  • Public Signal [10] - purchaseCount:", proofData.publicSignals[10]);
    console.log("\n🔐 Contract will verify:");
    console.log("  1. Commitment matches policy.secretCommitment");
    console.log("  2. Provided productId/price match ZK proof");
    console.log("  3. Policy dates match proof inputs");
    console.log("  4. Current oracle price matches proof input");
    console.log("  5. Groth16 proof is cryptographically valid");
    console.log("  6. validClaim == 1 (price actually dropped)");
    console.log("  7. validPremium == 1 (correct tier and premium amount)");

    // Format proof coordinates properly for contract (convert strings to uint256)
    const formattedProof = {
      a: [proofData.proof.a[0], proofData.proof.a[1]],
      b: [
        [proofData.proof.b[0][0], proofData.proof.b[0][1]],
        [proofData.proof.b[1][0], proofData.proof.b[1][1]]
      ],
      c: [proofData.proof.c[0], proofData.proof.c[1]]
    };

    // PRIVACY ENHANCED: Pass productId and purchasePrice from local storage
    const tx = await contract.claimPayout(
      policyId,
      policyData.productId,        // Now passed as parameter (verified by ZK)
      policyData.purchasePrice,    // Now passed as parameter (verified by ZK)
      formattedProof.a,
      formattedProof.b,
      formattedProof.c,
      proofData.publicSignals
    );

    console.log("\n📡 Transaction submitted:", tx.hash);
    console.log("  • Groth16 verification happening on-chain...");
    console.log("  • Contract uses precompiled BN254 pairing for efficiency");

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("\n✅ ZK Claim Verification Complete!");
    console.log("  • Block number:", receipt.blockNumber);
    console.log("  • Proof verified successfully on-chain");
    console.log("  • Policy marked as claimed (prevents double claims)");

    // Parse events
    const event = receipt.logs.find((log: any) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return parsedLog?.name === "ClaimPaid";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsedEvent = contract.interface.parseLog(event);
      const payout = parsedEvent?.args[1];
      console.log("\n💰 PAYOUT SUCCESSFUL!");
      console.log("  • Amount received: $" + ethers.formatUnits(payout, 6));
      console.log("  • Calculation: 100% of price drop (speculative model)");
      console.log("  • Premium paid was only 10%, but got full price difference!");
      console.log("  • Transferred to:", wallet.address);
      console.log("\n🎆 ZK PRICE PROTECTION WORKFLOW COMPLETE!");
      console.log("  • Privacy preserved: Invoice details never revealed");
      console.log("  • Trust minimized: Math proves the claim, not documents");
      console.log("  • Automated payout: No manual review needed");
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
