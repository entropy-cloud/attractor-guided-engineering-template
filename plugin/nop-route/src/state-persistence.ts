/**
 * state-persistence.ts — account-level circuit-breaker state persistence
 * (multi-plugin-dsh M5-WI3; design owner
 * docs/design/dsh-routing-with-failover.md §9).
 *
 * Storage: `~/.nop/dsh/routing-state.json` with shape:
 *   { models: { "<model>": { state, until, consecutiveFailures, cooldownMs,
 *                             lastErrorClass, lastErrorAt } } }
 *
 * Pure-function contract: persistence layer holds the IO. The circuit-breaker
 * stays pure (zero I/O); the service layer calls schedulePersist() on every
 * recordFailure/recordSuccess and flush() at unmount.
 */

import { join } from "node:path";
import type { AtomicWriteIo } from "./atomic-write.ts";
import { writeTextAtomic, readJsonAtomic } from "./atomic-write.ts";
import { resolveDshDir } from "./home.ts";
import type { CircuitBreaker } from "./circuit-breaker.ts";

export interface CircuitPersistenceSnapshot {
  models: Record<string, {
    state: "closed" | "open" | "half-open";
    until: number;
    consecutiveFailures: number;
    cooldownMs: number;
    lastErrorClass: string | null;
    lastErrorAt: number;
  }>;
}

export interface CircuitPersistence {
  load(breaker: CircuitBreaker): void;
  flush(breaker: CircuitBreaker): void;
}

const filePath = (dshDir: string): string => join(dshDir, "routing-state.json");

export const createCircuitPersistence = (
  dshDir: string = resolveDshDir(),
  io: AtomicWriteIo,
): CircuitPersistence => {
  const path = filePath(dshDir);
  return {
    load(breaker) {
      const snap = readJsonAtomic<CircuitPersistenceSnapshot>(
        path,
        { models: {} },
        io,
      );
      const importObj: Record<string, any> = {};
      for (const [model, s] of Object.entries(snap.models)) {
        importObj[model] = { ...s };
      }
      breaker.importState(importObj);
    },

    flush(breaker) {
      const snap: CircuitPersistenceSnapshot = {
        models: breaker.exportState(0) as any,
      };
      writeTextAtomic(path, JSON.stringify(snap), io);
    },
  };
};