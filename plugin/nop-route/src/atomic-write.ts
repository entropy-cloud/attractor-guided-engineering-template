/**
 * atomic-write.ts — minimal atomic write helper, vendor pattern from
 * `plugin/nop-age/src/efficiency/context-profile.ts:91-99` (writer.ts
 * precedent). 12-line tmp + renameSync, no external deps.
 *
 * Used by routing-state-persistence / project-stats-persistence to ensure
 * power-loss safe writes. Read helper is a tolerant JSON parse with
 * fallback (corrupt file → return fallback, log nothing — the caller is
 * the source of truth on what to do with the failure).
 *
 * IO contract: takes an `io` interface so tests can inject in-memory fakes
 * without touching the real filesystem.
 */

import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";

export interface AtomicWriteIo {
  writeFile(path: string, content: string): void;
  rename(src: string, dst: string): void;
  readFile(path: string): string | null;
  mkdirp(path: string): void;
  exists(path: string): boolean;
}

export const defaultFsIo: AtomicWriteIo = {
  writeFile(path, content) {
    writeFileSync(path, content, "utf8");
  },
  rename(src, dst) {
    renameSync(src, dst);
  },
  readFile(path) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
  mkdirp(path) {
    mkdirSync(path, { recursive: true });
  },
  exists(path) {
    return existsSync(path);
  },
};

export interface WriteTextAtomicOptions {
  /** Tmp suffix (default `.atomic-tmp`). */
  suffix?: string;
}

export function writeTextAtomic(
  path: string,
  content: string,
  io: AtomicWriteIo = defaultFsIo,
  options: WriteTextAtomicOptions = {},
): void {
  const dir = dirname(path);
  io.mkdirp(dir);
  const suffix = options.suffix ?? "atomic-tmp";
  const tmp = join(dir, `.${basename(path)}.${suffix}`);
  io.writeFile(tmp, content);
  io.rename(tmp, path);
}

export function readJsonAtomic<T>(
  path: string,
  fallback: T,
  io: AtomicWriteIo = defaultFsIo,
): T {
  const text = io.readFile(path);
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}