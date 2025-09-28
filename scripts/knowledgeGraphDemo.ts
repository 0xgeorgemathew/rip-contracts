
import { KnowledgeGraphPublisher } from "./utils/knowledge-graph/publisher";
import { KnowledgeGraphQuery } from "./utils/knowledge-graph/queries";
import { transformProductsToEntities } from "./utils/knowledge-graph/entities";
import { Product } from "./types";
import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';

// Load actual products from products.json
function loadProducts(): Product[] {
  const productsPath = path.join(__dirname, 'products.json');
  const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
  return productsData;
}

const DEMO_PRODUCTS: Product[] = loadProducts();



async function runKnowledgeGraphDemo() {
  console.log("🚀 Starting Knowledge Graph Integration Demo");
  console.log("=" .repeat(60));

  // ============================================================================
  // STEP 1: Initialize Knowledge Graph Publisher
  // ============================================================================
  
  console.log("\n📡 Step 1: Initializing Knowledge Graph Publisher");
  const publisher = new KnowledgeGraphPublisher({
    endpoint: process.env.KNOWLEDGE_GRAPH_ENDPOINT || "http://localhost:3001", // Use actual oracle endpoint
    namespace: "rip-price-protection-system"
  });

  await publisher.initialize();
  console.log("✅ Knowledge Graph Publisher initialized");

  // ============================================================================
  // STEP 2: Transform and Publish Product Catalog
  // ============================================================================

  console.log("\n📦 Step 2: Publishing Product Catalog to Knowledge Graph");
  
  const productEntities = transformProductsToEntities(DEMO_PRODUCTS);
  console.log(`📊 Transformed ${productEntities.length} products into Knowledge Graph entities:`);
  


  const catalogPublished = await publisher.publishProductCatalog(DEMO_PRODUCTS);
  console.log(`${catalogPublished ? '✅' : '⚠️'} Product catalog ${catalogPublished ? 'published successfully' : 'queued for publication'}`);

  // ============================================================================
  // STEP 3: Simulate Price Updates and Publish to Knowledge Graph
  // ============================================================================

  console.log("\n💰 Step 3: Getting Current Prices from Oracle");

  // Get current prices from the Knowledge Graph Query (which reads from oracle)
  const kgQuery = new KnowledgeGraphQuery();
  const currentPricesData = await kgQuery.getCurrentPrices();

  console.log(`📉 Found ${currentPricesData.length} products with live pricing data`);

  // Convert to Map only when needed for publisher
  const currentPrices = new Map(
    currentPricesData.map(item => [item.productId, item.price])
  );
  const priceStatePublished = await publisher.publishPriceState(currentPrices, DEMO_PRODUCTS);
  console.log(`${priceStatePublished ? '✅' : '⚠️'} Price state ${priceStatePublished ? 'published successfully' : 'queued for publication'}`);

  // ============================================================================
  // STEP 4: Simulate Price Drop Events
  // ============================================================================

  console.log("\n📉 Step 4: Publishing Price Drop Events");

  // Use first product with a price drop as example
  let priceDropPublished = false;
  const firstProduct = currentPricesData[0];
  const product = DEMO_PRODUCTS.find(p => p.id === firstProduct.productId);
  
  if (product && firstProduct.price < product.basePrice) {
    priceDropPublished = await publisher.publishPriceDropEvent(
      firstProduct.productId,
      product.basePrice,
      firstProduct.price,
      DEMO_PRODUCTS
    );
  } else {
    console.log("   • No significant price drops detected to publish");
  }

  console.log(`${priceDropPublished ? '✅' : '⚠️'} Price drop event ${priceDropPublished ? 'published successfully' : 'queued for publication'}`);

  // ============================================================================
  // STEP 5: Query Knowledge Graph Data
  // ============================================================================

  console.log("\n🔍 Step 5: Querying Knowledge Graph Data");

  // Display current prices (already loaded)
  console.log("\n📊 Current Prices:");
  currentPricesData.forEach(item => {
    console.log(`   • ${item.name}: $${(item.price/1000000).toFixed(2)}`);
  });

  // Query recent price drops
  console.log("\n📉 Recent Price Drops Query:");
  const recentDrops = await kgQuery.getRecentPriceDrops("24h");
  recentDrops.forEach(drop => {
    console.log(`   • ${drop.name}: ${drop.dropPercent.toFixed(1)}% drop ($${(drop.oldPrice/1000000).toFixed(2)} → $${(drop.newPrice/1000000).toFixed(2)})`);
  });

  // Query product history for first product
  console.log(`\n📈 Product History Query (${DEMO_PRODUCTS[0].name}):`);
  const productHistory = await kgQuery.getProductHistory(DEMO_PRODUCTS[0].id, "30d");
  if (productHistory) {
    console.log(`   • ${productHistory.name}: ${productHistory.pricePoints.length} data points, ${productHistory.totalChange.toFixed(1)}% total change`);
  }

  // Query market overview
  console.log("\n🏪 Market Overview Query:");
  const marketOverview = await kgQuery.getMarketOverview();
  console.log(`   • ${marketOverview.totalProducts} products, ${marketOverview.recentDrops} recent drops, avg ${marketOverview.avgDrop.toFixed(1)}%`);

  // ============================================================================
  // STEP 6: Test Semantic Queries
  // ============================================================================

  console.log("\n🧠 Step 6: Testing Semantic Queries");

  try {
    const semanticResults = await kgQuery.executeQuery("recent_drops", { timeframe: "24h" });
    console.log(`✅ Semantic query executed successfully, found ${semanticResults.length} results`);
  } catch (error) {
    console.log(`⚠️  Semantic query test: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // ============================================================================
  // STEP 7: Display Integration Status
  // ============================================================================

  console.log("\n📊 Step 7: Knowledge Graph Integration Status");

  const publisherStatus = publisher.getQueueStats();
  const queryStats = kgQuery.getCacheStats();

  console.log(`Publisher: ${publisherStatus.isReady ? '✅' : '❌'} ready, ${publisherStatus.queuedItems} queued`);
  console.log(`Query Cache: ${queryStats.validEntries}/${queryStats.totalEntries} valid entries`);

  // ============================================================================
  // STEP 8: Demonstrate Composability
  // ============================================================================

  console.log("\n🔗 Step 8: Demonstrating Composability");

  console.log("Knowledge Graph APIs that other applications can use:");
  console.log("   • GET /api/kg/products/current-prices - Real-time price data");
  console.log("   • GET /api/kg/price-drops/recent?timeframe=24h - Price drop alerts for DeFi protocols");
  console.log("   • GET /api/kg/market/overview - Market intelligence for traders");
  console.log("   • GET /api/kg/oracle/activity?timeframe=24h - Oracle activity timeline");
  console.log("   • GET /api/kg/price-trends?timeframe=30d&limit=8 - Price trend data for charting");

  console.log("\nExample use cases for other developers:");
  console.log("   📱 Mobile Apps: Query price history for user notifications");
  console.log("   🏦 DeFi Protocols: Monitor price drops for automated responses");
  console.log("   📊 Analytics Dashboards: Aggregate market data across products");
  console.log("   🤖 Trading Bots: Access semantic queries for decision making");

  // ============================================================================
  // CLEANUP
  // ============================================================================

  console.log("\n🧹 Cleanup: Shutting down Knowledge Graph integration");
  await publisher.shutdown();
  console.log("✅ Knowledge Graph Publisher shut down cleanly");

  console.log("\n🎉 Knowledge Graph Integration Demo Complete!");
  console.log("✅ Successfully demonstrated GRC-20 integration with Oracle system");
}

// Run the demo if this script is executed directly
if (require.main === module) {
  runKnowledgeGraphDemo()
    .then(() => {
      console.log("Demo completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Demo failed:", error);
      process.exit(1);
    });
}

export { runKnowledgeGraphDemo };