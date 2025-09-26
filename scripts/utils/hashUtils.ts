import { ethers } from "ethers";
import { Product } from "../types";

export function calculateProductHash(poseidon: any, productId: string): string {
  const productIdHash = ethers.keccak256(ethers.toUtf8Bytes(productId));
  const productHashField = poseidon([BigInt(productIdHash)]);
  return poseidon.F.toObject(productHashField).toString();
}

export function calculateLeafHash(poseidon: any, productHash: string, price: number): string {
  const leafField = poseidon([BigInt(productHash), BigInt(price)]);
  return poseidon.F.toObject(leafField).toString();
}

export function generateLeafValues(
  poseidon: any,
  products: Product[],
  priceMap: Map<string, number>
): {
  leafValues: string[];
  productHashMap: Map<string, string>;
  leafHashMap: Map<string, string>;
} {
  const leafValues: string[] = [];
  const productHashMap = new Map<string, string>();
  const leafHashMap = new Map<string, string>();

  products.forEach((p) => {
    const currentPrice = priceMap.get(p.id)!;
    const productHash = calculateProductHash(poseidon, p.id);
    const leafHash = calculateLeafHash(poseidon, productHash, currentPrice);

    productHashMap.set(p.id, productHash);
    leafHashMap.set(p.id, leafHash);
    leafValues.push(leafHash);
  });

  // Ensure exactly 16 leaves for 4-level tree
  while (leafValues.length < 16) leafValues.push("0");

  return { leafValues, productHashMap, leafHashMap };
}