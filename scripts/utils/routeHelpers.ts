import { Response } from "express";

export function handleError(res: Response, error: any, action: string, extra?: object) {
  res.status(error.status || 500).json({
    error: `Failed to ${action}`,
    details: error.message,
    ...extra
  });
}

export function withTiming<T>(action: string, fn: () => T): T {
  const start = Date.now();
  console.log(`🔄 ${action}...`);
  try {
    const result = fn();
    console.log(`✅ ${action} completed in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`❌ ${action} failed after ${Date.now() - start}ms:`, error);
    throw error;
  }
}

export async function withTimingAsync<T>(action: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`🔄 ${action}...`);
  try {
    const result = await fn();
    console.log(`✅ ${action} completed in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`❌ ${action} failed after ${Date.now() - start}ms:`, error);
    throw error;
  }
}

export function buildResponse(data: any, meta?: any) {
  return meta ? { ...data, meta: { ...meta, timestamp: Date.now() } } : data;
}

export function checkOracleStatus(oracle: any) {
  if (!oracle.isInitialized) {
    throw new Error("Oracle not initialized");
  }
}