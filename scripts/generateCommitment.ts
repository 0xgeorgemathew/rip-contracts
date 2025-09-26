import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";

interface InvoiceData {
  orderNumber: string;
  invoiceNumber: string;
  price: number; // in cents
  date: number; // unix timestamp
  transactionId: string;
  asin: string;
}

// Parse invoice data from the uploaded PDF
function parseInvoice(): InvoiceData {
  return {
    orderNumber: "171-5907578-4275511",
    invoiceNumber: "HYD8-1736233",
    price: 54720, // ₹547.20 in cents
    date: Math.floor(new Date("2025-08-20").getTime() / 1000),
    transactionId: "1zkkU91fGG1ZyscyK5mE",
    asin: "B0BZSD82ZN",
  };
}

async function generateCommitment(invoice: InvoiceData) {
  // Initialize Poseidon
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // Generate random nonce
  const nonce = F.random();

  // Pre-hash complex fields to single values
  const orderNumberHash = poseidon([
    F.e(
      ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(invoice.orderNumber)))
    ),
  ]);

  const asinHash = poseidon([
    F.e(ethers.toBigInt(ethers.keccak256(ethers.toUtf8Bytes(invoice.asin)))),
  ]);

  // Create commitment: hash(orderHash, price, date, asinHash, nonce)
  const commitmentHash = poseidon([
    orderNumberHash,
    F.e(invoice.price),
    F.e(invoice.date),
    asinHash,
    nonce,
  ]);

  // Convert to hex string
  const commitment =
    "0x" + F.toObject(commitmentHash).toString(16).padStart(64, "0");
  const asinHashHex =
    "0x" + F.toObject(asinHash).toString(16).padStart(64, "0");

  // Store for later use in proof generation
  const commitmentData = {
    commitment,
    asinHash: asinHashHex,
    invoice,
    nonce: F.toObject(nonce).toString(),
    orderNumberHash: F.toObject(orderNumberHash).toString(),
    timestamp: Date.now(),
  };

  // Save to file for later proof generation
  const fs = await import("fs");
  await fs.promises.writeFile(
    "commitment-data.json",
    JSON.stringify(commitmentData, null, 2)
  );

  console.log("📝 Commitment Generated!");
  console.log("Commitment:", commitment);
  console.log("ASIN:", invoice.asin);
  console.log("ASIN Hash:", asinHashHex);
  console.log("Data saved to commitment-data.json");

  return commitmentData;
}

// Main execution
(async () => {
  const invoice = parseInvoice();
  await generateCommitment(invoice);
})().catch(console.error);
