import * as fs from "fs/promises";
import * as path from "path";

/**
 * Load contract ABI from compiled contract artifacts
 */
export async function loadContractABI(contractName: string): Promise<any[]> {
  // Try original path first (for local development)
  let abiPath = path.join(__dirname, `../../contracts/out/${contractName}.sol/${contractName}.json`);

  try {
    const contractData = await fs.readFile(abiPath, "utf-8");
    const parsed = JSON.parse(contractData);
    return parsed.abi;
  } catch {
    try {
      // Fallback to local contracts folder (for Railway)
      abiPath = path.join(__dirname, `../contracts/out/${contractName}.sol/${contractName}.json`);
      const contractData = await fs.readFile(abiPath, "utf-8");
      const parsed = JSON.parse(contractData);
      return parsed.abi;
    } catch (error) {
      throw new Error(`Failed to load ABI for ${contractName}: ${error}`);
    }
  }
}

/**
 * Load deployment addresses from deployment.json
 */
export async function loadDeploymentAddresses(): Promise<{
  vault?: string;
  token?: string;
  verifier?: string;
  deployer?: string;
  timestamp?: string;
}> {
  try {
    // Try original path first (for local development)
    const deploymentPath = path.join(__dirname, "../../contracts/deployment.json");
    const deploymentData = await fs.readFile(deploymentPath, "utf-8");
    return JSON.parse(deploymentData);
  } catch {
    try {
      // Fallback to local deployment.json (for Railway)
      const deploymentPath = path.join(__dirname, "../deployment.json");
      const deploymentData = await fs.readFile(deploymentPath, "utf-8");
      return JSON.parse(deploymentData);
    } catch (error) {
      console.log("Could not load deployment.json, using environment variables");
      return {
        vault: process.env.CONTRACT_ADDRESS,
        verifier: process.env.VERIFIER_ADDRESS,
      };
    }
  }
}

/**
 * Get contract instance with automatically loaded ABI
 */
export async function getContractInstance(contractName: string, address: string, signerOrProvider: any): Promise<any> {
  const { ethers } = await import("ethers");
  const abi = await loadContractABI(contractName);
  return new ethers.Contract(address, abi, signerOrProvider);
}
