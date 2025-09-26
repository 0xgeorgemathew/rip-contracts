import * as snarkjs from "snarkjs";
import * as fs from "fs/promises";
import path from "path";

interface CommitmentData {
  commitment: string;
  asinHash: string;
  invoice: {
    orderNumber: string;
    invoiceNumber: string;
    price: number;
    date: number;
    transactionId: string;
    asin: string;
  };
  nonce: string;
  orderNumberHash: string;
  timestamp: number;
}

async function generateProof(
  policyId: number,
  currentOraclePrice: number,
  policyStartDate: number
) {
  try {
    // Load commitment data
    const commitmentDataRaw = await fs.readFile(
      "commitment-data.json",
      "utf-8"
    );
    const commitmentData: CommitmentData = JSON.parse(commitmentDataRaw);

    // Prepare circuit inputs
    const input = {
      // Private inputs
      order_number_hash: commitmentData.orderNumberHash,
      invoice_price: commitmentData.invoice.price.toString(),
      invoice_date: commitmentData.invoice.date.toString(),
      asin_hash: BigInt(commitmentData.asinHash).toString(),
      nonce: commitmentData.nonce,

      // Public inputs
      commitment: BigInt(commitmentData.commitment).toString(),
      public_asin_hash: BigInt(commitmentData.asinHash).toString(),
      policy_start_date: policyStartDate.toString(),
      current_oracle_price: currentOraclePrice.toString(),
      policy_id: policyId.toString(),
    };

    console.log("🔐 Generating ZK Proof...");
    console.log("Invoice Price:", commitmentData.invoice.price);
    console.log("Current Oracle Price:", currentOraclePrice);
    console.log(
      "Expected Price Drop:",
      commitmentData.invoice.price - currentOraclePrice
    );

    // Paths to circuit files
    const wasmPath = path.join(
      __dirname,
      "../circuits/build/priceProtection_js/priceProtection.wasm"
    );
    const zkeyPath = path.join(__dirname, "../circuits/circuit_final.zkey");

    // Generate proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    // Format proof for Solidity
    const solidityProof = {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [
        [proof.pi_b[0][1], proof.pi_b[0][0]],
        [proof.pi_b[1][1], proof.pi_b[1][0]],
      ],
      c: [proof.pi_c[0], proof.pi_c[1]],
    };

    // Prepare call data
    const proofData = {
      proof: solidityProof,
      publicSignals,
      metadata: {
        policyId,
        validClaim: publicSignals[5], // valid_claim output
        priceDifference: publicSignals[6], // price_difference output
        commitment: commitmentData.commitment,
        asinHash: commitmentData.asinHash,
      },
    };

    // Save proof
    await fs.writeFile("proof-data.json", JSON.stringify(proofData, null, 2));

    console.log("✅ Proof Generated!");
    console.log("Valid Claim:", publicSignals[5] === "1" ? "YES" : "NO");
    console.log("Price Difference:", publicSignals[6], "cents");
    console.log("Proof saved to proof-data.json");

    return proofData;
  } catch (error) {
    console.error("Error generating proof:", error);
    throw error;
  }
}

// Main execution
(async () => {
  const policyId = 1;
  const currentOraclePrice = 45000; // Price dropped to ₹450
  const policyStartDate = Math.floor(new Date("2025-08-01").getTime() / 1000);

  await generateProof(policyId, currentOraclePrice, policyStartDate);
})().catch(console.error);
