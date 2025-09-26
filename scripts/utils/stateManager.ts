import * as fs from "fs";

export interface TreeData {
  leaves: string[];
  root: string;
  productHashMap: [string, string][];
  leafHashMap: [string, string][];
  currentPrices: [string, number][];
  timestamp: string;
}

export class OracleStateManager {
  constructor(private filePath: string) {}

  save(treeData: TreeData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(treeData, null, 2));
  }

  load(): TreeData | null {
    try {
      if (!fs.existsSync(this.filePath)) return null;
      const data = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (data.tree || !data.leaves || data.leaves.length !== 16) return null;
      return data;
    } catch {
      return null;
    }
  }

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  clear(): void {
    if (this.exists()) fs.unlinkSync(this.filePath);
  }
}