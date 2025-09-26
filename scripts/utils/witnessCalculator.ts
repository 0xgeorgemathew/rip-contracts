import * as path from "path";
import { formatUSDC, logBigInt } from "./formatUtils";

export interface CircuitInputs {
  // Private inputs (not revealed on-chain)
  orderHash: string;
  invoicePrice: string;
  invoiceDate: number;
  productHash: string;
  salt: string;
  selectedTier: number;
  currentPrice: string;
  leafHash: string;
  merkleProof: string[];
  leafIndex: number[];

  // Public inputs (visible on-chain)
  commitment: string;
  merkleRoot: string;
  policyStartDate: number;
  paidPremium: string;
}

export class WitnessCalculator {
  private wasmPath: string;

  constructor() {
    this.wasmPath = path.join(__dirname, "../../circuits/build/priceProtection_js/priceProtection.wasm");
  }

  validateInputs(inputs: CircuitInputs): void {
    // Validate required fields exist
    const requiredFields = [
      'orderHash', 'invoicePrice', 'invoiceDate', 'productHash',
      'salt', 'selectedTier', 'currentPrice', 'leafHash',
      'merkleProof', 'leafIndex', 'commitment', 'merkleRoot',
      'policyStartDate', 'paidPremium'
    ];

    for (const field of requiredFields) {
      if (!(field in inputs)) {
        throw new Error(`Missing required circuit input: ${field}`);
      }
    }

    // Validate array lengths
    if (!Array.isArray(inputs.merkleProof) || inputs.merkleProof.length !== 4) {
      throw new Error(`merkleProof must be array of length 4, got ${inputs.merkleProof?.length}`);
    }

    if (!Array.isArray(inputs.leafIndex) || inputs.leafIndex.length !== 4) {
      throw new Error(`leafIndex must be array of length 4, got ${inputs.leafIndex?.length}`);
    }

    // Validate leaf indices are binary
    for (let i = 0; i < inputs.leafIndex.length; i++) {
      if (inputs.leafIndex[i] !== 0 && inputs.leafIndex[i] !== 1) {
        throw new Error(`leafIndex[${i}] must be 0 or 1, got ${inputs.leafIndex[i]}`);
      }
    }

    // Validate numeric fields can be converted to BigInt
    const numericFields = ['invoicePrice', 'currentPrice', 'commitment', 'merkleRoot', 'paidPremium'];
    for (const field of numericFields) {
      try {
        BigInt(inputs[field as keyof CircuitInputs] as string);
      } catch (error) {
        throw new Error(`Invalid numeric value for ${field}: ${inputs[field as keyof CircuitInputs]}`);
      }
    }

    console.log("✅ Circuit inputs validation passed");
  }

  async calculateWitness(inputs: CircuitInputs): Promise<any> {
    try {
      console.log("📊 Calculating witness with inputs:");
      console.log(`  Invoice Price: ${formatUSDC(inputs.invoicePrice)}`);
      console.log(`  Current Price: ${formatUSDC(inputs.currentPrice)}`);
      console.log(`  Merkle Proof Length: ${inputs.merkleProof.length}`);

      // Use snarkjs for witness calculation
      const snarkjs = await import("snarkjs");
      const fs = await import("fs/promises");

      // Check if WASM file exists
      try {
        await fs.access(this.wasmPath);
      } catch {
        throw new Error(`Circuit WASM file not found at ${this.wasmPath}. Run 'npm run compile' in circuits directory.`);
      }

      // Calculate witness using snarkjs - use witness generator
      const witnessCalculatorPath = path.join(__dirname, "../../circuits/build/priceProtection_js/witness_calculator.js");

      // Read WASM file as buffer
      const wasmBuffer = await fs.readFile(this.wasmPath);

      // Import the witness calculator
      const WitnessCalculatorBuilder = await import(witnessCalculatorPath);
      const witnessCalculator = await WitnessCalculatorBuilder.default(wasmBuffer);

      // Calculate witness in binary format for snarkjs
      const witnessBuffer = await witnessCalculator.calculateWTNSBin(inputs, 0);

      console.log(`✅ Witness calculated successfully (${witnessBuffer.length} bytes)`);

      // Return the binary witness buffer that snarkjs expects
      return witnessBuffer;

    } catch (error) {
      console.error("❌ Witness calculation failed:", error);
      throw new Error(`Witness calculation failed: ${error}`);
    }
  }

  // Alternative method using WebAssembly directly
  async calculateWitnessDirect(inputs: CircuitInputs): Promise<any> {
    try {
      const fs = await import("fs/promises");

      // Check if WASM file exists
      try {
        await fs.access(this.wasmPath);
      } catch {
        throw new Error(`Circuit WASM file not found at ${this.wasmPath}. Run 'npm run compile' in circuits directory.`);
      }

      // Try to use the main method first
      console.log("🔄 Falling back to main witness calculation method...");
      return await this.calculateWitness(inputs);

    } catch (error) {
      throw new Error(`Direct witness calculation failed: ${error}`);
    }
  }
}