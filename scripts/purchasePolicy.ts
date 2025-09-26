import { buildPoseidon } from "circomlibjs";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";
import { InvoiceData, PurchaseDetails, TierBoundary } from "./types";
import {
  getContractInstance,
  loadDeploymentAddresses,
} from "./utils/contractLoader";

dotenv.config();

// Load invoice data from JSON file
const INVOICE_FILE_PATH = "./invoice.json";

function loadInvoiceData(): InvoiceData {
  try {
    return JSON.parse(fs.readFileSync(INVOICE_FILE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Failed to load invoice data from ${INVOICE_FILE_PATH}`);
  }
}

// Premium tiers (must match circuit lines 67-71 and contract lines 30-34)
const TIER_BOUNDARIES: TierBoundary[] = [
  {
    min: BigInt(1000000),
    max: BigInt(99999999),
    tier: 1,
    premium: BigInt(1000000),
  }, // $1-99.99 → $1
  {
    min: BigInt(100000000),
    max: BigInt(499000000),
    tier: 2,
    premium: BigInt(3000000),
  }, // $100-499 → $3
  {
    min: BigInt(500000000),
    max: BigInt(999000000),
    tier: 3,
    premium: BigInt(7000000),
  }, // $500-999 → $7
  {
    min: BigInt(1000000000),
    max: BigInt(1999000000),
    tier: 4,
    premium: BigInt(13000000),
  }, // $1000-1999 → $13
  {
    min: BigInt(2000000000),
    max: BigInt(10000000000),
    tier: 5,
    premium: BigInt(20000000),
  }, // $2000-10000 → $20
];

async function validateEnvironment(): Promise<void> {
  if (!process.env.USER_PRIVATE_KEY)
    throw new Error("USER_PRIVATE_KEY environment variable required");
  if (!process.env.RPC_URL)
    throw new Error("RPC_URL environment variable required");

  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    await provider.getNetwork();
    await fsPromises.access("../contracts/deployment.json");
  } catch (error) {
    throw new Error(`Environment validation failed: ${error}`);
  }
}

async function collectPurchaseDetails(
  poseidon: any,
  invoiceData: InvoiceData
): Promise<PurchaseDetails> {
  const { orderNumber, purchasePriceUsd, purchaseDate, productId } =
    invoiceData;
  console.log(
    `Purchase: ${orderNumber} | $${purchasePriceUsd} | ${purchaseDate} | ${productId}`
  );

  const orderHash = ethers.keccak256(ethers.toUtf8Bytes(orderNumber));
  const invoicePrice = BigInt(Number(purchasePriceUsd) * 1000000);
  const invoiceDate = Math.floor(new Date(purchaseDate).getTime() / 1000);

  const productIdBytes = ethers.toUtf8Bytes(productId);
  const productIdHash = ethers.keccak256(productIdBytes);
  const productHashBigInt = BigInt(productIdHash);
  const productHashField = poseidon([productHashBigInt]);
  const productHash = poseidon.F.toObject(productHashField);

  const salt = BigInt("0x" + crypto.randomBytes(32).toString("hex"));
  const { tier } = calculateTierAndPremium(invoicePrice);

  return {
    orderHash,
    invoicePrice,
    invoiceDate,
    productHash,
    salt,
    selectedTier: tier,
  };
}

function generateCommitment(poseidon: any, details: PurchaseDetails): bigint {
  // Create commitment hash (must match circuit line 41-48)
  const commitment = poseidon([
    BigInt(details.orderHash),
    details.invoicePrice,
    BigInt(details.invoiceDate),
    details.productHash,
    details.salt,
    BigInt(details.selectedTier),
  ]);

  return poseidon.F.toObject(commitment);
}

function calculateTierAndPremium(invoicePrice: bigint): {
  tier: number;
  premium: bigint;
} {
  for (const boundary of TIER_BOUNDARIES) {
    if (invoicePrice >= boundary.min && invoicePrice <= boundary.max) {
      return {
        tier: boundary.tier,
        premium: boundary.premium,
      };
    }
  }
  throw new Error(`Invoice price ${invoicePrice} outside valid tier ranges`);
}

async function main(): Promise<void> {
  try {
    console.log("Validating environment...");
    await validateEnvironment();

    console.log("Initializing Poseidon hasher...");
    const poseidon = await buildPoseidon();
    const invoiceData = loadInvoiceData();

    console.log("\nGenerating Purchase Commitment");
    const purchaseDetails = await collectPurchaseDetails(poseidon, invoiceData);
    const secretCommitment = generateCommitment(poseidon, purchaseDetails);
    console.log(`Secret commitment: ${secretCommitment}`);

    const policyDataDir = path.join(__dirname, "../policy-data");
    try {
      await fsPromises.access(policyDataDir);
    } catch {
      await fsPromises.mkdir(policyDataDir, { recursive: true });
    }

    const commitmentData = {
      ...purchaseDetails,
      orderHash: purchaseDetails.orderHash,
      invoicePrice: purchaseDetails.invoicePrice.toString(),
      productHash: purchaseDetails.productHash.toString(),
      salt: purchaseDetails.salt.toString(),
      secretCommitment: secretCommitment.toString(),
      timestamp: Date.now(),
    };
    await fsPromises.writeFile(
      path.join(policyDataDir, `commitment.json`),
      JSON.stringify(commitmentData, null, 2)
    );

    const { tier, premium } = calculateTierAndPremium(
      purchaseDetails.invoicePrice
    );
    if (purchaseDetails.selectedTier !== tier) {
      throw new Error(
        `Selected tier ${purchaseDetails.selectedTier} doesn't match calculated tier ${tier}`
      );
    }
    console.log(
      `Tier ${tier} | Price: $${
        Number(purchaseDetails.invoicePrice) / 1000000
      } | Premium: $${Number(premium) / 1000000}`
    );

    const deployment = await loadDeploymentAddresses();
    if (!deployment.vault || !deployment.token)
      throw new Error("Missing vault or token address in deployment");

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
    const vault = await getContractInstance(
      "InsuranceVault",
      deployment.vault,
      signer
    );
    const token = await getContractInstance("Token", deployment.token, signer);

    console.log(
      `Contracts | Vault: ${deployment.vault} | Token: ${deployment.token}`
    );

    const userAddress = await signer.getAddress();
    const userBalance = await token.balanceOf(userAddress);
    console.log(
      `User address: ${userAddress} | Balance: $${ethers.formatUnits(
        userBalance,
        6
      )}`
    );
    if (userBalance < premium) {
      throw new Error(
        `Insufficient balance. Need $${Number(premium) / 1000000}, have $${
          Number(userBalance) / 1000000
        }`
      );
    }

    const currentAllowance = await token.allowance(
      userAddress,
      deployment.vault
    );
    console.log(
      `Current allowance: $${ethers.formatUnits(
        currentAllowance,
        6
      )} | Required: $${ethers.formatUnits(premium, 6)}`
    );

    if (currentAllowance < premium) {
      console.log(
        "Insufficient allowance. Approving maximum token spending..."
      );
      const approveTx = await token.approve(
        deployment.vault,
        ethers.MaxUint256
      );
      await approveTx.wait();
      console.log(
        "Maximum token approval confirmed - no future approvals needed"
      );
    } else {
      console.log("Sufficient allowance available - skipping approval");
    }

    console.log("\nPurchasing policy...");
    const commitmentBytes32 = ethers.zeroPadValue(
      ethers.toBeHex(secretCommitment),
      32
    );
    const purchaseTx = await vault.buyPolicy(commitmentBytes32, premium, {});
    const receipt = await purchaseTx.wait();
    console.log(`Policy purchased! Transaction: ${receipt.hash}`);

    console.log(`Explorer: https://sepolia.etherscan.io/tx/${receipt.hash}`);
    const policyBoughtEvent = receipt.logs.find((log: any) => {
      try {
        const parsed = vault.interface.parseLog(log);
        return parsed?.name === "PolicyBought";
      } catch {
        return false;
      }
    });

    if (!policyBoughtEvent)
      throw new Error("PolicyBought event not found in transaction receipt");
    const parsedEvent = vault.interface.parseLog(policyBoughtEvent);
    const policyId = parsedEvent.args.policyId;
    const storedPolicy = await vault.policies(policyId);

    const policyRecord = {
      policyId: policyId.toString(),
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      policyPurchaseDate: Number(storedPolicy.policyPurchaseDate),
      purchaseDetails: {
        orderHash: purchaseDetails.orderHash,
        invoicePrice: purchaseDetails.invoicePrice.toString(),
        invoiceDate: purchaseDetails.invoiceDate,
        productHash: purchaseDetails.productHash.toString(),
        salt: purchaseDetails.salt.toString(),
        selectedTier: purchaseDetails.selectedTier,
        productId: invoiceData.productId,
      },
      secretCommitment: secretCommitment.toString(),
      premium: premium.toString(),
      tier: tier,
      contracts: {
        vault: deployment.vault,
        token: deployment.token,
        verifier: deployment.verifier,
      },
      createdAt: new Date().toISOString(),
      network: (await provider.getNetwork()).name,
    };

    const policyFileName = path.join(policyDataDir, `policy.json`);
    await fsPromises.writeFile(
      policyFileName,
      JSON.stringify(policyRecord, null, 2)
    );

    console.log(`\nPolicy Purchase Complete!`);
    console.log(
      `ID: ${policyId} | Premium: $${
        Number(premium) / 1000000
      } | Tier: ${tier} | File: ${policyFileName}`
    );
  } catch (error: any) {
    console.error(`\nPolicy Purchase Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
