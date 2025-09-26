import { buildPoseidon } from "circomlibjs";
import dotenv from "dotenv";
import { ethers } from "ethers";
dotenv.config();

// TOKEN_MULTIPLIER constant for 6 decimal conversions
const TOKEN_MULTIPLIER = 1000000; // 10^6 for 6 decimals

interface InvoiceData {
  orderNumber: string;
  invoiceNumber: string;
  price: number; // in 6 decimals (USDC format)
  date: number; // unix timestamp
  transactionId: string;
  asin: string;
}

// Parse invoice data from the product purchase
// This represents the original product purchase that we want to protect
function parseInvoice(): InvoiceData {
  // Allow override from environment variables or use defaults for testing
  const orderNumber = process.env.ORDER_NUMBER || "171-5907578-4275511";
  const invoiceNumber = process.env.INVOICE_NUMBER || "HYD8-1736233";
  const priceUsd = process.env.PURCHASE_PRICE_USD ? parseFloat(process.env.PURCHASE_PRICE_USD) : 547.2;
  const purchaseDate = process.env.PURCHASE_DATE || "2025-09-17";
  const transactionId = process.env.TRANSACTION_ID || "1zkkU91fGG1ZyscyK5mE";
  const asin = process.env.PRODUCT_ID || "B0BZSD82ZN";

  // Convert USD price to 6 decimals (USDC format)
  const priceIn6Decimals = Math.round(priceUsd * TOKEN_MULTIPLIER);

  return {
    orderNumber,
    invoiceNumber,
    price: priceIn6Decimals, // Price in 6 decimals (USDC format)
    date: Math.floor(new Date(purchaseDate).getTime() / 1000), // Product purchase date (BEFORE buying protection)
    transactionId,
    asin,
  };
}

async function generateCommitment(invoice: InvoiceData) {
  console.log("\n=== ZK NOTES: STEP 1 - COMMITMENT GENERATION ===");
  console.log("🔐 This file creates commitment-data.json which will be used in:");
  console.log("  ├─ Contract: Store secret commitment hash on-chain during policy purchase");
  console.log("  ├─ ZK Circuit: Prove knowledge of pre-image without revealing invoice details");
  console.log("  └─ Chronological Order: [1st] Generate commitment → [2nd] Purchase policy → [3rd] Generate proof → [4th] Claim payout");
  console.log("\n🧮 Key ZK Features Used:");
  console.log("  • Poseidon Hash: ZK-friendly hash function optimized for circuits");
  console.log("  • Commitment Scheme: hash(orderHash, price, date, productHash, nonce, tier)");
  console.log("  • Salt/Nonce: Random value ensures commitment uniqueness & prevents rainbow attacks");
  console.log("  • Pre-image Hiding: Invoice data stays private, only commitment hash goes on-chain");
  console.log("  • Tier System: Premium tiers (1: <$500, 2: $500-1000, 3: >$1000) provide privacy while enabling validation");

  // Initialize Poseidon
  console.log("\n🔧 Initializing Poseidon hash function (ZK-friendly)...");
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Generate random nonce
  console.log("🎲 Generating cryptographic salt/nonce for commitment uniqueness...");
  const nonce = F.random();
  console.log("  └─ Nonce:", F.toObject(nonce).toString());

  // Determine tier based on invoice price
  let selectedTier;
  if (invoice.price < 500 * TOKEN_MULTIPLIER) {
    selectedTier = 1;
    console.log("💰 Tier 1 selected: Invoice price < $500");
  } else if (invoice.price <= 1000 * TOKEN_MULTIPLIER) {
    selectedTier = 2;
    console.log("💰 Tier 2 selected: Invoice price $500-$1000");
  } else {
    selectedTier = 3;
    console.log("💰 Tier 3 selected: Invoice price > $1000");
  }
  console.log("  └─ Selected Tier:", selectedTier);

  // Pre-hash complex fields to single values
  console.log("\n🏷️ Creating orderHash from invoice orderNumber using Keccak256 → Poseidon...");
  const orderHash = poseidon([F.e(ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(invoice.orderNumber))))]);
  console.log("  └─ OrderHash:", F.toObject(orderHash).toString());

  console.log("🏷️ Creating productHash from ASIN using Keccak256...");
  const productHash = F.e(ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(invoice.asin))));
  console.log("  └─ ProductHash:", F.toObject(productHash).toString());

  // Create commitment: hash(orderHash, price, date, productHash, nonce, tier)
  console.log("\n🔐 Creating final commitment hash: Poseidon(orderHash, price, date, productHash, nonce, tier)");
  console.log("  • This hash will be stored on-chain as secret commitment");
  console.log("  • ZK circuit will later prove knowledge of these values without revealing them");
  console.log("  • Tier is included to validate premium calculation");
  const commitmentHash = poseidon([orderHash, F.e(invoice.price), F.e(invoice.date), productHash, nonce, F.e(selectedTier)]);

  // Convert to hex string
  const commitment = "0x" + F.toObject(commitmentHash).toString(16).padStart(64, "0");
  const productHashHex = "0x" + F.toObject(productHash).toString(16).padStart(64, "0");

  console.log("  └─ Final Commitment (hex):", commitment);

  // Store for later use in proof generation
  const commitmentData = {
    commitment,
    productHash: productHashHex,
    productId: invoice.asin,
    invoice,
    invoicePrice: invoice.price, // Store price in 6 decimals for easy access
    salt: F.toObject(nonce).toString(),
    orderHash: F.toObject(orderHash).toString(),
    selectedTier: selectedTier, // NEW: Store selected tier
    timestamp: Date.now(),
  };

  // Save to file for later proof generation
  console.log("\n💾 Saving commitment data to commitment-data.json for next steps:");
  console.log("  • purchasePolicy.ts will read this to submit commitment on-chain");
  console.log("  • generateProof.ts will use private values as circuit inputs");
  const fs = await import("fs");
  await fs.promises.writeFile("commitment-data.json", JSON.stringify(commitmentData, null, 2));

  console.log("\n✅ COMMITMENT GENERATION COMPLETE");
  console.log("📝 Commitment Generated!");
  console.log("Commitment:", commitment);
  console.log("Product ID:", invoice.asin);
  console.log("Product Hash:", productHashHex);
  console.log("Selected Tier:", selectedTier);
  console.log("Data saved to commitment-data.json");
  console.log("\n🔄 NEXT STEP: Run 'npm run purchase-policy' to submit commitment on-chain");

  return commitmentData;
}

// Main execution
(async () => {
  console.log("\n📌 Configuration Options:");
  console.log("  You can override invoice data using environment variables:");
  console.log("  • ORDER_NUMBER: Order number (default: 171-5907578-4275511)");
  console.log("  • INVOICE_NUMBER: Invoice number (default: HYD8-1736233)");
  console.log("  • PURCHASE_PRICE_USD: Purchase price in USD (default: 547.20)");
  console.log("  • PURCHASE_DATE: Purchase date YYYY-MM-DD (default: 2025-09-17)");
  console.log("  • TRANSACTION_ID: Transaction ID (default: 1zkkU91fGG1ZyscyK5mE)");
  console.log("  • PRODUCT_ID: Product ID/ASIN (default: B0BZSD82ZN)");
  console.log("");

  const invoice = parseInvoice();
  console.log("Using invoice data:");
  console.log("  • Price: $" + (invoice.price / TOKEN_MULTIPLIER).toFixed(2) + " (" + invoice.price + " in 6 decimals)");
  console.log("  • Product ID: " + invoice.asin);

  await generateCommitment(invoice);
})().catch(console.error);
