/**
 * model-selector.ts — pure model selection over the configured chain and
 * the call history (multi-plugin-dsh M4-WI12; design owner
 * docs/design/multi-plugin-dsh-architecture.md §nop-route Plugin).
 *
 * Selection rules (pinned by test/model-selector.test.mjs):
 *   - Candidate chain = [request.preferredModel?] → config.defaultModel →
 *     config.fallbackModels[], deduplicated preserving first occurrence.
 *   - History awareness: a model is "tainted" when its MOST RECENT entry in
 *     `history` (later entries = more recent) is a failure; earlier
 *     failures followed by a success do not taint. The first untainted
 *     candidate wins. History entries naming models outside the chain are
 *     ignored.
 *   - Chain-tail exhaustion: when every candidate is tainted, the chain
 *     head is returned with historyExhausted = true (retry the primary
 *     rather than inventing a model outside the configured chain).
 *   - reasoningEffort passes through from the request hint (null when
 *     absent). expectedTokenBudget = request.expectedTokens ??
 *     config.baseTokenBudget ?? 8192, clamped to config.maxTokenBudget.
 *
 * Determinism contract: zero wall clock, zero random, zero I/O; all history
 * information enters through the `history` parameter.
 */

export type ReasoningEffort = "low" | "medium" | "high";

export interface ModelRequest {
  expectedTokens?: number;
  reasoningEffort?: ReasoningEffort;
  preferredModel?: string;
}

export interface ModelHistoryEntry {
  model: string;
  outcome: "success" | "failure";
}

export interface ModelSelectionConfig {
  defaultModel: string;
  fallbackModels?: string[];
  baseTokenBudget?: number;
  maxTokenBudget?: number;
}

export interface ModelSelection {
  model: string;
  reasoningEffort: ReasoningEffort | null;
  expectedTokenBudget: number;
  source: "preferred" | "default" | "fallback";
  fallbackIndex: number;
  historyExhausted: boolean;
}

const DEFAULT_TOKEN_BUDGET = 8192;

interface ChainSlot {
  readonly model: string;
  readonly source: "preferred" | "default" | "fallback";
  readonly fallbackIndex: number;
}

const buildChain = (request: ModelRequest, config: ModelSelectionConfig): ChainSlot[] => {
  const slots: ChainSlot[] = [];
  if (typeof request.preferredModel === "string" && request.preferredModel.length > 0) {
    slots.push({ model: request.preferredModel, source: "preferred", fallbackIndex: -1 });
  }
  slots.push({ model: config.defaultModel, source: "default", fallbackIndex: -1 });
  const fallbacks = Array.isArray(config.fallbackModels) ? config.fallbackModels : [];
  for (const [index, model] of fallbacks.entries()) {
    if (typeof model === "string" && model.length > 0) {
      slots.push({ model, source: "fallback", fallbackIndex: index });
    }
  }
  const seen = new Set<string>();
  return slots.filter((slot) => {
    if (seen.has(slot.model)) return false;
    seen.add(slot.model);
    return true;
  });
};

const taintedModels = (history: ModelHistoryEntry[]): Set<string> => {
  const lastOutcome = new Map<string, "success" | "failure">();
  for (const entry of history) {
    lastOutcome.set(entry.model, entry.outcome);
  }
  const tainted = new Set<string>();
  for (const [model, outcome] of lastOutcome) {
    if (outcome === "failure") tainted.add(model);
  }
  return tainted;
};

export function pickModel(
  request: ModelRequest,
  history: ModelHistoryEntry[],
  config: ModelSelectionConfig,
): ModelSelection {
  const chain = buildChain(request, config);
  const tainted = taintedModels(Array.isArray(history) ? history : []);

  let chosen = chain.find((slot) => !tainted.has(slot.model));
  let historyExhausted = false;
  if (chosen === undefined) {
    chosen = chain[0];
    historyExhausted = true;
  }

  const requested = request.expectedTokens ?? config.baseTokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const budget =
    typeof config.maxTokenBudget === "number"
      ? Math.min(requested, config.maxTokenBudget)
      : requested;

  return {
    model: chosen.model,
    reasoningEffort: request.reasoningEffort ?? null,
    expectedTokenBudget: budget,
    source: chosen.source,
    fallbackIndex: chosen.fallbackIndex,
    historyExhausted,
  };
}
