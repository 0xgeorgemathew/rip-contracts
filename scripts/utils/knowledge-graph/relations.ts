import { 
  ProductEntity, 
  PricePointEntity, 
  PriceDropEventEntity, 
  MerkleRootEntity,
  OracleStateEntity
} from "./entities";

// ============================================================================
// RELATION TYPES
// ============================================================================

export interface RelationEntity {
  id: string;
  type: string;
  from: string;
  to: string;
  timestamp: string;
}

// Specific relation types
export type ProductPriceRelation = RelationEntity & {
  type: "current" | "historical";
  price: number;
  changePercent?: number;
};

export type PriceEventRelation = RelationEntity & {
  type: "event";
  eventType: "drop" | "increase" | "stable";
  magnitude: number;
};

export type ValidationRelation = RelationEntity & {
  type: "validation";
  method: "merkle" | "signature";
  proof?: string;
};

export type PublishRelation = RelationEntity & {
  type: "publish";
  method: "oracle" | "blockchain";
  blockNumber?: number;
};

// ============================================================================
// RELATION BUILDERS
// ============================================================================

/**
 * Create "hasCurrentPrice" relation between Product and PricePoint
 */
export function createProductCurrentPriceRelation(
  product: ProductEntity,
  pricePoint: PricePointEntity
): ProductPriceRelation {
  return {
    id: `current-${product.id}-${Date.now()}`,
    type: "current",
    from: product.id,
    to: pricePoint.id,
    timestamp: new Date().toISOString(),
    price: pricePoint.price,
    changePercent: pricePoint.changePercent
  };
}

/**
 * Create "hasHistoricalPrice" relation for price history tracking
 */
export function createProductHistoricalPriceRelation(
  product: ProductEntity,
  pricePoint: PricePointEntity
): ProductPriceRelation {
  return {
    id: `historical-${product.id}-${Date.now()}`,
    type: "historical",
    from: product.id,
    to: pricePoint.id,
    timestamp: pricePoint.timestamp,
    price: pricePoint.price,
    changePercent: pricePoint.changePercent
  };
}

/**
 * Create "triggersEvent" relation between PricePoint and PriceDropEvent
 */
export function createPriceEventRelation(
  pricePoint: PricePointEntity,
  priceDropEvent: PriceDropEventEntity
): PriceEventRelation {
  const magnitude = Math.abs(priceDropEvent.dropPercent);
  const eventType = priceDropEvent.dropPercent > 0 ? "drop" : 
                   priceDropEvent.dropPercent < 0 ? "increase" : "stable";

  return {
    id: `event-${pricePoint.id}-${priceDropEvent.id}`,
    type: "event",
    from: pricePoint.id,
    to: priceDropEvent.id,
    timestamp: priceDropEvent.timestamp,
    eventType,
    magnitude
  };
}

/**
 * Create "validatedBy" relation between PriceDropEvent and MerkleRoot
 */
export function createValidationRelation(
  priceDropEvent: PriceDropEventEntity,
  merkleRoot: MerkleRootEntity,
  proofData?: string
): ValidationRelation {
  return {
    id: `validation-${priceDropEvent.id}-${merkleRoot.id}`,
    type: "validation",
    from: priceDropEvent.id,
    to: merkleRoot.id,
    timestamp: new Date().toISOString(),
    method: "merkle",
    proof: proofData
  };
}

/**
 * Create "publishesPrice" relation between Oracle and PricePoint
 */
export function createPublishRelation(
  oracleState: OracleStateEntity,
  pricePoint: PricePointEntity,
  blockNumber?: number
): PublishRelation {
  return {
    id: `publish-${oracleState.id}-${pricePoint.id}`,
    type: "publish",
    from: oracleState.id,
    to: pricePoint.id,
    timestamp: pricePoint.timestamp,
    method: blockNumber ? "blockchain" : "oracle",
    blockNumber
  };
}

// ============================================================================
// RELATION QUERIES AND UTILITIES
// ============================================================================

/**
 * Relation query filters for finding specific relationship types
 */
export interface RelationQuery {
  fromType?: string;
  relationType?: string;
  toType?: string;
  timeRange?: {
    start: string;
    end: string;
  };
  productId?: string;
}

/**
 * Generate SPARQL-like query patterns for Knowledge Graph queries
 */
export function buildRelationQuery(query: RelationQuery): string {
  const filters: string[] = [];
  
  if (query.fromType) {
    filters.push(`fromType:${query.fromType}`);
  }
  
  if (query.relationType) {
    filters.push(`type:${query.relationType}`);
  }
  
  if (query.toType) {
    filters.push(`toType:${query.toType}`);
  }
  
  if (query.timeRange) {
    filters.push(`timestamp:[${query.timeRange.start} TO ${query.timeRange.end}]`);
  }
  
  if (query.productId) {
    filters.push(`productId:${query.productId}`);
  }
  
  return filters.join(' AND ');
}

/**
 * Batch relation creation for efficient Knowledge Graph updates
 */
export interface RelationBatch {
  productPriceRelations: ProductPriceRelation[];
  priceEventRelations: PriceEventRelation[];
  validationRelations: ValidationRelation[];
  publishRelations: PublishRelation[];
}

export function createRelationBatch(): RelationBatch {
  return {
    productPriceRelations: [],
    priceEventRelations: [],
    validationRelations: [],
    publishRelations: []
  };
}

/**
 * Create comprehensive relations for a price update event
 */
export function createPriceUpdateRelations(
  product: ProductEntity,
  oldPricePoint: PricePointEntity,
  newPricePoint: PricePointEntity,
  priceDropEvent: PriceDropEventEntity,
  merkleRoot: MerkleRootEntity,
  oracleState: OracleStateEntity
): RelationBatch {
  const batch = createRelationBatch();
  
  batch.productPriceRelations.push(
    createProductCurrentPriceRelation(product, newPricePoint),
    createProductHistoricalPriceRelation(product, oldPricePoint)
  );
  
  batch.priceEventRelations.push(
    createPriceEventRelation(newPricePoint, priceDropEvent)
  );
  
  batch.validationRelations.push(
    createValidationRelation(priceDropEvent, merkleRoot)
  );
  
  batch.publishRelations.push(
    createPublishRelation(oracleState, oldPricePoint),
    createPublishRelation(oracleState, newPricePoint)
  );
  
  return batch;
}

// ============================================================================
// GRAPH TRAVERSAL HELPERS
// ============================================================================

/**
 * Define common graph traversal patterns for the price intelligence system
 */
export const QUERY_PATTERNS = {
  RECENT_DROPS: {
    type: "event",
    eventType: "drop",
    timeRange: "24h"
  },
  
  PRICE_HISTORY: {
    type: "historical",
    orderBy: "timestamp"
  },
  
  VALIDATED_EVENTS: {
    type: "validation",
    method: "merkle"
  },
  
  ORACLE_ACTIVITY: {
    type: "publish",
    orderBy: "timestamp"
  }
};

/**
 * Helper to create semantic queries based on traversal patterns
 */
export function createSemanticQuery(pattern: keyof typeof QUERY_PATTERNS, params?: Record<string, any>): string {
  const p = QUERY_PATTERNS[pattern];
  return JSON.stringify({ ...p, ...params });
}