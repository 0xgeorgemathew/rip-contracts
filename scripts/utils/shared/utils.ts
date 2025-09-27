/**
 * Utility functions for EIP-4844 blob operations
 */

import { ethers } from "ethers";
import * as kzg from "c-kzg";
import { BLOB_CONFIG, GAS_CONFIG } from "./config";

export class BlobUtils {
  static createBlobFromText(message: string): { blob: Uint8Array; commitment: string; proof: string } {
    const messageBytes = new TextEncoder().encode(message);

    if (messageBytes.length > BLOB_CONFIG.SIZE_BYTES) {
      throw new Error(`Message too large: ${messageBytes.length} bytes exceeds blob capacity of ${BLOB_CONFIG.SIZE_BYTES} bytes`);
    }

    const blob = this.createValidBlob(messageBytes);
    const commitment = kzg.blobToKzgCommitment(blob);
    const proof = kzg.computeBlobKzgProof(blob, commitment);

    return {
      blob,
      commitment: "0x" + Buffer.from(commitment).toString("hex"),
      proof: "0x" + Buffer.from(proof).toString("hex")
    };
  }

  private static createValidBlob(data: Uint8Array): Uint8Array {
    const blob = new Uint8Array(BLOB_CONFIG.SIZE_BYTES);
    const BLS_MODULUS = BigInt('0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001');

    blob.set(data);

    for (let i = 0; i < BLOB_CONFIG.SIZE_BYTES; i += 32) {
      const fieldElement = blob.slice(i, i + 32);
      const fieldBigInt = BigInt('0x' + Array.from(fieldElement).map(b => b.toString(16).padStart(2, '0')).join(''));

      if (fieldBigInt >= BLS_MODULUS && i < data.length) {
        blob[i] = blob[i] & 0x73;
      } else if (fieldBigInt >= BLS_MODULUS) {
        blob[i] = 0;
      }
    }

    return blob;
  }

  static extractTextFromBlob(blob: Uint8Array): string {
    const messageEnd = blob.findIndex(byte => byte === 0);
    return new TextDecoder().decode(blob.slice(0, messageEnd === -1 ? blob.length : messageEnd));
  }

  static createVersionedHash(commitment: string): string {
    const fullHash = ethers.sha256(ethers.getBytes(commitment));
    const versionByte = BLOB_CONFIG.VERSION.toString(16).padStart(2, '0');
    return `0x${versionByte}${fullHash.slice(4)}`;
  }

  static async calculateBlobGasPrice(provider: ethers.JsonRpcProvider): Promise<bigint> {
    try {
      const feeHistory = await provider.send("eth_feeHistory", [1, "latest", []]);
      if (feeHistory.baseFeePerBlobGas?.[0]) {
        const networkBlobFee = BigInt(feeHistory.baseFeePerBlobGas[0]);
        console.log(`📊 Network blob base fee: ${ethers.formatUnits(networkBlobFee, "gwei")} gwei`);
        return networkBlobFee;
      }
    } catch {
      console.log("⚠️  eth_feeHistory not available, falling back to calculation");
    }

    const latestBlock = await provider.getBlock("latest");
    if (!latestBlock) throw new Error("Unable to fetch latest block");

    const excessBlobGas = latestBlock.excessBlobGas || BigInt(0);
    console.log(`📊 Excess blob gas: ${excessBlobGas}`);

    const calculatedPrice = this.calculateBaseFeePerBlobGas(excessBlobGas);
    console.log(`📊 Calculated blob base fee: ${ethers.formatUnits(calculatedPrice, "gwei")} gwei`);

    return calculatedPrice;
  }

  private static calculateBaseFeePerBlobGas(excessBlobGas: bigint): bigint {
    const MIN_BLOB_GASPRICE = BigInt(1);
    const BLOB_GASPRICE_UPDATE_FRACTION = BigInt(3338477);

    return excessBlobGas === BigInt(0) ? MIN_BLOB_GASPRICE : this.fakeExponential(MIN_BLOB_GASPRICE, excessBlobGas, BLOB_GASPRICE_UPDATE_FRACTION);
  }

  private static fakeExponential(factor: bigint, numerator: bigint, denominator: bigint): bigint {
    let i = BigInt(1);
    let output = BigInt(0);
    let numeratorAccum = factor * denominator;

    while (numeratorAccum > BigInt(0) && i < BigInt(50)) {
      output += numeratorAccum;
      numeratorAccum = (numeratorAccum * numerator) / (denominator * i);
      i += BigInt(1);
    }

    return output / denominator;
  }

  static calculateFees(calldataGasPrice: bigint, blobGasPrice: bigint): { calldataFee: bigint; blobFee: bigint; totalFee: bigint } {
    const calldataFee = calldataGasPrice * BigInt(GAS_CONFIG.BASE_GAS_LIMIT);
    const blobFee = blobGasPrice * GAS_CONFIG.BLOB_GAS_USED;
    return { calldataFee, blobFee, totalFee: calldataFee + blobFee };
  }
}