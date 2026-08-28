/**
 * model-selector.test.mjs — truth table for pickModel() (multi-plugin-dsh
 * M4-WI12). ≥10 cases: default pick, preferred override, fallback chain
 * ordinals, history-hit skipping, chain-tail exhaustion, empty-history /
 * empty-chain boundaries, token budget clamping, effort passthrough, and
 * the bit-identical double-run determinism assertion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickModel } from "../src/model-selector.ts";

const CFG = {
  defaultModel: "zhipuai-coding-plan/glm-5.2",
  fallbackModels: ["zhipuai-coding-plan/glm-4.6", "zhipuai-coding-plan/glm-4.5"],
};

test("empty history: default model is selected", () => {
  const selection = pickModel({}, [], CFG);
  assert.equal(selection.model, "zhipuai-coding-plan/glm-5.2");
  assert.equal(selection.source, "default");
  assert.equal(selection.fallbackIndex, -1);
  assert.equal(selection.historyExhausted, false);
});

test("preferredModel overrides the default when untainted", () => {
  const selection = pickModel({ preferredModel: "zhipuai-coding-plan/glm-4.6" }, [], CFG);
  assert.equal(selection.model, "zhipuai-coding-plan/glm-4.6");
  assert.equal(selection.source, "preferred");
});

test("preferred === default dedupes to a single chain head with source preferred", () => {
  const selection = pickModel({ preferredModel: CFG.defaultModel }, [], CFG);
  assert.equal(selection.model, CFG.defaultModel);
  assert.equal(selection.source, "preferred");
});

test("tainted default rotates to the 1st fallback", () => {
  const history = [{ model: CFG.defaultModel, outcome: "failure" }];
  const selection = pickModel({}, history, CFG);
  assert.equal(selection.model, "zhipuai-coding-plan/glm-4.6");
  assert.equal(selection.source, "fallback");
  assert.equal(selection.fallbackIndex, 0);
});

test("tainted default + 1st fallback rotates to the 2nd fallback", () => {
  const history = [
    { model: CFG.defaultModel, outcome: "failure" },
    { model: "zhipuai-coding-plan/glm-4.6", outcome: "failure" },
  ];
  const selection = pickModel({}, history, CFG);
  assert.equal(selection.model, "zhipuai-coding-plan/glm-4.5");
  assert.equal(selection.source, "fallback");
  assert.equal(selection.fallbackIndex, 1);
});

test("history awareness keys on the MOST RECENT outcome per model", () => {
  const history = [
    { model: CFG.defaultModel, outcome: "failure" },
    { model: CFG.defaultModel, outcome: "success" },
  ];
  const selection = pickModel({}, history, CFG);
  assert.equal(selection.model, CFG.defaultModel);
  assert.equal(selection.source, "default");
});

test("history entries naming off-chain models are ignored", () => {
  const history = [{ model: "some/other-model", outcome: "failure" }];
  const selection = pickModel({}, history, CFG);
  assert.equal(selection.model, CFG.defaultModel);
  assert.equal(selection.historyExhausted, false);
});

test("tainted preferred falls through to the default", () => {
  const history = [{ model: "zhipuai-coding-plan/glm-4.6", outcome: "failure" }];
  const selection = pickModel({ preferredModel: "zhipuai-coding-plan/glm-4.6" }, history, CFG);
  assert.equal(selection.model, CFG.defaultModel);
  assert.equal(selection.source, "default");
});

test("chain-tail exhaustion: all candidates tainted → chain head with historyExhausted", () => {
  const history = [
    { model: CFG.defaultModel, outcome: "failure" },
    { model: "zhipuai-coding-plan/glm-4.6", outcome: "failure" },
    { model: "zhipuai-coding-plan/glm-4.5", outcome: "failure" },
  ];
  const selection = pickModel({}, history, CFG);
  assert.equal(selection.model, CFG.defaultModel);
  assert.equal(selection.source, "default");
  assert.equal(selection.historyExhausted, true);
});

test("empty fallbackModels boundary: tainted default exhausts immediately", () => {
  const cfg = { defaultModel: CFG.defaultModel };
  const selection = pickModel({}, [{ model: CFG.defaultModel, outcome: "failure" }], cfg);
  assert.equal(selection.model, CFG.defaultModel);
  assert.equal(selection.historyExhausted, true);
});

test("reasoningEffort passthrough: request hint wins, absent → null", () => {
  assert.equal(pickModel({ reasoningEffort: "high" }, [], CFG).reasoningEffort, "high");
  assert.equal(pickModel({ reasoningEffort: "low" }, [], CFG).reasoningEffort, "low");
  assert.equal(pickModel({}, [], CFG).reasoningEffort, null);
});

test("expectedTokenBudget: request tokens → baseTokenBudget → 8192 default", () => {
  assert.equal(pickModel({ expectedTokens: 50000 }, [], CFG).expectedTokenBudget, 50000);
  assert.equal(pickModel({}, [], { ...CFG, baseTokenBudget: 4096 }).expectedTokenBudget, 4096);
  assert.equal(pickModel({}, [], CFG).expectedTokenBudget, 8192);
});

test("expectedTokenBudget clamps to maxTokenBudget", () => {
  const cfg = { ...CFG, maxTokenBudget: 32768 };
  assert.equal(pickModel({ expectedTokens: 50000 }, [], cfg).expectedTokenBudget, 32768);
  assert.equal(pickModel({ expectedTokens: 1000 }, [], cfg).expectedTokenBudget, 1000);
});

test("bit-identical double run over the selection face", () => {
  const cases = [
    () => pickModel({}, [], CFG),
    () => pickModel({ preferredModel: "zhipuai-coding-plan/glm-4.6" }, [], CFG),
    () => pickModel({ expectedTokens: 50000, reasoningEffort: "high" }, [
      { model: CFG.defaultModel, outcome: "failure" },
    ], CFG),
    () => pickModel({}, [
      { model: CFG.defaultModel, outcome: "failure" },
      { model: "zhipuai-coding-plan/glm-4.6", outcome: "failure" },
      { model: "zhipuai-coding-plan/glm-4.5", outcome: "failure" },
    ], CFG),
    () => pickModel({}, [{ model: CFG.defaultModel, outcome: "failure" }], { defaultModel: CFG.defaultModel }),
  ];
  for (const run of cases) {
    assert.deepEqual(run(), run(), "double run diverged");
  }
});
