import dotenv from "dotenv";
import { ethers } from "ethers";
import * as fs from "fs/promises";
import { loadContractABI, loadDeploymentAddresses } from "./utils/contractLoader";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

async function purchasePolicy() {
  console.log("\n=== ZK NOTES: STEP 2 - POLICY PURCHASE ===");
  console.log("🔐 This file reads commitment-data.json from Step 1 and submits to contract:");
  console.log("  ├─ Contract: Stores commitment hash in Policy struct mapping");
  console.log("  ├─ ZK Purpose: Commitment will be used to verify proof without revealing invoice");
  console.log(
    "  └─ Chronological Order: [1st] Generate commitment → [2nd] Purchase policy ← HERE → [3rd] Generate proof → [4th] Claim payout"
  );
  console.log("\n🧮 Key ZK Features Used:");
  console.log("  • Commitment Storage: Secret hash stored on-chain for later proof verification");
  console.log("  • Policy ID: Simple counter (not NFT), links commitment to buyer");
  console.log("  • Tiered Premium: Three tiers (<$500, $500-1000, >$1000) with dynamic pricing");
  console.log("  • Coverage: 100% of price difference (unlimited upside, speculative model)");
  console.log("  • No Invoice Data: Only commitment hash goes on-chain, preserving privacy");
  console.log("  • Dynamic Factor: Premium increases with demand (1% per 10 policies)");

  try {
    // Load deployment addresses
    const deployment = await loadDeploymentAddresses();
    const CONTRACT_ADDRESS = deployment.oracle;

    if (!CONTRACT_ADDRESS) {
      throw new Error("Contract address not found in deployment.json or environment variables");
    }

    // Load commitment data
    console.log("\n📖 Loading commitment data from Step 1...");
    const commitmentDataRaw = await fs.readFile("commitment-data.json", "utf-8");
    const commitmentData = JSON.parse(commitmentDataRaw);
    console.log("  • Commitment (Poseidon hash):", commitmentData.commitment);
    console.log("  • Product ID:", commitmentData.productId);
    console.log("  • Selected Tier:", commitmentData.selectedTier);
    console.log("  • This commitment = Poseidon(orderHash, invoicePrice, invoiceDate, productHash, salt, tier)");
    console.log("  • Circuit will later prove knowledge of these values and tier validation");

    // Load contract ABI and connect
    const contractABI = await loadContractABI("PriceProtectionOracle");
    const tokenABI = await loadContractABI("Token");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);
    let currentnonce;
    // Get token address from the contract's paymentToken field
    const TOKEN_ADDRESS = await contract.paymentToken();
    console.log("  • Payment Token Address:", TOKEN_ADDRESS);

    const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenABI, wallet);

    // Get current quote from contract
    console.log("\n📊 Getting current tier premiums from contract...");
    const quote = await contract.getQuote();
    console.log("  • Tier 1 (<$500): $", ethers.formatUnits(quote.tier1Premium, 6));
    console.log("  • Tier 2 ($500-1000): $", ethers.formatUnits(quote.tier2Premium, 6));
    console.log("  • Tier 3 (>$1000): $", ethers.formatUnits(quote.tier3Premium, 6));
    console.log("  • Dynamic Factor:", quote.currentDynamicFactor.toString() + "%");
    console.log("  • Current Policy Count:", quote.currentPolicyCount.toString());

    // PRIVACY: Extract data but don't send to chain
    const productId = commitmentData.productId;
    const purchasePrice = BigInt(commitmentData.invoicePrice); // Price in 6 decimals (USDC format)
    const selectedTier = commitmentData.selectedTier;

    // Select appropriate premium based on tier
    let premium;
    if (selectedTier === 1) {
      premium = quote.tier1Premium;
      console.log("\n💰 Using Tier 1 premium for items < $500");
    } else if (selectedTier === 2) {
      premium = quote.tier2Premium;
      console.log("\n💰 Using Tier 2 premium for items $500-$1000");
    } else {
      premium = quote.tier3Premium;
      console.log("\n💰 Using Tier 3 premium for items > $1000");
    }

    // Check existing allowance before approving
    const approveAmount = ethers.parseUnits("1000", 6);
    const currentAllowance = await tokenContract.allowance(wallet.address, CONTRACT_ADDRESS);

    let nextNonce;
    if (currentAllowance < approveAmount) {
      console.log("  • Approving contract to spend premium amount...");
      currentnonce = await provider.getTransactionCount(wallet.address);
      console.log("  • Current Nonce:", currentnonce);
      const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, approveAmount, { nonce: currentnonce });
      console.log("  • Approval transaction:", approveTx.hash);
      // Manually increment nonce for next transaction since approval tx is pending
      nextNonce = currentnonce + 1;
      console.log("  • Next Nonce (incremented):", nextNonce);
      console.log("  • ✅ Contract approved to spend", ethers.formatUnits(approveAmount, 6), "MockUSDC");
    } else {
      console.log("  • ✅ Contract already approved to spend", ethers.formatUnits(currentAllowance, 6), "MockUSDC (skipping approval)");
      // Get current nonce since we didn't send approval
      nextNonce = await provider.getTransactionCount(wallet.address);
    }
    console.log("\n📊 Premium Selection:");
    console.log("  • Purchase Price: $" + ethers.formatUnits(purchasePrice, 6) + " (kept private)");
    console.log("  • Selected Tier:", selectedTier);
    console.log("  • Premium Amount: $" + ethers.formatUnits(premium, 6));
    console.log("  • PRIVACY: Exact price hidden, only tier revealed through premium");
    console.log("  • SPECULATIVE MODEL: Pay fixed tier premium, claim 100% of price drop");

    // Check user's token balance
    const userBalance = await tokenContract.balanceOf(wallet.address);
    console.log("\n💳 Token Balance Check:");
    console.log("  • Your MockUSDC balance:", ethers.formatUnits(userBalance, 6), "USDC");
    console.log("  • Required premium:", ethers.formatUnits(premium, 6), "USDC");

    if (userBalance < premium) {
      throw new Error(
        `Insufficient MockUSDC balance. Need ${ethers.formatUnits(premium, 6)} but only have ${ethers.formatUnits(userBalance, 6)}`
      );
    }

    console.log("\n💰 Insurance Terms - Tiered Model:");
    console.log("  • Purchase Price: $" + ethers.formatUnits(purchasePrice, 6));
    console.log("  • Premium (Tier " + selectedTier + "): $" + ethers.formatUnits(premium, 6));
    console.log("  • Coverage: 100% of price difference at claim time");
    console.log("  • Maximum Payout: $" + ethers.formatUnits(purchasePrice, 6) + " USDC (100% drop)");
    console.log("\n  📈 Example Scenarios:");
    const premiumRatio = Number(premium * 100n / purchasePrice);
    console.log("    Purchase Price: $" + ethers.formatUnits(purchasePrice, 6) + ", Premium: $" + ethers.formatUnits(premium, 6) + " (" + premiumRatio.toFixed(1) + "%)");
    console.log("    If current price = 90% → Claim $" + ethers.formatUnits(purchasePrice / 10n, 6) + " (" + (1000/premiumRatio).toFixed(0) + "% return)");
    console.log("    If current price = 80% → Claim $" + ethers.formatUnits(purchasePrice / 5n, 6) + " (" + (2000/premiumRatio).toFixed(0) + "% return)");
    console.log("    If current price = 50% → Claim $" + ethers.formatUnits(purchasePrice / 2n, 6) + " (" + (5000/premiumRatio).toFixed(0) + "% return)");

    // Purchase policy - PRIVACY ENHANCED VERSION
    console.log("\n🛡️ Submitting PRIVACY-ENHANCED policy purchase...");
    console.log("  • Commitment being stored:", commitmentData.commitment);
    console.log("  • Premium amount: $" + ethers.formatUnits(premium, 6));
    console.log("  • PRIVACY: NO productId or purchasePrice sent to chain!");
    console.log("  • Contract stores only: commitment, purchaseDate, buyer, claimed status");
    console.log("  • Using Nonce:", nextNonce);
    console.log("  • Quote Policy Count:", quote.currentPolicyCount.toString());
    const tx = await contract.buyPolicy(commitmentData.commitment, premium, quote.currentPolicyCount, { nonce: nextNonce });

    console.log("\n📡 Transaction submitted:", tx.hash);
    console.log("  • Premium payment (ERC20): $" + ethers.formatUnits(premium, 6));
    console.log("  • PRIVACY: Only commitment hash stored on-chain");

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("✅ Policy purchased!");
    console.log("Block:", receipt.blockNumber);

    // Parse events to get policy ID
    const event = receipt.logs.find((log: any) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return parsedLog?.name === "PolicyBought";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsedEvent = contract.interface.parseLog(event);
      const policyId = parsedEvent?.args[0];
      console.log("\n📝 Policy Created Successfully!");
      console.log("  • Policy ID:", policyId.toString(), "(simple counter, not NFT)");
      console.log("  • This ID links commitment → policy → proof → payout");

      // Save policy data
      const policyData = {
        policyId: policyId.toString(),
        commitment: commitmentData.commitment,
        productId,
        productHash: commitmentData.productHash,
        premium: premium.toString(),
        purchasePrice: purchasePrice.toString(),
        selectedTier: selectedTier,
        purchaseCount: quote.currentPolicyCount.toString(),
        purchaseDate: Date.now(),
        txHash: tx.hash,
      };

      await fs.writeFile("policy-data.json", JSON.stringify(policyData, null, 2));
      console.log("\n💾 Saving policy data to policy-data.json for next steps:");
      console.log("  • generateProof.ts will use policyId & dates for circuit inputs");
      console.log("  • claimProtection.ts will use policyId to submit claim");
      console.log("\n✅ POLICY PURCHASE COMPLETE");
      console.log("🔄 NEXT STEP: Run 'npm run update-price' to simulate price drop (testing)");
      console.log("              Then 'npm run generate-proof' when ready to claim");
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
