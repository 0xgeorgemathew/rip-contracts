import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as fs from "fs/promises";
import * as path from "path";
import { PolicyData } from "./types";
import { getContractInstance, loadDeploymentAddresses } from "./utils/contractLoader";
import { formatUSDC } from "./utils/formatUtils";
import { OracleClient } from "./utils/oracleClient";
import { ProofGenerator } from "./utils/proofGenerator";

dotenv.config();

async function validateEnvironment(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  await provider.getNetwork();
  console.log("RPC connection verified");
}

async function loadPolicyData(): Promise<PolicyData> {
  const filePath = path.join(__dirname, "../policy-data/policy.json");

  try {
    const policyDataRaw = await fs.readFile(filePath, "utf-8");
    const policyData = JSON.parse(policyDataRaw);

    const requiredFields = [
      "policyId",
      "purchaseDetails",
      "secretCommitment",
      "premium",
      "policyPurchaseDate",
      "contracts.vault",
      "contracts.token",
      "createdAt",
    ];

    for (const field of requiredFields) {
      const keys = field.split(".");
      let obj = policyData;
      for (const key of keys) {
        if (!(key in obj)) throw new Error(`Missing required field: ${field}`);
        obj = obj[key];
      }
    }

    console.log(
      `Policy loaded: ${policyData.policyId} | Price: ${formatUSDC(policyData.purchaseDetails.invoicePrice)} | Premium: ${formatUSDC(
        policyData.premium
      )}`
    );
    return policyData;
  } catch (error) {
    throw new Error(`Failed to load policy data: ${error}`);
  }
}

async function checkPolicyEligibility(policyData: PolicyData, oracle: OracleClient) {
  console.log("\nPhase 1: Check Claim Eligibility");
  console.log("===================================");

  const productId = policyData.purchaseDetails.productId || (await oracle.extractProductId(policyData));
  const originalPriceNumber = Number(policyData.purchaseDetails.invoicePrice);
  const eligibility = await oracle.checkPriceEligibility(productId, originalPriceNumber);

  console.log(
    `Product: ${productId} | Original: ${formatUSDC(policyData.purchaseDetails.invoicePrice)} | Current: ${formatUSDC(eligibility.currentPrice)}`
  );
  console.log(
    `Drop: ${formatUSDC(eligibility.priceDropAmount)} (${eligibility.priceDropPercentage}%) | ${eligibility.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}`
  );

  return {
    productId,
    eligible: eligibility.eligible,
    currentPrice: eligibility.currentPrice,
    originalPrice: originalPriceNumber,
    potentialPayout: eligibility.priceDropAmount,
  };
}

async function generateClaimProof(policyData: PolicyData, productId: string, oracle: OracleClient) {
  console.log("\nPhase 2: Generate ZK Proof");
  console.log("==============================");

  console.log(`Fetching merkle proof for ${productId}...`);
  const oracleProof = await oracle.getMerkleProof(productId);
  const merkleRoot = await oracle.getMerkleRoot();
  console.log(`Merkle proof received | Root: ${merkleRoot}`);

  if (oracleProof.productHash !== policyData.purchaseDetails.productHash) {
    throw new Error(`Product hash mismatch! Policy: ${policyData.purchaseDetails.productHash}, Oracle: ${oracleProof.productHash}`);
  }
  console.log(`Product hash verification passed`);

  const circuitInputs = ProofGenerator.createCircuitInputs(policyData, oracleProof, merkleRoot);
  console.log(
    `Circuit inputs | Current: ${formatUSDC(circuitInputs.currentPrice)} | Invoice: ${formatUSDC(circuitInputs.invoicePrice)} | Proof length: ${
      circuitInputs.merkleProof.length
    }`
  );

  const invalidPathIndices = circuitInputs.leafIndex.filter((idx) => idx !== 0 && idx !== 1);
  if (invalidPathIndices.length > 0) {
    console.warn(`Warning: Non-binary path indices detected: ${invalidPathIndices}`);
  }

  const proofGenerator = new ProofGenerator();
  const { proof, publicSignals } = await proofGenerator.generateProof(circuitInputs);
  proofGenerator.validatePublicSignals(publicSignals);

  console.log("Verifying proof locally...");
  const isValid = await proofGenerator.verifyProof(proof, publicSignals);
  console.log(isValid ? "Proof verification passed" : "Local proof verification failed (contract verification is authoritative)");

  return { proof, publicSignals, merkleRoot };
}

