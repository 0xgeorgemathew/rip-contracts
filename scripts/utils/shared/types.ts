/**
 * TypeScript interfaces for JSON blob storage
 */

export interface PriceData {
  id: string;
  name: string;
  price: number;
  timestamp?: number;
}

export interface BlobResult {
  blob: Uint8Array;
  commitment: string;
  proof: string;
}