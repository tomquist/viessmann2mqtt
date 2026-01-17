export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deep equality check for objects.
 * Uses JSON.stringify for simple comparison since data structures are JSON-serializable.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  
  if (a == null || b == null) {
    return false;
  }
  
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // If JSON.stringify fails (circular references, etc.), fall back to strict equality
    return a === b;
  }
}
