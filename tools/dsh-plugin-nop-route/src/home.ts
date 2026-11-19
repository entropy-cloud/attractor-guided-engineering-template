/**
 * home.ts — resolve the nop platform home directory for persistent state.
 * Mirrors `@deepseek-ai/dsh-home-paths` `resolveDshHome` pattern.
 *
 * Lookup order:
 *   1. `$NOP_HOME` (if set and non-empty)
 *   2. `~/.nop/` (default)
 *
 * Used by state-persistence / project-stats to anchor paths.
 */

import { homedir } from "node:os";
import { join } from "node:path";

export const resolveNopHome = (env: Record<string, string | undefined> = process.env): string => {
  const fromEnv = env["NOP_HOME"];
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return join(homedir(), ".nop");
};

export const resolveDshDir = (env: Record<string, string | undefined> = process.env): string =>
  join(resolveNopHome(env), "dsh");