async function submitClaim(policyData: PolicyData, proof: any, publicSignals: string[], merkleRoot: string) {
  console.log("\nPhase 3: Submit Claim to Contract");
  console.log("====================================");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
  const deployment = await loadDeploymentAddresses();
  if (!deployment.vault) throw new Error("Vault address not found in deployment");

  const vault = await getContractInstance("InsuranceVault", deployment.vault, signer);
  console.log(`Vault: ${deployment.vault} | Claimant: ${await signer.getAddress()}`);

  const policyId = policyData.policyId;
  const commitment = ethers.zeroPadValue(ethers.toBeHex(policyData.secretCommitment), 32);
  const merkleRootBytes32 = ethers.zeroPadValue(ethers.toBeHex(merkleRoot), 32);
  const policyStartDate = policyData.policyPurchaseDate;
  const paidPremium = policyData.premium;

  const storedPolicy = await vault.policies(policyId);
  if (storedPolicy.buyer === ethers.ZeroAddress) throw new Error("Policy does not exist");
  if (storedPolicy.alreadyClaimed) throw new Error("Policy already claimed");
  if (storedPolicy.buyer !== (await signer.getAddress())) throw new Error("Not your policy");
  console.log("Policy state verified");

  const gasEstimate = await vault.claimPayout.estimateGas(
    policyId,
    commitment,
    merkleRootBytes32,
    policyStartDate,
    paidPremium,
    proof.a,
    proof.b,
    proof.c,
    publicSignals
  );
  console.log(`Estimated gas: ${gasEstimate.toString()}`);

  const tx = await vault.claimPayout(
    policyId,
    commitment,
    merkleRootBytes32,
    policyStartDate,
    paidPremium,
    proof.a,
    proof.b,
    proof.c,
    publicSignals,
    {
      gasLimit: (gasEstimate * BigInt(120)) / BigInt(100),
    }
  );
  console.log(`Transaction submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("Transaction failed");
  console.log(`Confirmed in block ${receipt.blockNumber} | Gas used: ${receipt.gasUsed.toString()}`);

  const claimPaidEvent = receipt.logs.find((log: any) => {
    try {
      const parsed = vault.interface.parseLog(log);
      return parsed?.name === "ClaimPaid";
    } catch {
      return false;
    }
  });
  console.log(claimPaidEvent ? "ClaimPaid event detected" : "ClaimPaid event not found, but transaction succeeded");

  return {
    transactionHash: receipt.hash,
    payoutAmount: publicSignals[3],
  };
}

async function main(): Promise<void> {
  try {
    console.log("Initializing Claim Process\n=============================\n");

    await validateEnvironment();
    const oracle = new OracleClient(process.env.ORACLE_URL || "http://localhost:3001");

    const oracleConnected = await oracle.checkConnection();
    if (!oracleConnected) throw new Error("Oracle not connected. Ensure the oracle is running at http://localhost:3001");
    console.log("Oracle connection verified");

    const policyData = await loadPolicyData();
    const eligibility = await checkPolicyEligibility(policyData, oracle);

    if (!eligibility.eligible) {
      console.log(`\nClaim Not Eligible - Price has not dropped below purchase price.`);
      console.log(`Current: ${formatUSDC(eligibility.currentPrice)} | Your price: ${formatUSDC(eligibility.originalPrice)}`);
      process.exit(0);
    }

    const { proof, publicSignals, merkleRoot } = await generateClaimProof(policyData, eligibility.productId, oracle);
    const result = await submitClaim(policyData, proof, publicSignals, merkleRoot);

    console.log(`\nClaim Successful! Payout: ${formatUSDC(result.payoutAmount)}`);
    console.log(`Transaction: ${result.transactionHash}`);
    console.log(`Explorer: https://etherscan.io/tx/${result.transactionHash}`);
    console.log(
      `Summary: ${formatUSDC(eligibility.originalPrice)} → ${formatUSDC(eligibility.currentPrice)} (Drop: ${formatUSDC(eligibility.potentialPayout)})`
    );
    process.exit(0);
  } catch (error: any) {
    console.error(`\nClaim Failed: ${error.message}`);
    process.exit(1);
  }
}

// Allow script to be run directly or imported
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { checkPolicyEligibility, main as claimPolicy, generateClaimProof, loadPolicyData, submitClaim };
