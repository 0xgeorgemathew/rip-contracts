import dotenv from "dotenv";
import { ethers } from "ethers";
import * as fs from "fs/promises";
import * as path from "path";
import * as snarkjs from "snarkjs";
import { loadContractABI, loadDeploymentAddresses } from "./utils/contractLoader";
dotenv.config();

// TOKEN_MULTIPLIER constant for 6 decimal conversions
const TOKEN_MULTIPLIER = 1000000; // 10^6 for 6 decimals

interface CommitmentData {
  commitment: string;
  productHash: string;
  productId: string;
  invoice: {
    orderNumber: string;
    invoiceNumber: string;
    price: number;
    date: number;
    transactionId: string;
    asin: string;
  };
  salt: string;
  orderHash: string;
  selectedTier: number; // NEW: Tier selection
  timestamp: number;
}

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

async function getCurrentOraclePrice(productId: string): Promise<number> {
  try {
    const deployment = await loadDeploymentAddresses();
    const CONTRACT_ADDRESS = deployment.oracle;

    if (!CONTRACT_ADDRESS) {
      throw new Error("Contract address not found");
    }

    const contractABI = await loadContractABI("PriceProtectionOracle");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);

    const currentPrice = await contract.currentPrices(productId);
    return Number(currentPrice);
  } catch (error) {
    console.error("Error fetching oracle price:", error);
    throw error;
  }
}

