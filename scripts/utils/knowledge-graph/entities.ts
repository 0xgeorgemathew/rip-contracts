
import { Product, PriceInfo } from "../../types";

// Minimal context reference - full context hosted externally
export const KG_CONTEXT = {
  "@context": "https://schema.org/", // Use standard schema.org context
};

// ============================================================================
// PRODUCT ENTITIES
// ============================================================================

export interface ProductEntity {
  id: string;
  name: string;
  basePrice: number;
  category: string;
}

export function createProductEntity(product: Product): ProductEntity {
  return {
    id: product.id,
    name: product.name,
    basePrice: product.basePrice,
    category: inferProductCategory(product.name)
  };
}

function inferProductCategory(productName: string): string {
  const name = productName.toLowerCase();
  if (name.includes('iphone') || name.includes('galaxy') || name.includes('phone')) return 'smartphones';
  if (name.includes('macbook') || name.includes('laptop') || name.includes('dell')) return 'laptops';
  if (name.includes('ipad') || name.includes('tablet')) return 'tablets';
  if (name.includes('tv') || name.includes('sony')) return 'televisions';
  if (name.includes('airpods') || name.includes('headphones')) return 'audio';
  if (name.includes('switch') || name.includes('nintendo') || name.includes('gaming')) return 'gaming';
  if (name.includes('art') || name.includes('wishkey')) return 'art-supplies';
  return 'electronics';
}

// ============================================================================
// PRICE POINT ENTITIES
// ============================================================================

export interface PricePointEntity {
  id: string;
  productId: string;
  price: number;
  timestamp: string;
  changePercent?: number;
}

export function createPricePointEntity(productId: string, price: number, basePrice?: number): PricePointEntity {
  const entity: PricePointEntity = {
    id: `${productId}-${Date.now()}`,
    productId,
    price,
    timestamp: new Date().toISOString()
  };

  if (basePrice) {
    entity.changePercent = ((price - basePrice) / basePrice) * 100;
  }

  return entity;
}

// ============================================================================
// PRICE DROP EVENT ENTITIES
// ============================================================================

export interface PriceDropEventEntity {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  dropPercent: number;
  timestamp: string;
}

export function createPriceDropEventEntity(
  productId: string, 
  oldPrice: number, 
  newPrice: number
): PriceDropEventEntity {
  const dropPercent = ((oldPrice - newPrice) / oldPrice) * 100;
  
  return {
    id: `drop-${productId}-${Date.now()}`,
    productId,
    oldPrice,
    newPrice,
    dropPercent: Number(dropPercent.toFixed(2)),
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// MERKLE ROOT ENTITIES
// ============================================================================

export interface MerkleRootEntity {
  id: string;
  root: string;
  timestamp: string;
  treeSize: number;
}

export function createMerkleRootEntity(
  root: string, 
  treeSize: number
): MerkleRootEntity {
  return {
    id: `merkle-${root.slice(0, 8)}`,
    root,
    timestamp: new Date().toISOString(),
    treeSize
  };
}

// ============================================================================
// ORACLE STATE ENTITIES
// ============================================================================

export interface OracleStateEntity {
  id: string;
  totalProducts: number;
  totalUpdates: number;
  avgDrop: number;
  timestamp: string;
  activeProducts: string[];
}

export function createOracleStateEntity(
  totalProducts: number,
  totalPriceUpdates: number,
  averagePriceDrop: number,
  activeProducts: string[]
): OracleStateEntity {
  return {
    id: `oracle-${Date.now()}`,
    totalProducts,
    totalUpdates: totalPriceUpdates,
    avgDrop: Number(averagePriceDrop.toFixed(2)),
    timestamp: new Date().toISOString(),
    activeProducts
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Transform existing products.json data into Knowledge Graph Product entities
 */
export function transformProductsToEntities(products: Product[]): ProductEntity[] {
  return products.map(createProductEntity);
}

/**
 * Transform current price data into Knowledge Graph PricePoint entities
 */
export function transformPricesToEntities(
  pricesMap: Map<string, number>,
  products: Product[],
  leafHashMap?: Map<string, string>
): PricePointEntity[] {
  return Array.from(pricesMap.entries()).map(([productId, price]) => {
    const product = products.find(p => p.id === productId);
    const basePrice = product?.basePrice || price;
    return createPricePointEntity(productId, price, basePrice);
  });
}

/**
 * Create a batch of entities for bulk publishing
 */
export interface EntityBatch {
  products: ProductEntity[];
  pricePoints: PricePointEntity[];
  priceDropEvents: PriceDropEventEntity[];
  merkleRoots: MerkleRootEntity[];
  oracleStates: OracleStateEntity[];
}

export function createEntityBatch(): EntityBatch {
  return {
    products: [],
    pricePoints: [],
    priceDropEvents: [],
    merkleRoots: [],
    oracleStates: []
  };
}