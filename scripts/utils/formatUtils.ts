/**
 * Safe formatting utilities for handling BigInt values and large numbers
 */

/**
 * Safely format a BigInt or string value as USD with 6 decimal places
 * @param value BigInt, string, or number representing USDC amount (6 decimals)
 * @returns Formatted USD string (e.g., "$1,199.00")
 */
export function formatUSDC(value: BigInt | string | number): string {
  try {
    const bigIntValue = typeof value === 'bigint' ? value : BigInt(value.toString());
    const dollars = bigIntValue / BigInt(1000000);
    const cents = bigIntValue % BigInt(1000000);

    // Format with commas and proper decimal places
    const dollarsStr = dollars.toLocaleString();
    const centsStr = cents.toString().padStart(6, '0').slice(0, 2);

    return `$${dollarsStr}.${centsStr}`;
  } catch (error) {
    console.warn(`Failed to format USDC value: ${value}, error: ${error}`);
    return `$${value}`;
  }
}

/**
 * Safely convert a BigInt or string to a number for display purposes
 * Only use for values that are guaranteed to be within JavaScript's safe integer range
 * @param value BigInt or string value
 * @returns Number value or throws if unsafe
 */
export function safeToNumber(value: BigInt | string): number {
  const bigIntValue = typeof value === 'bigint' ? value : BigInt(value.toString());

  if (bigIntValue > BigInt(Number.MAX_SAFE_INTEGER) || bigIntValue < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`Value ${bigIntValue} exceeds safe integer range`);
  }

  return Number(bigIntValue);
}

/**
 * Format a percentage with proper decimal places
 * @param numerator
 * @param denominator
 * @returns Formatted percentage string
 */
export function formatPercentage(numerator: BigInt | string | number, denominator: BigInt | string | number): string {
  try {
    const num = typeof numerator === 'bigint' ? numerator : BigInt(numerator.toString());
    const den = typeof denominator === 'bigint' ? denominator : BigInt(denominator.toString());

    if (den === BigInt(0)) return "0%";

    // Calculate percentage with 2 decimal places
    const percentage = (num * BigInt(10000)) / den;
    const percentageNum = Number(percentage) / 100;

    return `${percentageNum.toFixed(2)}%`;
  } catch (error) {
    console.warn(`Failed to format percentage: ${numerator}/${denominator}, error: ${error}`);
    return "0%";
  }
}

/**
 * Validate that a value is within BN254 scalar field
 * @param value Value to validate
 * @returns true if valid, false otherwise
 */
export function isValidFieldElement(value: BigInt | string): boolean {
  try {
    const bigIntValue = typeof value === 'bigint' ? value : BigInt(value.toString());
    const BN254_SCALAR_FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    return bigIntValue >= BigInt(0) && bigIntValue < BN254_SCALAR_FIELD;
  } catch {
    return false;
  }
}

/**
 * Safely log BigInt values for debugging
 * @param label
 * @param value
 */
export function logBigInt(label: string, value: BigInt | string): void {
  try {
    const bigIntValue = typeof value === 'bigint' ? value : BigInt(value.toString());
    console.log(`${label}: ${bigIntValue.toString()}`);
  } catch (error) {
    console.log(`${label}: [INVALID] ${value} (${error})`);
  }
}