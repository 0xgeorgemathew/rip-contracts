export interface OraclePrice {
  id: string;
  name: string;
  currentPrice: number;
  basePrice: number;
  change: number;
}

export interface OraclePricesResponse {
  prices: OraclePrice[];
  merkleRoot: string;
  timestamp: number;
}

export interface OracleMerkleProof {
  leaf: string;
  currentPrice: number;
  proof: Array<{ position: "left" | "right"; data: string }>;
  siblings: string[];
  pathIndices: number[];
  root: string;
  productName: string;
  leafBigInt: string;
  productHash: string;
  productId: string;
}

export class OracleClient {
  constructor(private baseUrl = "http://localhost:3001") {}

  async checkConnection(): Promise<boolean> {
    try {
      const status = await this.fetchJson("/api/debug/status");
      return status?.oracle?.initialized === true;
    } catch {
      return false;
    }
  }

  private async fetchJson(endpoint: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(`HTTP ${response.status}: ${error.error || response.statusText}`);
    }
    return response.json();
  }

  async getCurrentPrices(): Promise<OraclePricesResponse> {
    return this.fetchJson("/api/prices");
  }

  async getMerkleProof(productId: string): Promise<OracleMerkleProof> {
    const proof = await this.fetchJson(`/api/merkle-proof/${productId}`);
    this.validateMerkleProof(proof);
    return proof;
  }

  async getMerkleRoot(): Promise<string> {
    const data = await this.fetchJson("/api/merkle-root");
    return data.root;
  }

  async findProductPrice(productId: string): Promise<OraclePrice | null> {
    const { prices } = await this.getCurrentPrices();
    return prices.find(p => p.id.toLowerCase() === productId.toLowerCase()) || null;
  }

  async checkPriceEligibility(productId: string, originalPrice: number) {
    const product = await this.findProductPrice(productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    const { currentPrice } = product;
    const priceDropAmount = originalPrice - currentPrice;
    const priceDropPercentage = Math.round((priceDropAmount / originalPrice) * 10000) / 100;

    return {
      eligible: currentPrice < originalPrice,
      currentPrice,
      priceDropAmount,
      priceDropPercentage
    };
  }

  private validateMerkleProof(proof: any): void {
    const required = ["leaf", "currentPrice", "siblings", "pathIndices", "root", "productId", "productHash"];
    const missing = required.filter(field => !(field in proof));
    if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);

    if (!Array.isArray(proof.siblings) || proof.siblings.length !== 4) {
      throw new Error(`Siblings must be array[4], got ${proof.siblings?.length}`);
    }
    if (!Array.isArray(proof.pathIndices) || proof.pathIndices.length !== 4) {
      throw new Error(`PathIndices must be array[4], got ${proof.pathIndices?.length}`);
    }

    proof.pathIndices.forEach((idx: number, i: number) => {
      if (idx !== 0 && idx !== 1) throw new Error(`PathIndex[${i}] must be 0/1, got ${idx}`);
    });

    proof.siblings.forEach((sibling: string, i: number) => {
      try {
        BigInt(sibling);
      } catch {
        throw new Error(`Invalid sibling[${i}]: ${sibling}`);
      }
    });
  }

  async getDebugStatus(): Promise<any> {
    try {
      return await this.fetchJson("/api/debug/status");
    } catch {
      return null;
    }
  }

  async getDetailedProofInfo(productId: string): Promise<any> {
    try {
      return await this.fetchJson(`/api/debug/proof-info/${productId}`);
    } catch {
      return null;
    }
  }

  async extractProductId(policyData: any): Promise<string> {
    const productHash = policyData.purchaseDetails.productHash;
    const { prices } = await this.getCurrentPrices();

    for (const product of prices) {
      try {
        const proof = await this.getMerkleProof(product.id);
        if (proof.productHash === productHash) {
          console.log(`✅ Matched hash ${productHash.slice(0, 10)}... to ${product.id}`);
          return product.id;
        }
      } catch {
        continue;
      }
    }

    throw new Error(`No product found matching hash ${productHash}`);
  }
}
