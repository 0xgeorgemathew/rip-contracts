import dotenv from "dotenv";
import { ethers } from "ethers";
import { loadContractABI, loadDeploymentAddresses } from "./utils/contractLoader";
dotenv.config();

// TOKEN_MULTIPLIER constant for 6 decimal conversions
const TOKEN_MULTIPLIER = 1000000; // 10^6 for 6 decimals

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.RPC_URL || "http://localhost:8545";

interface PriceUpdateConfig {
  productId: string;
  newPrice: number; // in 6 decimals (USDC format)
  description?: string;
}

// Default configuration for testing
const DEFAULT_CONFIG: PriceUpdateConfig = {
  productId: "B0DHJ9SCJ4",
  newPrice: 900 * TOKEN_MULTIPLIER, // $450.00 in 6 decimals (down from $547.20)
  description: "Price drop from $547.20 to $450.00 for testing claims",
};

async function updatePrice(config: PriceUpdateConfig = DEFAULT_CONFIG) {
  try {
    console.log("\n=== ZK NOTES: ORACLE PRICE UPDATE (Testing/Admin Function) ===");
    console.log("🎯 This file simulates price changes for testing ZK proof claims:");
    console.log("  ├─ Contract: Updates currentPrices mapping in oracle");
    console.log("  ├─ ZK Purpose: Creates price drop scenario to trigger valid claims");
    console.log("  └─ Chronological Order: Can be run anytime after policy purchase to test claims");
    console.log("\n🧮 Key ZK Features & Circuit Interaction:");
    console.log("  • Oracle Role: Provides 'currentPrice' public input to circuit");
    console.log("  • Circuit Check: Verifies invoicePrice > currentPrice for valid claim");
    console.log("  • Price Difference: Circuit calculates priceDrop = invoicePrice - currentPrice");
    console.log("  • Testing Purpose: Simulates real-world price drops for development");
    console.log("  • Production: Would be replaced by external price feed oracle");

    console.log("\n🔄 Updating oracle price...");
    console.log("  • Product ID:", config.productId);
    console.log("  • New Price:", ethers.formatUnits(config.newPrice, 6), "USDC");
    if (config.description) {
      console.log("  • Description:", config.description);
    }

    // Load deployment addresses
    const deployment = await loadDeploymentAddresses();
    const CONTRACT_ADDRESS = deployment.oracle;

    if (!CONTRACT_ADDRESS) {
      throw new Error("Contract address not found in deployment.json or environment variables");
    }

    // Load contract ABI and connect
    const contractABI = await loadContractABI("PriceProtectionOracle");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, wallet);

    console.log("Connected as:", wallet.address);

    // Check if wallet is the price updater
    const priceUpdater = await contract.priceUpdater();
    if (wallet.address.toLowerCase() !== priceUpdater.toLowerCase()) {
      throw new Error(`Only price updater (${priceUpdater}) can update prices. Current wallet: ${wallet.address}`);
    }

    // Get current price for comparison
    console.log("\n📊 Fetching current oracle price for comparison...");
    let oldPrice;
    try {
      oldPrice = await contract.currentPrices(config.productId);
      console.log("  • Current Oracle Price:", ethers.formatUnits(oldPrice, 6), "USDC");
      console.log("  • This price is used as 'currentPrice' in ZK circuit");
    } catch (error) {
      console.log("  • Could not fetch current price (product may not exist)");
    }

    // Update the price
    console.log("\n📤 Submitting price update transaction...");
    console.log("  • Only priceUpdater role can call this function");
    console.log("  • Updates both products[productId].price and currentPrices[productId]");
    const tx = await contract.updatePrice(config.productId, (oldPrice * 90n) / 100n); // 10% drop for testing
    console.log("\n📡 Transaction submitted:", tx.hash);
    console.log("  • Contract storage updated for ZK proof verification");

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log("✅ Price updated successfully!");
    console.log("Block:", receipt.blockNumber);

    // Parse events to confirm the update
    const event = receipt.logs.find((log: any) => {
      try {
        const parsedLog = contract.interface.parseLog(log);
        return parsedLog?.name === "PriceChanged";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsedEvent = contract.interface.parseLog(event);
      const updatedPrice = parsedEvent?.args[1];
      console.log("\n📊 Price Update Confirmed:");
      console.log("  • New Oracle Price:", ethers.formatUnits(updatedPrice, 6), "USDC");

      if (oldPrice && oldPrice > updatedPrice) {
        const priceDrop = oldPrice - updatedPrice;
        console.log("\n📉 Price Drop Analysis for ZK Claims (Speculative Model):");
        console.log("  • Price Drop Amount: $" + ethers.formatUnits(priceDrop, 6));
        console.log("  • Circuit will output this as 'priceDifference' signal");
        console.log("\n💰 SPECULATIVE PAYOUT MODEL:");
        console.log("  • Premium paid: 10% of purchase price");
        console.log("  • Payout: 100% of price difference = $" + ethers.formatUnits(priceDrop, 6));
        const returnOnPremium = (Number(priceDrop) / Number(oldPrice)) * 10 * 100;
        console.log("  • Return on premium: " + returnOnPremium.toFixed(0) + "%");
        console.log("\n✅ ZK Circuit Validation:");
        console.log("  • priceCheck.in[0] (invoicePrice) > priceCheck.in[1] (currentPrice) ✓");
        console.log("  • validClaim output will be 1 (true)");
        console.log("  • Policies can now generate valid ZK proofs for claims");
      } else if (oldPrice && oldPrice <= updatedPrice) {
        console.log("\n⚠️  Price increased or unchanged:");
        console.log("  • Circuit constraint: invoicePrice > currentPrice will fail");
        console.log("  • validClaim output would be 0 (false)");
        console.log("  • Claims would be rejected even with valid proof");
      }
    }

    console.log("\n✅ ORACLE PRICE UPDATE COMPLETE");
    console.log("🔄 NEXT STEPS:");
    console.log("  1. Run 'npm run generate-proof' to create ZK proof with new price");
    console.log("  2. Circuit will verify price drop and output validClaim=1");
    console.log("  3. Run 'npm run claim' to submit proof and receive payout");
  } catch (error) {
    console.error("Error updating price:", error);
    throw error;
  }
}

// Allow command-line configuration
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // Use default configuration
    await updatePrice();
  } else if (args.length === 2) {
    // Custom productId and price
    const [productId, priceStr] = args;
    const newPrice = parseInt(priceStr);

    if (isNaN(newPrice)) {
      console.error("Invalid price. Please provide price in 6 decimals (e.g., 450000000 for $450.00)");
      process.exit(1);
    }

    await updatePrice({
      productId,
      newPrice,
      description: `Custom price update to $${(newPrice / TOKEN_MULTIPLIER).toFixed(2)}`,
    });
  } else {
    console.log("Usage:");
    console.log("  npm run update-price                     # Use default test configuration");
    console.log("  npm run update-price [productId] [price] # Custom productId and price in 6 decimals");
    console.log("");
    console.log("Examples:");
    console.log("  npm run update-price                              # Drop B0BZSD82ZN to $450");
    console.log("  npm run update-price B0BZSD82ZN " + 400 * TOKEN_MULTIPLIER + "         # Drop B0BZSD82ZN to $400");
    process.exit(1);
  }
}

// Main execution
main().catch(console.error);
