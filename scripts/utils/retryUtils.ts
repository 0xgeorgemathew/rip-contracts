export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 3000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      console.error(`   ❌ Attempt ${attempt} failed:`, error.message);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Should never reach here");
}