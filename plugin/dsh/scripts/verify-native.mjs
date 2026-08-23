#!/usr/bin/env node
/**
 * verify-native.mjs — L3 local-script gate (dsh-plugin M2-WI9, plan
 * docs/plans/dsh-plugin/2026-08-23-1621-1-l3-host-harness-sdk-server.md
 * Phase 3; R3 §5 CI posture).
 *
 * env-gated, NEVER CI-blocking (verify-age.sh / age-ci.yml do not invoke it):
 *   DSH_VERIFY_NATIVE unset/≠1  → explicit skip notice, exit 0
 *   DSH_VERIFY_NATIVE=1        → live run: DEEPSEEK_API_KEY required
 *                                 (fail-fast with a precise message when
 *                                 missing); DEEPSEEK_BASE_URL optional
 *                                 (public default otherwise)
 *   DSH_VERIFY_NATIVE=1 --keyless / no key:
 *   --keyless                   → local stub endpoint run (official
 *                                 keyless-smoke.e2e.ts precedent): full
 *                                 spawn/boot/protocol path, zero credentials,
 *                                 zero external network; explicit invocation
 *                                 needs no master flag — the strict env gate
 *                                 belongs to the credential path
 *
 * npm wiring: `npm run verify:native` / `npm run verify:native:keyless`
 * (plugin/dsh/package.json). All further args pass through to
 * scripts/host-harness.mjs (--dry / --scenario / --timeout-ms / --keep).
 */
import { main } from "./host-harness.mjs";

const args = process.argv.slice(2);
const keyless = args.includes("--keyless");

if (!keyless && process.env.DSH_VERIFY_NATIVE !== "1") {
  console.log("verify:native: skipped (DSH_VERIFY_NATIVE is not \"1\").");
  console.log("  live model run:  DSH_VERIFY_NATIVE=1 DEEPSEEK_API_KEY=… npm run verify:native");
  console.log("  credential-free: npm run verify:native:keyless   (local stub endpoint)");
  process.exit(0);
}

if (!keyless && (typeof process.env.DEEPSEEK_API_KEY !== "string" || process.env.DEEPSEEK_API_KEY === "")) {
  console.error("verify:native: DSH_VERIFY_NATIVE=1 but DEEPSEEK_API_KEY is missing — the live-model gate refuses to run without credentials.");
  console.error("  set DEEPSEEK_API_KEY (and optionally DEEPSEEK_BASE_URL), or use the credential-free keyless gate:");
  console.error("  npm run verify:native:keyless");
  process.exit(1);
}

process.exit(await main(args));
