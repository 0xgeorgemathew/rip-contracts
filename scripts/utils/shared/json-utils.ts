/**
 * JSON-specific utility functions for EIP-4844 blob operations
 */

import { ethers } from "ethers";
import * as kzg from "c-kzg";
import { readFileSync } from "fs";
import { BLOB_CONFIG } from "./config";
import { BlobResult } from "./types";

export class JsonBlobUtils {
  /**
   * Create a blob from JSON file using EIP-4844 logic
   */
  static createBlobFromJSONFile(filePath: string): BlobResult {
    const jsonData = this.readJSONFromFile(filePath);
    return this.createBlobFromJSON(jsonData);
  }

  /**
   * Create a blob from JSON data using the same EIP-4844 logic as text storage
   */
  private static createBlobFromJSON(data: object): BlobResult {
    // Convert JSON to compact string representation
    const jsonString = JSON.stringify(data);
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(jsonString);

    if (jsonBytes.length > BLOB_CONFIG.SIZE_BYTES) {
      throw new Error(
        `JSON data too large: ${jsonBytes.length} bytes exceeds blob capacity of ${BLOB_CONFIG.SIZE_BYTES} bytes`
      );
    }

    // Create blob with field element validation
    const blob = this.createValidBlob(jsonBytes);

    // Generate KZG commitment and proof using same logic
    const commitment = kzg.blobToKzgCommitment(blob);
    const proof = kzg.computeBlobKzgProof(blob, commitment);

    return {
      blob,
      commitment: "0x" + Buffer.from(commitment).toString("hex"),
      proof: "0x" + Buffer.from(proof).toString("hex")
    };
  }

  /**
   * Create a valid blob with proper field element encoding
   * Uses 31 bytes per field element to avoid validation issues
   */
  private static createValidBlob(data: Uint8Array): Uint8Array {
    const blob = new Uint8Array(BLOB_CONFIG.SIZE_BYTES);
    const BYTES_PER_FIELD_ELEMENT = 32;

    let dataIndex = 0;

    // Pack data into field elements, using only 31 bytes per field element
    for (let fieldIndex = 0; fieldIndex < BLOB_CONFIG.SIZE_BYTES / BYTES_PER_FIELD_ELEMENT; fieldIndex++) {
      const fieldOffset = fieldIndex * BYTES_PER_FIELD_ELEMENT;

      // Always set first byte to 0 to ensure valid field element
      blob[fieldOffset] = 0;

      // Copy up to 31 bytes of data into this field element
      for (let byteIndex = 1; byteIndex < BYTES_PER_FIELD_ELEMENT && dataIndex < data.length; byteIndex++) {
        blob[fieldOffset + byteIndex] = data[dataIndex];
        dataIndex++;
      }

      // Stop if we've copied all data
      if (dataIndex >= data.length) {
        break;
      }
    }

    return blob;
  }

  /**
   * Extract JSON data from blob using field element decoding
   */
  static extractJSONFromBlob(blob: Uint8Array): object {
    const BYTES_PER_FIELD_ELEMENT = 32;
    const extractedData: number[] = [];

    // Extract data from field elements (skip first byte of each field element)
    for (let fieldIndex = 0; fieldIndex < BLOB_CONFIG.SIZE_BYTES / BYTES_PER_FIELD_ELEMENT; fieldIndex++) {
      const fieldOffset = fieldIndex * BYTES_PER_FIELD_ELEMENT;

      // Extract usable bytes from this field element (skip first byte)
      for (let byteIndex = 1; byteIndex < BYTES_PER_FIELD_ELEMENT; byteIndex++) {
        const byte = blob[fieldOffset + byteIndex];

        // Stop when we hit a null byte (end of data)
        if (byte === 0) {
          break;
        }

        extractedData.push(byte);
      }
    }

    // Convert extracted bytes to string
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(new Uint8Array(extractedData));

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error(`Invalid JSON data in blob: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create versioned hash using same logic as text implementation
   */
  static createVersionedHash(commitment: string): string {
    const commitmentBytes = ethers.getBytes(commitment);
    const fullHash = ethers.sha256(commitmentBytes);
    const versionByte = BLOB_CONFIG.VERSION.toString(16).padStart(2, '0');
    const hashPortion = fullHash.slice(4); // Skip '0x' prefix and first byte, take remaining 31 bytes

    return `0x${versionByte}${hashPortion}`;
  }

  /**
   * Read and parse JSON from file
   */
  static readJSONFromFile(filePath: string): object {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`JSON file not found: ${filePath}`);
      }
      throw new Error(`Failed to read or parse JSON file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate size of JSON data when encoded
   */
  static calculateJSONSize(data: object): number {
    const jsonString = JSON.stringify(data);
    return new TextEncoder().encode(jsonString).length;
  }
}