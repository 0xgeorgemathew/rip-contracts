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
    const path = route.path.padEnd(30);
    console.log(`  ${method} ${path} ${route.description}`);
  });
  console.log("────────────────────────────────────────────────────\n");
}