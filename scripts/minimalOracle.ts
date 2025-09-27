import { buildPoseidon } from "circomlibjs";
import * as kzg from "c-kzg";
import { JsonBlobUtils } from "./utils/shared/json-utils";
import { BlobUtils } from "./utils/shared/utils";
import { GAS_CONFIG } from "./utils/shared/config";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as fs from "fs";
import { createApiRoutes } from "./apiRoutes";
import { createDebugRoutes } from "./debugRoutes";
import { MerkleProofResponse, Product } from "./types";
import { getContractInstance, loadDeploymentAddresses } from "./utils/contractLoader";
import { retryWithBackoff } from "./utils/retryUtils";
import { logAvailableRoutes } from "./utils/routeLogger";
import { OracleStateManager } from "./utils/stateManager";
import { buildMerkleTreeFromProducts, ProperMerkleTree } from "./utils/treeBuilder";
import express = require("express");

dotenv.config();

const TREE_FILE_PATH = "./merkle-tree.json";
const PRODUCTS_FILE_PATH = "./products.json";

function loadProducts(): Product[] {
  try {
    if (!fs.existsSync(PRODUCTS_FILE_PATH)) {
      throw new Error(`Products file not found: ${PRODUCTS_FILE_PATH}`);
    }
    const productsData = JSON.parse(fs.readFileSync(PRODUCTS_FILE_PATH, "utf8"));
    console.log(`✅ Loaded ${productsData.length} products from ${PRODUCTS_FILE_PATH}`);
    return productsData;
  } catch (error) {
    console.error("❌ Failed to load products from JSON file:", error);
    process.exit(1);
  }
}

const DEMO_PRODUCTS = loadProducts();

class MinimalPriceOracle {
  private products: Product[] = DEMO_PRODUCTS;
  private tree!: ProperMerkleTree;
  private currentPrices: Map<string, number>;
  private poseidon: any;
  private initialized = false;
  private contract: any;
  private signer: any;
  private productHashMap = new Map<string, string>();
  private leafHashMap = new Map<string, string>();
  private stateManager = new OracleStateManager(TREE_FILE_PATH);

  constructor() {
    this.currentPrices = new Map(this.products.map((p) => [p.id, p.basePrice]));
  }

  async init(): Promise<void> {
    // Initialize KZG trusted setup first for blob operations
    kzg.loadTrustedSetup(0);
    console.log("✅ KZG trusted setup loaded");
    this.poseidon = await buildPoseidon();
    await this.initializeTreeState();
    await this.initContract();
    await this.syncChainWithLocal();
    this.initialized = true;
    console.log("✅ Oracle initialized with merkle root:", this.getMerkleRootSync());
  }

  private async initializeTreeState(): Promise<void> {
    const shouldRebuild = process.argv.includes("--force-rebuild") || process.env.FORCE_REBUILD === "true";
    if (shouldRebuild) {
      console.log("Force rebuild requested - resetting to base prices");
      this.stateManager.clear();
      this.resetToBasePrices();
    } else if (!this.loadTreeFromFile()) {
      console.log(" No saved state found - initializing with base prices");
      this.resetToBasePrices();
    } else {
      console.log("✅ Loaded existing state from merkle-tree.json");
    }
  }

  private async syncChainWithLocal(): Promise<void> {
    if (!this.contract || !this.tree) return;

    const localRoot = this.tree.getRoot();
    const onChainRoot = await this.getOnChainMerkleRoot();

    if (onChainRoot && onChainRoot !== localRoot) {
      console.log(`  Root mismatch detected:`);
      console.log(`   Local (merkle-tree.json): ${localRoot}`);
      console.log(`   On-chain: ${onChainRoot}`);
      console.log(`   Updating on-chain to match local state...`);
      await this.updateMerkleRootOnChain(localRoot);
    }

    // Store merkle tree data as blob transaction
    try {
      console.log("📦 Storing merkle tree data as EIP-4844 blob...");
      const txHash = await this.sendJSONFileTransaction(TREE_FILE_PATH);
      console.log(`✅ Blob transaction successful: ${txHash}`);
    } catch (error) {
      console.error("❌ Blob storage failed:", error);
      // Don't throw - blob storage is not critical for oracle operation
    }
  }

