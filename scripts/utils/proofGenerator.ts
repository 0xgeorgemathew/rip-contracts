import * as path from "path";
import { WitnessCalculator, CircuitInputs } from "./witnessCalculator";
import { formatUSDC } from "./formatUtils";

export interface SolidityProof {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
}

export interface FullProof {
  proof: SolidityProof;
  publicSignals: string[];
}

const BN254_SCALAR_FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

export class ProofGenerator {
  private witnessCalculator = new WitnessCalculator();
  private zkeyPath = path.join(__dirname, "../../circuits/priceProtection_final.zkey");

  async generateProof(inputs: CircuitInputs): Promise<FullProof> {
    this.witnessCalculator.validateInputs(inputs);

    try {
      console.log("📊 Calculating witness...");
      const witness = await this.witnessCalculator.calculateWitness(inputs);
      console.log("✅ Witness calculated");

      console.log("🔒 Generating ZK proof...");
      const snarkjs = await import("snarkjs");
      const { proof, publicSignals } = await snarkjs.groth16.prove(this.zkeyPath, witness);
      console.log("✅ ZK proof generated");

      return {
        proof: this.formatProofForSolidity(proof),
        publicSignals: publicSignals.map((s: any) => s.toString())
      };
    } catch (error) {
      throw new Error(`Proof generation failed: ${error}`);
    }
  }

  private formatProofForSolidity(proof: any): SolidityProof {
    return {
      a: [proof.pi_a[0], proof.pi_a[1]],
      b: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
      c: [proof.pi_c[0], proof.pi_c[1]]
    };
  }

  validatePublicSignals(publicSignals: string[]): void {
    if (publicSignals.length !== 4) {
      throw new Error(`Expected 4 public signals, got ${publicSignals.length}`);
    }

    const [validClaim, validPremium, validPayout, payoutAmount] = publicSignals.map(s => BigInt(s));
    const signals = { validClaim, validPremium, validPayout };

    Object.entries(signals).forEach(([name, value]) => {
      if (value !== 0n && value !== 1n) {
        throw new Error(`${name} must be 0 or 1, got ${value}`);
      }
    });

    if (validClaim === 1n && payoutAmount <= 0n) {
      throw new Error(`Payout must be positive for valid claims`);
    }

    console.log("📋 Public signals:");
    console.log(`  Claim: ${validClaim === 1n ? "✅" : "❌"} | Premium: ${validPremium === 1n ? "✅" : "❌"} | Payout: ${validPayout === 1n ? "✅" : "❌"} | Amount: ${formatUSDC(payoutAmount)}`);
  }

  async verifyProof(proof: SolidityProof, publicSignals: string[]): Promise<boolean> {
    try {
      const [snarkjs, fs] = await Promise.all([
        import("snarkjs"),
        import("fs/promises")
      ]);

      const vKey = JSON.parse(
        await fs.readFile(path.join(__dirname, "../../circuits/priceProtection_verification_key.json"), "utf-8")
      );

      const snarkjsProof = {
        pi_a: [proof.a[0], proof.a[1], "1"],
        pi_b: [[proof.b[0][1], proof.b[0][0]], [proof.b[1][1], proof.b[1][0]], ["1", "0"]],
        pi_c: [proof.c[0], proof.c[1], "1"],
        protocol: "groth16",
        curve: "bn128"
      };

      return await snarkjs.groth16.verify(vKey, publicSignals, snarkjsProof);
    } catch (error) {
      console.warn("⚠️ Local verification failed (non-critical):", error);
      return false;
    }
  }

  static createCircuitInputs(
    policyData: any,
    oracleProof: any,
    merkleRoot: string
  ): CircuitInputs {
    this.validateOracleProof(oracleProof);

    const inputs = {
      // Private inputs
      orderHash: policyData.purchaseDetails.orderHash,
      invoicePrice: policyData.purchaseDetails.invoicePrice,
      invoiceDate: policyData.purchaseDetails.invoiceDate,
      productHash: policyData.purchaseDetails.productHash,
      salt: policyData.purchaseDetails.salt,
      selectedTier: policyData.purchaseDetails.selectedTier,
      currentPrice: oracleProof.currentPrice.toString(),
      leafHash: oracleProof.leafBigInt || oracleProof.leaf,
      merkleProof: oracleProof.siblings,
      leafIndex: oracleProof.pathIndices,

      // Public inputs
      commitment: policyData.secretCommitment,
      merkleRoot: merkleRoot,
      policyStartDate: policyData.policyPurchaseDate,
      paidPremium: policyData.premium
    };

    console.log(`📝 Circuit inputs created | Root: ${merkleRoot.slice(0, 10)}...`);
    return inputs;
  }

  private static validateOracleProof(oracleProof: any): void {
    if (oracleProof.siblings?.length !== 4) {
      throw new Error(`Siblings must be 4 elements, got ${oracleProof.siblings?.length}`);
    }
    if (oracleProof.pathIndices?.length !== 4) {
      throw new Error(`PathIndices must be 4 elements, got ${oracleProof.pathIndices?.length}`);
    }

    oracleProof.siblings.forEach((sibling: string, i: number) => {
      const value = BigInt(sibling);
      if (value >= BN254_SCALAR_FIELD) {
        throw new Error(`Sibling[${i}] exceeds field limit`);
      }
    });

    oracleProof.pathIndices.forEach((idx: number, i: number) => {
      if (idx !== 0 && idx !== 1) {
        throw new Error(`PathIndex[${i}] must be 0 or 1, got ${idx}`);
      }
    });

    const leaf = BigInt(oracleProof.leafBigInt || oracleProof.leaf);
    if (leaf >= BN254_SCALAR_FIELD) {
      throw new Error(`Leaf hash exceeds field limit`);
    }

    console.log("✅ Oracle proof validated");
  }
}