async function generateProof(policyId: number, currentOraclePrice: number, policyStartDate: number, paidPremium: number, purchaseCount: number) {
  try {
    console.log("\n=== ZK NOTES: STEP 3 - PROOF GENERATION ===");
    console.log("🔐 This file creates proof-data.json which will be used in:");
    console.log("  ├─ Contract: Submit ZK proof to claimPayout() for verification");
    console.log("  ├─ ZK Circuit: Prove valid price drop without revealing invoice details");
    console.log(
      "  └─ Chronological Order: [1st] Generate commitment → [2nd] Purchase policy → [3rd] Generate proof ← HERE → [4th] Claim payout"
    );
    console.log("\n🧮 Key ZK Features Used:");
    console.log("  • Groth16 ZK-SNARK: Efficient zero-knowledge proof system");
    console.log("  • Circuit Constraints: Verify price drop & commitment validity");
    console.log("  • Public/Private Inputs: Hide invoice data, expose only necessary verification data");
    console.log("  • Tier Validation: Verify correct premium tier selected for purchase price");
    console.log("  • snarkjs: JavaScript library for generating & verifying ZK proofs");

    // Load commitment data
    console.log("\n📖 Loading commitment data from commitment-data.json...");
    const commitmentDataRaw = await fs.readFile("commitment-data.json", "utf-8");
    const commitmentData: CommitmentData = JSON.parse(commitmentDataRaw);
    console.log("  └─ Loaded commitment & private values for circuit inputs");

    // Prepare circuit inputs
    console.log("\n🔧 Preparing circuit inputs (PRIVACY ENHANCED):");
    console.log("  • Private Inputs (hidden from verifier):");
    console.log("    - orderHash: Proves knowledge of original order");
    console.log("    - invoiceDate: When product was bought (secret)");
    console.log("    - salt: Random nonce from commitment (secret)");
    console.log("    - selectedTier: Which premium tier was chosen (secret)");
    console.log("  • Public Inputs (visible to verifier):");
    console.log("    - commitment: Hash stored on-chain during policy purchase");
    console.log("    - invoicePrice: Purchase price (PUBLIC - verified by ZK)");
    console.log("    - productHash: Product identifier (PUBLIC - verified by ZK)");
    console.log("    - policyStartDate: When protection began");
    console.log("    - currentPrice: Current oracle price");
    console.log("    - policyId: Policy being claimed");
    console.log("    - paidPremium: Premium amount paid (PUBLIC)");
    console.log("    - purchaseCount: Policy count at purchase (PUBLIC)");
    const input = {
      // Private inputs (kept secret from verifier)
      orderHash: commitmentData.orderHash,
      invoiceDate: commitmentData.invoice.date.toString(),
      salt: commitmentData.salt,
      selectedTier: commitmentData.selectedTier.toString(), // NEW: Tier selection

      // Public inputs (visible to verifier - TIER ENHANCED)
      commitment: BigInt(commitmentData.commitment).toString(),
      invoicePrice: commitmentData.invoice.price.toString(), // PUBLIC - verified against commitment
      productHash: BigInt(commitmentData.productHash).toString(), // PUBLIC - verified against commitment
      policyStartDate: policyStartDate.toString(),
      currentPrice: currentOraclePrice.toString(),
      policyId: policyId.toString(),
      paidPremium: paidPremium.toString(), // NEW: Premium paid
      purchaseCount: purchaseCount.toString(), // NEW: Purchase count snapshot
    };

    console.log("\n🔐 Generating ZK Proof using Groth16...");
    console.log("📊 Price Analysis:");
    console.log(
      "  • Invoice Price: $" + (commitmentData.invoice.price / 1000000).toFixed(2) + " (" + commitmentData.invoice.price + " in 6 decimals)"
    );
    console.log("  • Current Oracle Price: $" + (currentOraclePrice / 1000000).toFixed(2) + " (" + currentOraclePrice + " in 6 decimals)");
    const expectedDrop = commitmentData.invoice.price - currentOraclePrice;
    if (expectedDrop > 0) {
      console.log("  • Expected Price Drop: $" + (expectedDrop / 1000000).toFixed(2) + " (" + expectedDrop + " in 6 decimals)");
      console.log("  • SPECULATIVE PAYOUT: 100% of drop = $" + (expectedDrop / 1000000).toFixed(2));
    } else {
      console.log("  • No price drop detected (claim will be invalid)");
    }
    console.log("\n⚙️ Circuit will verify:");
    console.log("  1. Commitment = hash(orderHash, invoicePrice, invoiceDate, productHash, salt, tier)");
    console.log("  2. Correct tier selected: tier matches invoice price range");
    console.log("  3. Premium calculation: paid = (tierBase * dynamicFactor / 100)");
    console.log("  4. Price drop exists: invoicePrice > currentPrice");
    console.log("  5. Policy started before price check");
    console.log("  6. All constraints satisfied → validClaim = 1 AND validPremium = 1");

    // Paths to circuit files
    console.log("\n📁 Loading circuit artifacts:");
    const wasmPath = path.join(__dirname, "../circuits/build/priceProtection_js/priceProtection.wasm");
    const zkeyPath = path.join(__dirname, "../circuits/circuit_final.zkey");
    console.log("  • WASM file (compiled circuit):", wasmPath);
    console.log("  • Proving key (ceremony result):", zkeyPath);

    // Generate proof
    console.log("\n🔄 Executing snarkjs.groth16.fullProve()...");
    console.log("  • Computing witness from circuit inputs");
    console.log("  • Generating cryptographic proof");
    console.log("  • This proves statement without revealing private data");
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    console.log("✅ ZK Proof generation complete!");

    // Format proof for Solidity
    console.log("\n🔧 Formatting proof for Solidity contract verification:");
    console.log("  • Converting elliptic curve points to contract-compatible format");
    console.log("  • Groth16 proof structure: (A, B, C) points on bn254 curve");
    const solidityProof = {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
    };
    console.log("  └─ Proof points formatted for contract input");

    // Prepare call data
    console.log("\n📋 Analyzing public signals from circuit (TIER ENHANCED):");
    // Public signals order with tier validation:
    // [0] = validClaim (output)
    // [1] = priceDifference (output)
    // [2] = validPremium (output)
    // [3] = commitment (public input)
    // [4] = invoicePrice (public input)
    // [5] = productHash (public input)
    // [6] = policyStartDate (public input)
    // [7] = currentPrice (public input)
    // [8] = policyId (public input)
    // [9] = paidPremium (public input)
    // [10] = purchaseCount (public input)
    console.log("  • Public Signal [0] - validClaim (circuit output):", publicSignals[0]);
    console.log("  • Public Signal [1] - priceDifference (circuit output):", publicSignals[1]);
    console.log("  • Public Signal [2] - validPremium (circuit output):", publicSignals[2]);
    console.log("  • Public Signal [3] - commitment (public input):", publicSignals[3]);
    console.log("  • Public Signal [4] - invoicePrice (public input):", publicSignals[4]);
    console.log("  • Public Signal [5] - productHash (public input):", publicSignals[5]);
    console.log("  • Public Signal [6] - policyStartDate (public input):", publicSignals[6]);
    console.log("  • Public Signal [7] - currentPrice (public input):", publicSignals[7]);
    console.log("  • Public Signal [8] - policyId (public input):", publicSignals[8]);
    console.log("  • Public Signal [9] - paidPremium (public input):", publicSignals[9]);
    console.log("  • Public Signal [10] - purchaseCount (public input):", publicSignals[10]);
    const proofData = {
      proof: solidityProof,
      publicSignals,
      metadata: {
        policyId,
        validClaim: publicSignals[0], // validClaim output
        priceDifference: publicSignals[1], // priceDifference output
        validPremium: publicSignals[2], // validPremium output
        commitment: commitmentData.commitment,
        productHash: commitmentData.productHash,
        selectedTier: commitmentData.selectedTier,
      },
    };

    // Save proof
    console.log("\n💾 Saving proof data to proof-data.json for claim submission...");
    await fs.writeFile("proof-data.json", JSON.stringify(proofData, null, 2));

    // Verify the proof locally before saving
    console.log("\n🔍 Local proof verification (safety check):");
    console.log("  • Loading verification key from trusted setup ceremony");
    console.log("  • Verifying proof cryptographically before contract submission");

    // Load verification key
    const vKeyPath = path.join(__dirname, "../circuits/verification_key.json");
    const vKey = JSON.parse(await fs.readFile(vKeyPath, "utf-8"));
    console.log("  • Verification key loaded from:", vKeyPath);

    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    console.log("  • Proof verification result:", isValid ? "VALID ✅" : "INVALID ❌");

    if (!isValid) {
      throw new Error("Generated proof is invalid!");
    }

    console.log("\n✅ PROOF GENERATION COMPLETE");
    console.log("✅ Proof verified successfully!");
    console.log("✅ Proof Generated!");
    console.log("📊 Claim Analysis:");
    console.log("  • Valid Claim:", publicSignals[0] === "1" ? "YES ✅" : "NO ❌");
    console.log("  • Valid Premium:", publicSignals[2] === "1" ? "YES ✅" : "NO ❌");
    console.log("  • Selected Tier:", commitmentData.selectedTier);
    const priceDiffUSD = parseFloat(publicSignals[1]) / 1000000;
    const premiumUSD = parseFloat(publicSignals[9]) / 1000000;
    console.log("  • Price Difference: $" + priceDiffUSD.toFixed(2) + " (" + publicSignals[1] + " in 6 decimals)");
    console.log("  • Premium Paid: $" + premiumUSD.toFixed(2) + " (Tier " + commitmentData.selectedTier + ")");
    if (publicSignals[0] === "1" && publicSignals[2] === "1") {
      console.log("  • Speculative Payout: $" + priceDiffUSD.toFixed(2) + " (100% of price drop)");
      const returnRatio = (priceDiffUSD / premiumUSD * 100);
      console.log("  • Return on Premium: " + returnRatio.toFixed(0) + "%");
    }
    console.log("  • Proof saved to proof-data.json");
    console.log("\n🔄 NEXT STEP: Run 'npm run claim' to submit proof on-chain");

    return proofData;
  } catch (error) {
    console.error("Error generating proof:", error);
    throw error;
  }
}

