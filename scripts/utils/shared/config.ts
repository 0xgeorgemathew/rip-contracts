/**
 * Configuration constants for EIP-4844 blob transactions
 */

export const BLOB_CONFIG = {
  SIZE_BYTES: 131072,
  VERSION: 0x01
} as const;

export const GAS_CONFIG = {
  BASE_GAS_LIMIT: 21000,
  BLOB_GAS_MULTIPLIER: BigInt(2), // Safety multiplier for maxFeePerBlobGas
  BLOB_GAS_USED: BigInt(131072) // Fixed blob gas consumption (128KB)
} as const;