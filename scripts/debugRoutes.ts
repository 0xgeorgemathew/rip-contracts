import { Router } from "express";
import { MinimalPriceOracle, DEMO_PRODUCTS } from "./minimalOracle";
import { handleError } from "./utils/routeHelpers";

export function createDebugRoutes(oracle: MinimalPriceOracle): Router {
  const router = Router();

  router.post("/set-price", async (req, res) => {
    const { productId, price } = req.body;
    if (!productId || price === undefined) {
      return res.status(400).json({ error: "productId and price are required" });
    }

    try {
      const normalizedProductId = productId.toUpperCase().trim();
      const product = DEMO_PRODUCTS.find((p) => p.id === normalizedProductId);
      if (!product) {
        return res.status(404).json({ error: `Product ${normalizedProductId} not found` });
      }

      const oldRoot = oracle.getMerkleRootSync();
      const numericPrice = Math.floor(Number(price));
      await oracle.setProductPrice(normalizedProductId, numericPrice);
      const newRoot = oracle.getMerkleRootSync();
      const priceChange = ((numericPrice - product.basePrice) / product.basePrice) * 100;

      res.json({
        message: `Price set to $${(numericPrice / 1000000).toFixed(2)}`,
        productId: normalizedProductId,
        productName: product.name,
        newPrice: numericPrice,
        priceChange,
        rootChanged: oldRoot !== newRoot
      });
    } catch (error: any) {
      handleError(res, error, "set price", { productId, price });
    }
  });

  router.post("/reset-prices", async (_, res) => {
    try {
      const changedProducts = oracle.getAllPrices().filter(p => p.change !== 0);
      oracle.resetAllPrices();
      await oracle.updateMerkleRoot();

      res.json({
        message: "All prices reset to base values",
        newRoot: oracle.getMerkleRootSync(),
        productsReset: changedProducts.length
      });
    } catch (error: any) {
      handleError(res, error, "reset prices");
    }
  });

  router.get("/proof-info/:productId", async (req, res) => {
    const productId = req.params.productId;
    try {
      const proof = await oracle.getMerkleProof(productId);
      const product = DEMO_PRODUCTS.find((p) => p.id === productId.toUpperCase());

      res.json({
        product,
        proof,
        debugInfo: {
          leafAsHex: "0x" + BigInt(proof.leaf).toString(16),
          rootAsHex: "0x" + proof.root,
          siblingsAsHex: proof.siblings.map((s) => "0x" + BigInt(s).toString(16)),
          pathExplanation: proof.pathIndices.map((p, i) => `Level ${i}: ${p === 0 ? 'Left' : 'Right'}`)
        }
      });
    } catch (error: any) {
      handleError(res, error, "generate detailed proof", { productId });
    }
  });

  router.get("/status", async (_, res) => {
    try {
      const signerInfo = await oracle.getSignerInfo();
      const contractAddress = await oracle.getContractAddress();
      const merkleRoot = oracle.getMerkleRootSync();

      const healthChecks = [
        oracle.isInitialized,
        oracle.hasTree,
        oracle.isContractConnected,
        !!signerInfo
      ];
      const healthScore = healthChecks.filter(Boolean).length;

      res.json({
        oracle: { initialized: oracle.isInitialized, hasTree: oracle.hasTree, merkleRoot },
        contract: { connected: oracle.isContractConnected, address: contractAddress },
        signer: signerInfo,
        health: {
          score: healthScore,
          status: healthScore === 4 ? 'excellent' : healthScore >= 2 ? 'good' : 'poor'
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      handleError(res, error, "get status");
    }
  });

  router.get("/tree-state", async (_, res) => {
    try {
      if (!oracle.isInitialized) {
        return res.status(503).json({ error: "Oracle not initialized" });
      }

      const localRoot = oracle.getMerkleRootSync();
      let onChainRoot = "not_connected";
      let chainReadError: string | null = null;

      if (oracle.isContractConnected) {
        try {
          onChainRoot = await oracle.getOnChainMerkleRoot() || "error_reading_chain";
        } catch (error: any) {
          onChainRoot = "error_reading_chain";
          chainReadError = error.message;
        }
      }

      const consistent = localRoot === onChainRoot;
      const message = consistent ? "Synchronized" :
                     oracle.isContractConnected ? "State mismatch" : "Local-only mode";

      res.json({
        local: { root: localRoot, hasTree: oracle.hasTree },
        onChain: { root: onChainRoot, connected: oracle.isContractConnected, readError: chainReadError },
        consistent,
        message,
        timestamp: Date.now()
      });
    } catch (error: any) {
      handleError(res, error, "get tree state");
    }
  });

  router.post("/force-rebuild", async (_, res) => {
    try {
      if (!oracle.isInitialized) {
        return res.status(503).json({ error: "Oracle not initialized" });
      }

      const oldPrices = oracle.getAllPrices();
      const changedProducts = oldPrices.filter(p => p.change !== 0);
      const oldRoot = oracle.getMerkleRootSync();

      await oracle.forceRebuildFromBase();

      const newRoot = oracle.getMerkleRootSync();
      const stillChanged = oracle.getAllPrices().filter(p => p.change !== 0);

      res.json({
        message: "Force rebuild completed",
        newRoot,
        productsReset: changedProducts.length,
        allPricesReset: stillChanged.length === 0,
        rootChanged: oldRoot !== newRoot,
        timestamp: Date.now()
      });
    } catch (error: any) {
      handleError(res, error, "force rebuild");
    }
  });

  router.get("/export-state", async (_, res) => {
    try {
      if (!oracle.isInitialized) {
        return res.status(503).json({ error: "Oracle not initialized" });
      }

      const merkleRoot = oracle.getMerkleRootSync();
      const currentPrices = oracle.getAllPrices();
      const signerInfo = await oracle.getSignerInfo();
      const contractAddress = await oracle.getContractAddress();
      const changedProducts = currentPrices.filter(p => p.change !== 0);
      const totalValue = currentPrices.reduce((sum, p) => sum + p.currentPrice, 0);

      res.json({
        merkleRoot,
        productCount: DEMO_PRODUCTS.length,
        currentPrices,
        oracle: {
          initialized: oracle.isInitialized,
          hasTree: oracle.hasTree,
          contractConnected: oracle.isContractConnected
        },
        contract: { address: contractAddress, connected: oracle.isContractConnected },
        signer: signerInfo,
        summary: {
          changedProductsCount: changedProducts.length,
          totalPortfolioValue: totalValue
        },
        timestamp: Date.now()
      });
    } catch (error: any) {
      handleError(res, error, "export state");
    }
  });

  return router;
}