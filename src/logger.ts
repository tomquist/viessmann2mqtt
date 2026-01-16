export type Logger = Pick<typeof console, "log" | "warn" | "error">;

export function consoleLogger(verbose: boolean): Logger {
  return {
    log(...params: unknown[]) {
      if (verbose) {
        console.log(`[${new Date().toISOString()}]`, ...params);
      }
    },
    warn(...params: unknown[]) {
      if (verbose) {
        console.warn(`[${new Date().toISOString()}]`, ...params);
      }
    },
    error(...params: unknown[]) {
      console.error(`[${new Date().toISOString()}]`, ...params);
    },
  };
}
