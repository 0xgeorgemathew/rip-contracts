import { Product } from "../types";
import { generateLeafValues } from "./hashUtils";

class ProperMerkleTree {
  private poseidon: any;
  private leaves: string[];
  private levels: string[][];

  constructor(poseidon: any, leaves: string[]) {
    this.poseidon = poseidon;
    this.leaves = leaves;
    this.levels = [];
    this.buildTree();
  }

  private buildTree() {
    let currentLevel = [...this.leaves];
    this.levels.push([...currentLevel]);

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = BigInt(currentLevel[i]);
        const right = i + 1 < currentLevel.length ? BigInt(currentLevel[i + 1]) : BigInt(0);
        const hashField = this.poseidon([left, right]);
        nextLevel.push(this.poseidon.F.toObject(hashField).toString());
      }
      currentLevel = nextLevel;
      this.levels.push([...currentLevel]);
    }
  }

  getRoot(): string {
    return this.levels[this.levels.length - 1][0];
  }

  getProof(leafIndex: number): { siblings: string[]; pathIndices: number[] } {
    const siblings: string[] = [];
    const pathIndices: number[] = [];
    let currentIndex = leafIndex;

    for (let level = 0; level < this.levels.length - 1; level++) {
      const currentLevel = this.levels[level];
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
      const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : "0";

      siblings.push(sibling);
      pathIndices.push(isRightNode ? 1 : 0);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return { siblings, pathIndices };
  }

  getLeaves(): string[] {
    return [...this.leaves];
  }
}

export function buildMerkleTreeFromProducts(
  poseidon: any,
  products: Product[],
  priceMap: Map<string, number>
): {
  tree: ProperMerkleTree;
  productHashMap: Map<string, string>;
  leafHashMap: Map<string, string>;
} {
  const { leafValues, productHashMap, leafHashMap } = generateLeafValues(poseidon, products, priceMap);
  const tree = new ProperMerkleTree(poseidon, leafValues);
  return { tree, productHashMap, leafHashMap };
}

export { ProperMerkleTree };