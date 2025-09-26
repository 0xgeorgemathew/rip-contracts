import { Router } from "express";
import { MinimalPriceOracle, DEMO_PRODUCTS } from "./minimalOracle";
import { handleError } from "./utils/routeHelpers";

export function createApiRoutes(oracle: MinimalPriceOracle): Router {
  const router = Router();

  router.get("/merkle-root", async (req, res) => {
    try {
      const root = oracle.getMerkleRootSync();
      res.json({ root, timestamp: Date.now() });
    } catch (error: any) {
      handleError(res, error, "get merkle root");
    }
  });

  router.get("/merkle-proof/:productId", async (req, res) => {
    const { productId } = req.params;

    try {
      const proof = await oracle.getMerkleProof(productId);
      res.json(proof);
    } catch (error: any) {
      handleError(res, error, "generate merkle proof", {
        productId,
        availableProducts: DEMO_PRODUCTS.map((p) => ({
          id: p.id,
          name: p.name,
        })),
      });
    }
  });

  router.get("/prices", (req, res) => {
    try {
      const prices = oracle.getAllPrices();
      const merkleRoot = oracle.getMerkleRootSync();

      res.json({
        prices,
        merkleRoot,
        timestamp: Date.now(),
        meta: {
          totalProducts: prices.length,
          changedProducts: prices.filter((p) => p.change !== 0).length,
        },
      });
    } catch (error: any) {
      handleError(res, error, "get prices");
    }
  });

  router.post("/drop-prices", async (req, res) => {
    const percentage = req.body.percentage || 20;

    if (percentage <= 0 || percentage > 50) {
      return res.status(400).json({
        error: "Percentage must be between 1 and 50",
        provided: percentage,
        validRange: "1-50",
      });
    }

    try {
      const oldPrices = oracle.getAllPrices();
      const oldRoot = oracle.getMerkleRootSync();
      const oldValue = oldPrices.reduce((sum, p) => sum + p.currentPrice, 0);

      await oracle.dropAllPrices(percentage);

      const newPrices = oracle.getAllPrices();
      const newRoot = oracle.getMerkleRootSync();
      const newValue = newPrices.reduce((sum, p) => sum + p.currentPrice, 0);
      const actualDrop = ((oldValue - newValue) / oldValue) * 100;

      res.json({
        message: `All prices dropped by ${percentage}%`,
        newRoot,
        prices: newPrices,
        impact: {
          requestedDrop: percentage,
          actualDrop,
          oldTotalValue: oldValue,
          newTotalValue: newValue,
          valueLost: oldValue - newValue,
        },
        meta: { rootChanged: oldRoot !== newRoot },
      });
    } catch (error: any) {
      handleError(res, error, "drop prices", { percentage });
    }
  });

  return router;
}
