/**
 * Knowledge Graph API Routes for E-commerce Price Intelligence Hub
 * 
 * This module provides REST API endpoints for querying Knowledge Graph data
 * and demonstrates the composable nature of the price intelligence system.
 */

import { Router, Request, Response } from "express";
import { MinimalPriceOracle } from "./minimalOracle";
import { KnowledgeGraphQuery, PriceDropAlert, OracleActivityTimeline } from "./utils/knowledge-graph/queries";

const router = Router();

// Initialize Knowledge Graph query interface
const kgQuery = new KnowledgeGraphQuery();

/**
 * Create Knowledge Graph API routes
 */
export function createKnowledgeGraphRoutes(oracle: MinimalPriceOracle): Router {

  // ============================================================================
  // DATA REFRESH ENDPOINTS
  // ============================================================================

  /**
   * POST /kg/refresh
   * Refresh Knowledge Graph data from Oracle (gets live data from oracle)
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      // Get essential data from oracle
      const liveData = {
        products: oracle.getAllPrices(),
        merkleRoot: oracle.getMerkleRootSync(),
        isInitialized: oracle.isInitialized,
        blockNumber: undefined
      };

      // Get current block number from the blockchain
      try {
        if (oracle.isContractConnected && oracle.provider) {
          liveData.blockNumber = await oracle.provider.getBlockNumber();
        }
      } catch (error) {
        console.warn('Could not get current block number:', error);
      }

      kgQuery.refreshDataFromOracle(liveData);

      res.json({
        success: true,
        refreshed: liveData.products.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Knowledge Graph refresh failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Refresh failed'
      });
    }
  });

  /**
   * GET /kg/cache/stats
   * Get Knowledge Graph cache statistics
   */
  router.get('/cache/stats', (req: Request, res: Response) => {
    try {
      const stats = kgQuery.getCacheStats();
      
      res.json({
        success: true,
        ...stats
      });
    } catch (error) {
      console.error('Knowledge Graph cache stats failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Cache stats failed'
      });
    }
  });

  // ============================================================================
  // PRODUCT INTELLIGENCE ENDPOINTS
  // ============================================================================

  /**
   * GET /kg/products/current-prices
   * Get current prices for all products from Knowledge Graph
   */
  router.get('/products/current-prices', async (req: Request, res: Response) => {
    try {
      const prices = await kgQuery.getCurrentPrices();
      
      res.json({
        success: true,
        data: prices,
        count: prices.length
      });
    } catch (error) {
      console.error('Knowledge Graph current prices query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Price query failed'
      });
    }
  });

  /**
   * GET /kg/products/:productId/history
   * Get price history for a specific product
   */
  router.get('/products/:productId/history', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      const { timeframe = '30d' } = req.query;
      
      const history = await kgQuery.getProductHistory(productId.toUpperCase(), timeframe as string);
      
      if (!history) {
        return res.status(404).json({
          success: false,
          error: `Product ${productId} not found in Knowledge Graph`
        });
      }
      
      res.json({
        success: true,
        data: history,
        points: history.pricePoints.length
      });
    } catch (error) {
      console.error(`Knowledge Graph product history query failed for ${req.params.productId}:`, error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'History query failed'
      });
    }
  });

  /**
   * GET /kg/products/search
   * Search products by name or category
   */
  router.get('/products/search', async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Query parameter "q" is required'
        });
      }
      
      const results = await kgQuery.searchProducts(q);
      
      res.json({
        success: true,
        data: results,
        count: results.length
      });
    } catch (error) {
      console.error('Knowledge Graph product search failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Search failed'
      });
    }
  });

  // ============================================================================
  // PRICE DROP ANALYTICS ENDPOINTS
  // ============================================================================

  /**
   * GET /kg/price-drops/recent
   * Get recent price drops across all products
   */
  router.get('/price-drops/recent', async (req: Request, res: Response) => {
    try {
      const { timeframe = '24h' } = req.query;
      
      const priceDrops = await kgQuery.getRecentPriceDrops(timeframe as string);
      
      res.json({
        success: true,
        data: priceDrops,
        count: priceDrops.length
      });
    } catch (error) {
      console.error('Knowledge Graph recent price drops query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Price drops query failed'
      });
    }
  });

  /**
   * GET /kg/price-drops/:productId
   * Get price drops for a specific product
   */
  router.get('/price-drops/:productId', async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;
      const { timeframe = '30d' } = req.query;
      
      const priceDrops = await kgQuery.getProductPriceDrops(productId.toUpperCase(), timeframe as string);
      
      res.json({
        success: true,
        data: priceDrops,
        count: priceDrops.length
      });
    } catch (error) {
      console.error(`Knowledge Graph price drops query failed for ${req.params.productId}:`, error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Product drops query failed'
      });
    }
  });

  // ============================================================================
  // ORACLE ACTIVITY ENDPOINTS
  // ============================================================================

  /**
   * GET /kg/oracle/activity
   * Get Oracle activity timeline from Knowledge Graph
   */
  router.get('/oracle/activity', async (req: Request, res: Response) => {
    try {
      const { timeframe = '24h' } = req.query;
      
      const activity = await kgQuery.getOracleActivity(timeframe as string);
      
      res.json({
        success: true,
        data: activity,
        count: activity.length
      });
    } catch (error) {
      console.error('Knowledge Graph oracle activity query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Activity query failed'
      });
    }
  });

  /**
   * GET /kg/oracle/merkle-root
   * Get current merkle root information from Knowledge Graph
   */
  router.get('/oracle/merkle-root', async (req: Request, res: Response) => {
    try {
      const merkleRoot = await kgQuery.getCurrentMerkleRoot();
      
      if (!merkleRoot) {
        return res.status(404).json({
          success: false,
          error: 'No merkle root data found in Knowledge Graph'
        });
      }
      
      res.json({
        success: true,
        data: merkleRoot
      });
    } catch (error) {
      console.error('Knowledge Graph merkle root query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Merkle root query failed'
      });
    }
  });

  // ============================================================================
  // MARKET OVERVIEW ENDPOINTS
  // ============================================================================

  /**
   * GET /kg/price-trends
   * Get price trend data for charting
   */
  router.get('/price-trends', async (req: Request, res: Response) => {
    try {
      const { timeframe = '30d', limit = 4 } = req.query;

      const trends = await kgQuery.getPriceTrends(timeframe as string, parseInt(limit as string));

      res.json({
        success: true,
        data: trends,
        count: trends.length
      });
    } catch (error) {
      console.error('Knowledge Graph price trends query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Trends query failed'
      });
    }
  });

  /**
   * GET /kg/market/overview
   * Get comprehensive market overview from Knowledge Graph
   */
  router.get('/market/overview', async (req: Request, res: Response) => {
    try {
      const overview = await kgQuery.getMarketOverview();
      
      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      console.error('Knowledge Graph market overview query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Market overview failed'
      });
    }
  });

  // ============================================================================
  // SEMANTIC QUERY ENDPOINTS
  // ============================================================================

  /**
   * POST /kg/query/semantic
   * Execute custom semantic queries using traversal patterns
   */
  router.post('/query/semantic', async (req: Request, res: Response) => {
    try {
      const { pattern, params } = req.body;
      
      if (!pattern) {
        return res.status(400).json({
          success: false,
          error: 'Pattern parameter is required'
        });
      }
      
      const results = await kgQuery.executeQuery(pattern, params);
      
      res.json({
        success: true,
        data: results,
        count: results.length
      });
    } catch (error) {
      console.error('Knowledge Graph semantic query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Semantic query failed'
      });
    }
  });

  // ============================================================================
  // SYSTEM STATUS ENDPOINTS
  // ============================================================================

  /**
   * GET /kg/status
   * Get Knowledge Graph integration status
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const oracleStatus = oracle.knowledgeGraphStatus;
      const cacheStats = kgQuery.getCacheStats();
      
      res.json({
        success: true,
        data: {
          knowledgeGraph: {
            isReady: oracleStatus.isReady,
            queuedItems: oracleStatus.queuedItems
          },
          queryCache: cacheStats,
          oracle: {
            initialized: oracle.isInitialized,
            hasTree: oracle.hasTree,
            contractConnected: oracle.isContractConnected
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Knowledge Graph status query failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Status query failed'
      });
    }
  });

  /**
   * POST /kg/cache/clear
   * Clear Knowledge Graph query cache
   */
  router.post('/cache/clear', async (req: Request, res: Response) => {
    try {
      kgQuery.clearCache();
      
      res.json({
        success: true,
        cleared: true
      });
    } catch (error) {
      console.error('Knowledge Graph cache clear failed:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Cache clear failed'
      });
    }
  });

  return router;
}

/**
 * Available Knowledge Graph API endpoints for documentation
 */
export const KNOWLEDGE_GRAPH_ENDPOINTS = {
  products: [
    'GET /api/kg/products/current-prices - Get current prices for all products',
    'GET /api/kg/products/:productId/history?timeframe=30d - Get price history for specific product',
    'GET /api/kg/products/search?q=iPhone - Search products by name or category'
  ],
  priceDrops: [
    'GET /api/kg/price-drops/recent?timeframe=24h - Get recent price drops',
    'GET /api/kg/price-drops/:productId?timeframe=30d - Get price drops for specific product'
  ],
  oracle: [
    'GET /api/kg/oracle/activity?timeframe=24h - Get Oracle activity timeline',
    'GET /api/kg/oracle/merkle-root - Get current merkle root information'
  ],
  market: [
    'GET /api/kg/market/overview - Get comprehensive market overview'
  ],
  query: [
    'POST /api/kg/query/semantic - Execute custom semantic queries',
    'Body: { "pattern": "RECENT_PRICE_DROPS", "params": { "timeframe": "24h" } }'
  ],
  system: [
    'GET /api/kg/status - Get Knowledge Graph integration status',
    'POST /api/kg/cache/clear - Clear query cache'
  ]
};