// Main execution
(async () => {
  // Load policy data
  const policyDataRaw = await fs.readFile("policy-data.json", "utf-8");
  const policyData = JSON.parse(policyDataRaw);

  // Load commitment data to get product ID
  const commitmentDataRaw = await fs.readFile("commitment-data.json", "utf-8");
  const commitmentData = JSON.parse(commitmentDataRaw);

  const policyId = Number(policyData.policyId);
  const policyStartDate = Math.floor(policyData.purchaseDate / 1000);
  const paidPremium = Number(policyData.premium);
  const purchaseCount = Number(policyData.purchaseCount);

  console.log("📊 Policy Information:");
  console.log("  • Policy ID:", policyId);
  console.log("  • Selected Tier:", commitmentData.selectedTier);
  console.log("  • Premium Paid: $" + (paidPremium / 1000000).toFixed(2));
  console.log("  • Purchase Count at Buy:", purchaseCount);

  // Fetch current oracle price
  console.log("📊 Fetching current oracle price for", commitmentData.productId);
  const currentOraclePrice = await getCurrentOraclePrice(commitmentData.productId);
  console.log("Current Oracle Price: $" + ethers.formatUnits(currentOraclePrice, 6));
  console.log("Original Invoice Price: $" + ethers.formatUnits(commitmentData.invoice.price, 6));

  if (currentOraclePrice >= commitmentData.invoice.price) {
    console.log("⚠️  Warning: Current price is not lower than invoice price. Claim may not be valid.");
    console.log("Consider running 'npm run update-price' to simulate a price drop.");
  } else {
    const priceDrop = commitmentData.invoice.price - currentOraclePrice;
    console.log("✅ Price drop detected: $" + ethers.formatUnits(priceDrop, 6));
    console.log("💰 Speculative payout will be: $" + ethers.formatUnits(priceDrop, 6) + " (100% of price drop)");
  }

  await generateProof(policyId, currentOraclePrice, policyStartDate, paidPremium, purchaseCount);
})().catch(console.error);
