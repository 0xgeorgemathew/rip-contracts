interface RouteInfo {
  method: string;
  path: string;
  description: string;
}

export function logAvailableRoutes(): void {
  const apiRoutes: RouteInfo[] = [
    { method: "GET", path: "/api/merkle-root", description: "Get current merkle root" },
    { method: "GET", path: "/api/merkle-proof/:productId", description: "Get merkle proof for product" },
    { method: "GET", path: "/api/prices", description: "Get all current prices" },
    { method: "POST", path: "/api/drop-prices", description: "Drop all prices by percentage" }
  ];

  const debugRoutes: RouteInfo[] = [
    { method: "POST", path: "/api/debug/set-price", description: "Set specific product price" },
    { method: "POST", path: "/api/debug/reset-prices", description: "Reset all prices to base" },
    { method: "GET", path: "/api/debug/proof-info/:productId", description: "Get detailed proof info" },
    { method: "GET", path: "/api/debug/status", description: "Health check with status" },
    { method: "GET", path: "/api/debug/tree-state", description: "Check tree synchronization" },
    { method: "POST", path: "/api/debug/force-rebuild", description: "Force rebuild from base" },
    { method: "GET", path: "/api/debug/export-state", description: "Export current oracle state" }
  ];

  const knowledgeGraphRoutes: RouteInfo[] = [
    // Data refresh endpoints
    { method: "POST", path: "/api/kg/refresh", description: "KG: Refresh data from Oracle" },
    { method: "GET", path: "/api/kg/cache/stats", description: "KG: Get cache statistics" },
    // Product intelligence endpoints
    { method: "GET", path: "/api/kg/products/current-prices", description: "KG: Get current prices" },
    { method: "GET", path: "/api/kg/products/:id/history", description: "KG: Get product price history" },
    { method: "GET", path: "/api/kg/products/search", description: "KG: Search products" },
    // Price drop analytics endpoints
    { method: "GET", path: "/api/kg/price-drops/recent", description: "KG: Get recent price drops" },
    { method: "GET", path: "/api/kg/price-drops/:productId", description: "KG: Get product price drops" },
    // Oracle activity endpoints
    { method: "GET", path: "/api/kg/oracle/activity", description: "KG: Get oracle activity timeline" },
    { method: "GET", path: "/api/kg/oracle/merkle-root", description: "KG: Get merkle root info" },
    // Market overview endpoints
    { method: "GET", path: "/api/kg/price-trends", description: "KG: Get price trend data" },
    { method: "GET", path: "/api/kg/market/overview", description: "KG: Get market overview" },
    // Semantic query endpoints
    { method: "POST", path: "/api/kg/query/semantic", description: "KG: Execute semantic query" },
    // System status endpoints
    { method: "GET", path: "/api/kg/status", description: "KG: Get integration status" },
    { method: "POST", path: "/api/kg/cache/clear", description: "KG: Clear query cache" }
  ];

  console.log("\n📍 Available API Routes:");
  console.log("────────────────────────────────────────────────────");
  apiRoutes.forEach(route => {
    const method = route.method.padEnd(5);
    const path = route.path.padEnd(30);
    console.log(`  ${method} ${path} ${route.description}`);
  });

  console.log("\n📍 Available Debug Routes:");
  console.log("────────────────────────────────────────────────────");
  debugRoutes.forEach(route => {
    const method = route.method.padEnd(5);
    const path = route.path.padEnd(40);
    console.log(`  ${method} ${path} ${route.description}`);
  });

  console.log("\n📍 Available Knowledge Graph Routes:");
  console.log("────────────────────────────────────────────────────");
  knowledgeGraphRoutes.forEach(route => {
    const method = route.method.padEnd(5);
    const path = route.path.padEnd(40);
    console.log(`  ${method} ${path} ${route.description}`);
  });
  
  console.log("\n🌐 Knowledge Graph Dashboard:");
  console.log("────────────────────────────────────────────────────");
  console.log(`  📊 Dashboard UI: http://localhost:3001/`);
  console.log(`  🔗 Interactive Knowledge Graph visualization`);
  console.log(`  📈 Real-time price charts with ~70% optimized payloads`);
  console.log(`  🤖 Live API testing and documentation`);
  console.log(`  ⚡ Optimized responses with essential data only`);
  console.log("────────────────────────────────────────────────────\n");
}