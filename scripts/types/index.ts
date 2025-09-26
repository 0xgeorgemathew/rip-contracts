/**
 * Shared TypeScript interfaces and types for the zkpp scripts
 *
 * This file contains all common interfaces and types used across the
 * Zero-Knowledge Price Protection system scripts including:
 * - Policy management (claimPolicy.ts)
 * - Purchase handling (purchasePolicy.ts)
 * - Oracle operations (minimalOracle.ts)
 * - API routes (apiRoutes.ts, debugRoutes.ts)
 */

// ============================================================================
// POLICY INTERFACES (used in claimPolicy.ts and purchasePolicy.ts)
// ============================================================================

/**
 * Complete policy data structure stored after successful policy purchase
 * Used in: claimPolicy.ts for loading policy data and processing claims
 */
export interface PolicyData {
  policyId: string;
  transactionHash: string;
  blockNumber: number;
  policyPurchaseDate: number; // Blockchain timestamp for contract validation
  purchaseDetails: {
    orderHash: string;
    invoicePrice: string;
    invoiceDate: number; // Original invoice date for circuit inputs
    productHash: string;
    salt: string;
    selectedTier: number;
    productId?: string; // Optional product ID to avoid reverse lookup
  };
  secretCommitment: string;
  premium: string;
  tier: number;
  contracts: {
    vault: string;
    token: string;
    verifier: string;
  };
  createdAt: string;
  network: string;
}

/**
 * Purchase details used in commitment generation
 * Used in: purchasePolicy.ts for generating commitments, claimPolicy.ts for verification
 */
export interface PurchaseDetails {
  orderHash: string;
  invoicePrice: bigint;
  invoiceDate: number;
  productHash: bigint;
  salt: bigint;
  selectedTier: number;
}

/**
 * Invoice data loaded from JSON file for policy purchase
 * Used in: purchasePolicy.ts for loading user invoice data
 */
export interface InvoiceData {
  orderNumber: string;
  purchasePriceUsd: string;
  purchaseDate: string;
  productId: string;
  description?: string;
}

/**
 * Premium tier boundary configuration
 * Used in: purchasePolicy.ts for calculating appropriate premium tiers
 */
export interface TierBoundary {
  min: bigint;
  max: bigint;
  tier: number;
  premium: bigint;
}

// ============================================================================
// ORACLE INTERFACES (used in minimalOracle.ts and API routes)
// ============================================================================

/**
 * Product definition for oracle price tracking
 * Used in: minimalOracle.ts, apiRoutes.ts, debugRoutes.ts for product management
 */
export interface Product {
  id: string;
  name: string;
  basePrice: number;
}

/**
 * Comprehensive merkle proof response with verification data
 * Used in: minimalOracle.ts for proof generation, API routes for responses
 */
export interface MerkleProofResponse {
  leaf: string;
  currentPrice: number;
  proof: Array<{
    position: "left" | "right";
    data: string;
  }>;
  siblings: string[];
  pathIndices: number[];
  root: string;
  productName: string;
  // Additional debug info for verification
  leafBigInt: string;
  productHash: string;
  productId: string;
}

// ============================================================================
// API RESPONSE TYPES (used in API routes)
// ============================================================================

/**
 * Price information response with change calculations
 * Used in: API routes for price listing endpoints
 */
export interface PriceInfo {
  id: string;
  name: string;
  currentPrice: number;
  basePrice: number;
  change: number;
}

/**
 * Oracle status information for health checks
 * Used in: debugRoutes.ts for system status endpoints
 */
export interface OracleStatus {
  oracle: {
    initialized: boolean;
    hasTree: boolean;
    merkleRoot: string;
    productCount: number;
  };
  contract: {
    connected: boolean;
    address: string | null;
  };
  signer: {
    address: string;
    balance: string;
  } | null;
}

/**
 * Health check response with scoring
 * Used in: debugRoutes.ts for comprehensive system health assessment
 */
export interface HealthCheck {
  score: number;
  maxScore: number;
  percentage: number;
  status: 'excellent' | 'good' | 'poor';
}