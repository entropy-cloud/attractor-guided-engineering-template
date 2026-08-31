/**
 * project-stats.ts — per-project, per-model call statistics with
 * debounced atomic-write persistence (multi-plugin-dsh M5-WI3; design
 * owner docs/design/dsh-routing-with-failover.md §11.3).
 *
 * Storage shape: `~/.nop/dsh/routing-stats/<sha256(projectRoot).slice(0,16)>.json`
 *   { "<projectRoot>": { firstSeenAt, totalCalls, totalSuccess, totalFailures,
 *                        totalDurationMs, totalTokensInput, totalTokensOutput,
 *                        byModel: { "<model>": { calls, success, failures,
 *                                                 durationMs, tokensInput,
 *                                                 tokensOutput, firstCallAt,
 *                                                 lastCallAt } } } }
 *
 * "global" bucket: when a caller doesn't supply projectRoot, the stats
 * land under the `"__global__"` key.
 *
 * Determinism contract: zero wall clock, zero random; all time enters
 * through the `now` parameter passed to recordCall / recordSuccess /
 * recordFailure. Persistence is debounced by the service layer (not here).
 */

import { createHash } from "node:crypto";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import type { AtomicWriteIo } from "./atomic-write.ts";
import { defaultFsIo, writeTextAtomic, readJsonAtomic } from "./atomic-write.ts";

export interface ProjectModelStats {
  calls: number;
  success: number;
  failures: number;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  firstCallAt: number;
  lastCallAt: number;
  lastErrorClass: string | null;
}

export interface ProjectAggregate {
  firstSeenAt: number;
  totalCalls: number;
  totalSuccess: number;
  totalFailures: number;
  totalDurationMs: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  byModel: Record<string, ProjectModelStats>;
}

export type ProjectStatsMap = Record<string, ProjectAggregate>;

const GLOBAL_KEY = "__global__";
const FILE_PREFIX = "stats-";

const hashProjectRoot = (projectRoot: string): string => {
  if (projectRoot === GLOBAL_KEY) return GLOBAL_KEY;
  return createHash("sha256").update(projectRoot).digest("hex").slice(0, 16);
};

const ensureProject = (map: ProjectStatsMap, projectRoot: string, now: number): ProjectAggregate => {
  let entry = map[projectRoot];
  if (entry === undefined) {
    entry = {
      firstSeenAt: now,
      totalCalls: 0,
      totalSuccess: 0,
      totalFailures: 0,
      totalDurationMs: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      byModel: {},
    };
    map[projectRoot] = entry;
  }
  return entry;
};

const ensureModel = (project: ProjectAggregate, model: string, now: number): ProjectModelStats => {
  let entry = project.byModel[model];
  if (entry === undefined) {
    entry = {
      calls: 0,
      success: 0,
      failures: 0,
      durationMs: 0,
      tokensInput: 0,
      tokensOutput: 0,
      firstCallAt: now,
      lastCallAt: now,
      lastErrorClass: null,
    };
    project.byModel[model] = entry;
  }
  return entry;
};

export interface ProjectStatsPersistenceIo extends AtomicWriteIo {
  listFiles(dir: string): string[];
}

export const defaultFsPersistenceIo: ProjectStatsPersistenceIo = {
  ...defaultFsIo,
  listFiles(dir) {
    try {
      return readdirSync(dir).filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith(".json"));
    } catch {
      return [];
    }
  },
};

export interface ProjectStatsPersistence {
  loadAll(): ProjectStatsMap;
  flush(map: ProjectStatsMap): void;
}

export const createFsProjectStatsPersistence = (
  statsDir: string,
  io: ProjectStatsPersistenceIo = defaultFsPersistenceIo,
): ProjectStatsPersistence => {
  const pathForHash = (hash: string): string =>
    join(statsDir, hash === GLOBAL_KEY ? `${FILE_PREFIX}${GLOBAL_KEY}.json` : `${FILE_PREFIX}${hash}.json`);

  const projectToHash = new Map<string, string>();

  return {
    loadAll() {
      const map: ProjectStatsMap = {};
      if (!io.exists(statsDir)) return map;
      const files = io.listFiles(statsDir);
      for (const f of files) {
        const m = f.match(/^stats-(.+)\.json$/);
        if (m === null) continue;
        const hash = m[1]!;
        const loaded = readJsonAtomic<Record<string, ProjectAggregate>>(pathForHash(hash), {}, io);
        for (const [projectRoot, agg] of Object.entries(loaded)) {
          map[projectRoot] = agg;
          projectToHash.set(projectRoot, hash);
        }
      }
      return map;
    },

    flush(map) {
      const grouped = new Map<string, Record<string, ProjectAggregate>>();
      for (const [projectRoot, agg] of Object.entries(map)) {
        let hash = projectToHash.get(projectRoot);
        if (hash === undefined) {
          hash = hashProjectRoot(projectRoot);
          projectToHash.set(projectRoot, hash);
        }
        let bucket = grouped.get(hash);
        if (bucket === undefined) {
          bucket = {};
          grouped.set(hash, bucket);
        }
        bucket[projectRoot] = agg;
      }
      for (const [hash, bucket] of grouped) {
        writeTextAtomic(pathForHash(hash), JSON.stringify(bucket), io);
      }
    },
  };
};

export const GLOBAL_PROJECT_KEY = GLOBAL_KEY;