  private async initContract(): Promise<void> {
    try {
      if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY not set");
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "http://localhost:8545");
      this.signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
      const deployment = await loadDeploymentAddresses();
      if (!deployment.vault) throw new Error("Vault address not found");
      this.contract = await getContractInstance("InsuranceVault", deployment.vault, this.signer);
      console.log("Contract connected:", deployment.vault);
    } catch (error) {
      console.log("Contract connection failed - running in local-only mode:", error);
    }
  }

  private async updateMerkleRootOnChain(newRoot: string): Promise<void> {
    if (!this.contract) {
      console.log("No contract connection - skipping on-chain update");
      return;
    }

    const rootHex = `0x${BigInt(newRoot).toString(16).padStart(64, "0")}`;
    await retryWithBackoff(async () => {
      console.log(`   📤 Sending root to chain: ${rootHex}`);
      const gasEstimate = await this.contract.updatePriceMerkleRoot.estimateGas(rootHex);
      const tx = await this.contract.updatePriceMerkleRoot(rootHex, {
        gasLimit: (gasEstimate * BigInt(120)) / BigInt(100),
      });
      const receipt = await tx.wait();
      console.log(`   ✅ Root updated! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed}`);
    });
  }

  private rebuildTree(): void {
    if (!this.poseidon) return;
    const { tree, productHashMap, leafHashMap } = buildMerkleTreeFromProducts(this.poseidon, this.products, this.currentPrices);
    this.tree = tree;
    this.productHashMap = productHashMap;
    this.leafHashMap = leafHashMap;
    this.saveTreeToFile();
  }

  private saveTreeToFile(): void {
    if (!this.tree) return;
    this.stateManager.save({
      leaves: this.tree.getLeaves(),
      root: this.tree.getRoot(),
      productHashMap: Array.from(this.productHashMap.entries()),
      leafHashMap: Array.from(this.leafHashMap.entries()),
      currentPrices: Array.from(this.currentPrices.entries()),
      timestamp: new Date().toISOString(),
    });
  }

  private loadTreeFromFile(): boolean {
    try {
      const treeData = this.stateManager.load();
      if (!treeData) return false;
      this.productHashMap = new Map(treeData.productHashMap);
      this.leafHashMap = new Map(treeData.leafHashMap || []);
      this.currentPrices = new Map(treeData.currentPrices);
      this.tree = new ProperMerkleTree(this.poseidon, treeData.leaves);
      return true;
    } catch (error) {
      console.error("Failed to load merkle tree:", error);
      return false;
    }
  }

  getMerkleRootSync(): string {
    return this.initialized && this.tree ? this.tree.getRoot() : "not_initialized";
  }

  async getMerkleProof(productId: string): Promise<MerkleProofResponse> {
    this.ensureInitialized();
    const normalizedProductId = productId.toUpperCase().trim();
    const productIndex = this.products.findIndex((p) => p.id === normalizedProductId);

    if (productIndex === -1) {
      const availableIds = this.products.map((p) => p.id).join(", ");
      throw new Error(`Product ${normalizedProductId} not found. Available: ${availableIds}`);
    }

    const product = this.products[productIndex];
    const { siblings, pathIndices } = this.tree.getProof(productIndex);

    if (siblings.length > 4) throw new Error(`Tree depth ${siblings.length} exceeds circuit max of 4`);
    while (siblings.length < 4) siblings.push("0");
    while (pathIndices.length < 4) pathIndices.push(0);

    return {
      leaf: this.leafHashMap.get(normalizedProductId)!,
      currentPrice: this.currentPrices.get(normalizedProductId)!,
      proof: siblings.map((sibling, index) => ({
        position: (pathIndices[index] === 1 ? "left" : "right") as "left" | "right",
        data: sibling,
      })),
      siblings,
      pathIndices,
      root: this.tree.getRoot(),
      productName: product.name,
      leafBigInt: this.leafHashMap.get(normalizedProductId)!,
      productHash: this.productHashMap.get(normalizedProductId)!,
      productId: normalizedProductId,
    };
  }

  getAllPrices(): Array<{ id: string; name: string; currentPrice: number; basePrice: number; change: number }> {
    return this.products.map((p) => {
      const currentPrice = this.currentPrices.get(p.id)!;
      const change = ((currentPrice - p.basePrice) / p.basePrice) * 100;

      return {
        id: p.id,
        name: p.name,
        currentPrice,
        basePrice: p.basePrice,
        change: Math.round(change * 100) / 100,
      };
    });
  }

  async dropAllPrices(percentage: number = 10): Promise<void> {
    this.ensureInitialized();
    for (const product of this.products) {
      const currentPrice = this.currentPrices.get(product.id)!;
      this.currentPrices.set(product.id, Math.floor(currentPrice * (1 - percentage / 100)));
    }
    await this.updateTreeAndChain();
  }

  async setProductPrice(productId: string, price: number): Promise<void> {
    this.ensureInitialized();
    this.currentPrices.set(productId, price);
    await this.updateTreeAndChain();
  }

  resetAllPrices(): void {
    this.ensureInitialized();
    this.resetToBasePrices();
  }

  async forceRebuildFromBase(): Promise<void> {
    this.ensureInitialized();
    this.resetToBasePrices();
    await this.updateTreeAndChain();
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.tree) throw new Error("Oracle not initialized");
  }

  private resetToBasePrices(): void {
    this.currentPrices = new Map(this.products.map((p) => [p.id, p.basePrice]));
    this.rebuildTree();
  }

  private async updateTreeAndChain(): Promise<void> {
    this.rebuildTree();
    if (this.tree && this.contract) {
      await this.updateMerkleRootOnChain(this.tree.getRoot());
    }
  }

  async updateMerkleRoot(): Promise<void> {
    if (this.initialized && this.tree && this.contract) {
      await this.updateMerkleRootOnChain(this.tree.getRoot());
    }
  }

  get isInitialized(): boolean {
    return this.initialized;
  }
  get hasTree(): boolean {
    return !!this.tree;
  }
  get isContractConnected(): boolean {
    return !!this.contract;
  }

  async getContractAddress(): Promise<string | null> {
    return this.contract ? await this.contract.getAddress() : null;
  }

  async getSignerInfo(): Promise<{ address: string; balance: string } | null> {
    if (!this.signer) return null;
    try {
      const address = await this.signer.getAddress();
      const balance = ethers.formatEther(await this.signer.provider.getBalance(address));
      return { address, balance };
    } catch {
      return null;
    }
  }

  async getOnChainMerkleRoot(): Promise<string | null> {
    if (!this.contract) return null;
    try {
      const onChainRoot = await this.contract.priceMerkleRoot();
      return BigInt(onChainRoot).toString();
    } catch (error) {
      console.error("Failed to read on-chain merkle root:", error);
      return null;
    }
  }

  async sendJSONFileTransaction(filePath: string): Promise<string> {
    console.log("📂 Reading JSON file:", filePath);

    const jsonData = JsonBlobUtils.readJSONFromFile(filePath);
    console.log("✅ JSON file parsed successfully");
    console.log("📊 JSON data size:", JsonBlobUtils.calculateJSONSize(jsonData), "bytes");

    const { blob, commitment } = JsonBlobUtils.createBlobFromJSONFile(filePath);
    const versionedHash = JsonBlobUtils.createVersionedHash(commitment);

    return this.executeBlobTransaction(blob, versionedHash);
  }

  private async executeBlobTransaction(blob: Uint8Array, versionedHash: string): Promise<string> {
    await this.checkPendingTransactions();

    const [feeData, blobBaseFee] = await Promise.all([
      this.signer.provider.getFeeData(),
      BlobUtils.calculateBlobGasPrice(this.signer.provider)
    ]);

    if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
      throw new Error("Unable to fetch gas prices");
    }

    const fees = BlobUtils.calculateFees(feeData.maxFeePerGas, blobBaseFee);
    console.log(`💰 Total fee: ${ethers.formatEther(fees.totalFee)} ETH`);

    const transaction = {
      type: 3,
      to: this.signer.address,
      value: 0,
      data: "0x",
      gasLimit: GAS_CONFIG.BASE_GAS_LIMIT,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      maxFeePerBlobGas: blobBaseFee * GAS_CONFIG.BLOB_GAS_MULTIPLIER,
      blobVersionedHashes: [versionedHash],
      blobs: [blob],
      kzg
    };

    const response = await this.signer.sendTransaction(transaction);
    const receipt = await response.wait();

    if (!receipt) throw new Error("Transaction failed");

    console.log(`✨ Confirmed in block: ${receipt.blockNumber}`);
    return response.hash;
  }

  private async checkPendingTransactions(): Promise<void> {
    const [currentNonce, pendingNonce] = await Promise.all([
      this.signer.provider.getTransactionCount(this.signer.address),
      this.signer.provider.getTransactionCount(this.signer.address, 'pending')
    ]);

    console.log(`🔍 Nonce check: current=${currentNonce}, pending=${pendingNonce}`);

    if (pendingNonce > currentNonce) {
      const pendingCount = pendingNonce - currentNonce;
      throw new Error(
        `❌ Cannot send transaction: ${pendingCount} pending transaction(s) blocking the queue. ` +
        `Wait for pending transactions to clear or use a different wallet.`
      );
    }

    console.log(`✅ No pending transactions - proceeding with nonce ${currentNonce}`);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  const oracle = new MinimalPriceOracle();
  await oracle.init();

  app.use((_, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });

  app.use("/api", createApiRoutes(oracle));
  app.use("/api/debug", createDebugRoutes(oracle));

  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    console.log(`Oracle running on port ${PORT}`);
    logAvailableRoutes();
  });

  return server;
}

startServer()
  .then((server) => {
    process.on("SIGINT", () => server.close(() => process.exit(0)));
    process.on("SIGTERM", () => server.close(() => process.exit(0)));
  })
  .catch((error) => {
    console.error("Server startup failed:", error);
    process.exit(1);
  });

export { DEMO_PRODUCTS, MinimalPriceOracle };
