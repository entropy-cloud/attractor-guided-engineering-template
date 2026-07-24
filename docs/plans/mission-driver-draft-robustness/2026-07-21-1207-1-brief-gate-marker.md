# mdr-4 brief gate marker 契约 + 引擎强制

> Plan Status: completed
> Last Reviewed: 2026-07-21
> Source: `docs/backlog/mission-driver-draft-robustness-roadmap.md` WI2
> Related: `tools/mission-driver/design/draft-robustness-design.md` §2.2, §4.2; `2026-07-21-0954-2-cli-draft-desc-validate.md` (WI1, done — 互补关系)
> Mission: mission-driver-draft-robustness
> Work Item: WI2 brief gate marker 契约 + 引擎强制
> Audit: required

## Current Baseline

Live baseline verified against the repo on 2026-07-21:

- `cmdDraftMission` 两段式管线在 `tools/mission-driver/src/main.js:292-453`（`async function cmdDraftMission(desc, opts)` 在 `:292`；WI1 加 `validateDraftDesc` 后**函数起始**下移 ~48 行，但函数体内部行号**不变**——设计文档与 roadmap 沿用旧的 `:244-` 编号已过期，但内部 `:332+` / `:395-400` / `:402-453` 等相对位置仍准确）：Stage 1（brief，`:365-400`；其末段 `:395-400` 是 `console.log(briefResult.text)` → `extractBriefPath` → `writeDraftState({phase:"brief_done"})` → `}`）跑 `mission-brief` agent → `extractBriefPath`（`:160-164`）从输出取 `<BRIEF_FILE>` 路径；Stage 2（draft，`:402-453`）无条件紧随其后跑 `draft-mission` agent 生成 roadmap + mission.json。
- Stage 1 与 Stage 2 之间**没有任何条件分支**——`main.js:400` 闭括号后直接 `// ── Stage 2: draft (roadmap + mission.json) ──` 注释（`:402`），`if (opts.draftJobDir) writeDraftState({ phase: "draft" })`（`:403-405`），`resolveTemplateVars(...)`（`:408-414`），`runner.runAgent("draft-mission", ...)`（`:418-423`）。无论 brief agent 在文本里说什么，Stage 2 都跑。
- `prompts/mission-brief.md` 当前只要求输出 `<BRIEF_FILE>...</BRIEF_FILE>` marker（`:30`）；**没有**任何"是否放行"的结构化 marker。prompt 正文 `:1`（"gates the subsequent roadmap + mission.json generation"）和 `:23`（"it is a gate, not a design document"）只是给 AI 的文字指令，引擎完全不感知。
- `extractBriefPath(resultText)`（`main.js:160-164`）的正则：`/<BRIEF_FILE>\s*([^\s<]+)\s*<\/BRIEF_FILE>/i`；只取路径、不取语义。是 WI2 新增 `extractBriefGate` 的范式参考。
- `--skip-brief` 单段式路径（`main.js:359` `const skipBrief = resolved.skipBrief === true;` → `:365` `if (!skipBrief) { ... Stage 1 ... }`）：跳过 Stage 1，gate 机制不介入，**不在本 plan 范围**（设计文档 §5.3 已声明）。
- WI1 已落地（`2026-07-21-0954-2-cli-draft-desc-validate.md`，completed）：`cmdDraftMission` 入口在 Stage 1 之前 / `main.js:348` running re-affirm 块之前钉了 `validateDraftDesc`，挡住明显垃圾描述。但 WI1 只拦"明显垃圾"（空 / 占位 / 过短），**不**判断"语义是否充分"——这是 WI2 的范围（设计文档 §4.1 末句："剩下的'语义是否充分'交给 brief gate（方案 B）"）。
- WI3 已落地（`2026-07-21-0954-3-draft-path-template-var.md`，completed）：brief / draft prompt 里 `docs/backlog/` 字面量全部走 `{{backlogDir}}` 模板变量；`parseDraftArtifact` 加了 `<MISSION_FILE>` 路径 warn。本 plan 不动 prompt 路径，只在 `mission-brief.md` 末尾追加 gate marker 契约段。
- `writeDraftState(patch)`（`main.js:338-347`）已是 patch 合并（`{ ...prev, ...patch }`）——新字段 `briefGate` / `briefGateReason` 自然继承，**无需改 schema**（设计文档 §4.2.3、framework reuse 表均说明）。
- 测试范式：`test/draft-brief.test.js` 已用 `__setRunnerFactoryForTest`（`main.js:25`）注入 mock runner、用 `makeFakeRunner({ "mission-brief": "...", "draft-mission": "..." })` 录制 `runAgent` 调用次数与 prompt 内容（`draft-brief.test.js:21-33`）。本 plan 沿用此范式覆盖 pass / blocked / null 三分支。
- `cmdDraftMission` 在 `main.js:872` 已 export（`export { cmdDraftMission, parseDraftArtifact };`，WI3 加了 `parseDraftArtifact`；WI1 加 `validateDraftDesc` 后整体下移，设计文档与 roadmap 沿用旧的 `:801` 编号已过期）；本 plan 把 `extractBriefGate` 加入同一 export 表。
- 验证命令（`missions/base.json`）：`pnpm --prefix tools/mission-driver test`（package.json `"test": "node --test test/*.test.js"`）；另 `pnpm --prefix tools/mission-driver run lint:prompts`（`"lint:prompts": "node src/prompt-check.mjs"`）跑 prompt 检查。

**Gap:** brief 的"是否放行"判定只在 prompt 文字层，引擎无条件进 Stage 2——gate 强弱全看 AI 是否听话、不可测、不可回归。`d` 事件里 brief agent 其实判断对了（写了 gate brief 说"信息不足"），但引擎没读，Stage 2 照跑。本 plan 把 gate 从 prompt 文字升级为结构化 `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` marker，引擎据 marker 决定是否进 Stage 2，并把决策写入 draft-state.json。`gate === null`（旧 brief 无 marker）退化为旧行为，向后兼容。

## Goals

- 在 `mission-brief.md` 的 Output 段加 `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` 与 `<BRIEF_GATE_REASON>...</BRIEF_GATE_REASON>` marker 契约，并写明 pass / blocked 判定规则。
- 在 `main.js` 加 `extractBriefGate(resultText)` 纯函数（镜像 `extractBriefPath`），并 export 供测试 import。
- 在 Stage 1 之后、Stage 2 之前加 gate 分支：`gate === "blocked"` → 打印 reason + 指向 brief 文件、`draft-state.status = "blocked"`、`runner.close()` + return（不进 Stage 2，不写 roadmap / mission.json）；`gate === "pass"` → 进 Stage 2（同旧）；`gate === null`（旧 brief 无 marker）→ 退化为旧行为继续 Stage 2（向后兼容）。
- `draft-state.json` 通过 patch 继承 `briefGate` / `briefGateReason` 字段（无论是否 job 模式均在 Stage 1 结束时写入；blocked 状态再补写 `status: "blocked"` + `endedAt`）。
- 不进 Stage 2 时 `process.exitCode` 保持 0（这不是错误，是 gate 正常工作；与 WI1 `validateDraftDesc` 失败的 exit 1 区分）。

## Non-Goals

- 不改 monitor draft-job 前端（新字段 `briefGate` / `briefGateReason` 对旧 UI 透明，UI 升级非阻塞；设计文档 §4.2.3、§5.2 已声明）。
- 不改 `--skip-brief` 单段式路径（设计文档 §5.3：gate 机制不介入）。
- 不改 brief gate 的 AI 判定逻辑本身（那在 prompt 里给规则，由 AI 推导；本 plan 只升级信号通道与引擎响应）。
- 不在引擎里读 brief 文件内容做 grep（设计文档 §6.2 已否决：依赖措辞、脆；结构化 marker 显式、可测、语言无关）。
- 不让 `gate === null` 强制阻塞（设计文档 §4.2.2、§5.3：向后兼容；旧 brief 无 marker 时退化为旧行为）。
- 不在 Stage 1 之前加 gate（那是 WI1 `validateDraftDesc` 的位置；WI2 在 Stage 1 之后，互补不重叠）。
- 不改 `run` / `list` / `analyze` / `check` 等其它子命令。
- 不引入新的 npm 依赖（纯正则 + 字符串处理），保持引擎核心零依赖约束。

## Task Route

- Type: `implementation-only change`（owner doc §4.2 已逐行写明改法：marker 契约、`extractBriefGate` 正则、Stage 1→2 分支、`writeDraftState` patch 字段）。
- Owner Docs: `tools/mission-driver/design/draft-robustness-design.md` §2.2（缺陷 2 根因）、§4.2（方案 B：marker 契约 + 引擎解析与强制 + draft-state 扩展）、§5.2（关键风险：AI 不稳定输出 marker → null 退化）、§5.3（向后兼容三条）。
- Skill Selection Basis: `Skill: none` — gate marker 契约（XML 风格 tag + 正则解析）由设计文档 §4.2.1-4.2.2 直接给出，方法是确定性的字符串规则与既有 `extractBriefPath` 同构，无匹配的可复用 skill。

## Infrastructure And Config Prereqs

No infra prereqs beyond existing baseline. 不引入新 npm 依赖（纯正则 + 字符串处理 + 既有 `writeDraftState` patch 合并），保持引擎核心零依赖约束（CONTEXT.md 关键约束）。

## Execution Plan

### Phase 1 - extractBriefGate 纯函数 + export

Status: completed
Targets: `tools/mission-driver/src/main.js`（紧邻 `extractBriefPath` `:160-164` 新增 `extractBriefGate` 函数 + JSDoc；`:872` export 表加 `extractBriefGate`）
Skill: none

- Item Types: `Add`
- Prereqs: none

- [x] Add: 在 `main.js` 紧邻 `extractBriefPath`（`:160-164` 之后）新增纯函数 `extractBriefGate(resultText)`，**直接采用设计文档 `draft-robustness-design.md` §4.2.2 的实现**（不在 plan 里重复贴代码，Minimum Rule 6）：返回 `{ gate, reason }`，`gate` 取 `pass|blocked` 小写或 `null`，`reason` 取 `<BRIEF_GATE_REASON>` 内文本或 `null`。输入非字符串时返回 `{ gate: null, reason: null }`。
      - 关键不变性（设计文档 §4.2.2）：marker 大小写不敏感（正则 `/i`）；`<BRIEF_GATE>` 内允许前后空白；`<BRIEF_GATE_REASON>` 缺失时 `reason = null`（不抛错）；整个 `<BRIEF_GATE>` tag 缺失时 `gate = null`（向后兼容旧 brief）。
      - Skill: none
- [x] Add: 把 `extractBriefGate` 加入 `main.js` 模块 export 表（`:872`，WI3 已扩为 `export { cmdDraftMission, parseDraftArtifact };`，本 plan 改为 `export { cmdDraftMission, parseDraftArtifact, extractBriefGate };`），供 Phase 4 测试直接 import。注释风格参考现有 export。
      - Skill: none

Exit Criteria:

- [x] `extractBriefGate` 在 `main.js` 中存在并 export；`typeof extractBriefGate === "function"`（测试 import 后断言）。
- [x] 纯函数行为（手动 / 测试覆盖）：`extractBriefGate("<BRIEF_GATE>pass</BRIEF_GATE>")` → `{ gate: "pass", reason: null }`；`extractBriefGate("<BRIEF_GATE>blocked</BRIEF_GATE><BRIEF_GATE_REASON>desc too vague</BRIEF_GATE_REASON>")` → `{ gate: "blocked", reason: "desc too vague" }`；`extractBriefGate("<BRIEF_FILE>...</BRIEF_FILE>")`（无 gate marker）→ `{ gate: null, reason: null }`；`extractBriefGate(undefined)` → `{ gate: null, reason: null }`；大小写不敏感（`<BRIEF_GATE>PASS</BRIEF_GATE>` → `gate: "pass"`）。
- [x] 现有 `extractBriefPath` / `validateDraftDesc` / `parseDraftArtifact` 行为不变（Phase 1 只新增、不改既有函数）。
- [x] `docs/logs/` 更新（按 AGENTS.md）。

### Phase 2 - mission-brief.md marker 契约扩展

Status: completed
Targets: `tools/mission-driver/prompts/mission-brief.md`（Output 段 `:25-31` 追加 `<BRIEF_GATE>` + `<BRIEF_GATE_REASON>` marker 要求 + pass/blocked 判定规则）
Skill: none

- Item Types: `Add`
- Prereqs: none（Phase 1 的 `extractBriefGate` 与 Phase 2 的 prompt 契约相互独立：Phase 1 解析任何含 marker 的文本，Phase 2 让 AI 输出 marker；测试用 mock runner 直接注入 marker 文本，不依赖 Phase 2）

- [x] Add: 在 `prompts/mission-brief.md` 的 `## Output` 段（当前 `:25-31`，要求 AI 输出 `<BRIEF_FILE>...`）追加 `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` 与 `<BRIEF_GATE_REASON>...</BRIEF_GATE_REASON>` marker 要求。参考设计文档 §4.2.1 的契约：
      ```
      <BRIEF_FILE>{{backlogDir}}/<slug>-brief.md</BRIEF_FILE>
      <BRIEF_GATE>pass|blocked</BRIEF_GATE>
      <BRIEF_GATE_REASON>一句话说明（blocked 时必填、pass 时可空 tag）</BRIEF_GATE_REASON>
      ```
      - Skill: none
- [x] Add: 在 prompt 正文（紧邻 `## Output` 之前或 `## Task` 末尾）加 pass / blocked 判定规则段（设计文档 §4.2.1）：
      - `pass`：描述足以推导出目标 / 范围 / 产物（哪怕粗粒度）。
      - `blocked`：描述信息不足（如裸关键词、纯占位、无目标模块、无验收标准线索），无法安全生成 roadmap + mission.json。
      - 加一句正向 + 反向示例（如 `"add audit count to dashboard"` → pass；`"optimize"` 单词 → blocked）。
      - Skill: none

Exit Criteria:

- [x] `prompts/mission-brief.md` 的 Output 段含 `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` 与 `<BRIEF_GATE_REASON>` marker 字面量（grep 锁住）。
- [x] prompt 正文含 pass / blocked 判定规则段（grep 锁住关键字 "pass" 与 "blocked"）。
- [x] `pnpm --prefix tools/mission-driver run lint:prompts` 通过（package.json `"lint:prompts": "node src/prompt-check.mjs"`）。
- [x] 现有 `mission-brief.md` 既有结构（7 个 `##` section 列表、`{{backlogDir}}` 模板变量、`<BRIEF_FILE>` marker）不动。
- [x] `docs/logs/` 更新。

### Phase 3 - Stage 1→2 gate 分支 + draft-state 字段

Status: completed
Targets: `tools/mission-driver/src/main.js`（`cmdDraftMission` Stage 1 结束 `:395-400` 与 Stage 2 开始 `:402` 之间插入 gate 分支；`writeDraftState` patch 加 `briefGate` / `briefGateReason` 字段）
Skill: none

- Item Types: `Add | Fix`
- Prereqs: Phase 1 完成（依赖 `extractBriefGate`）

- [x] Add | Fix: 在 Stage 1 之前（`skipBrief` 声明 `:359` 附近、`let briefPath = null;` `:360` 附近）**先声明 gate / reason 外层变量并初始化为 null**（关键：变量作用域必须在 `if (!skipBrief)` 块**外**，否则 Phase 3 item 2 的 gate 分支引用不到——会触发 `ReferenceError`）：
      ```js
      const skipBrief = resolved.skipBrief === true;
      let briefPath = null;
      let gate = null;
      let reason = null;
      ```
      - `gate` / `reason` 初始化为 `null`：`skipBrief === true` 时 Stage 1 整段跳过，`gate` / `reason` 保持 `null`，Phase 3 item 2 的 `if (gate === "blocked")` 不进、控制流落到 Stage 2（向后兼容单段式路径，与设计文档 §5.3 一致）。
      - Skill: none
- [x] Add | Fix: 改写 Stage 1 结束的 `briefPath = extractBriefPath(...)` 段（`main.js:395-400`），让它在 `briefPath` 之外**同时赋值外层 `gate` / `reason`** + 在 patch 加 `briefGate` / `briefGateReason`：
      ```js
      console.log("\n" + (briefResult.text || "(no brief output)"));
      briefPath = extractBriefPath(briefResult.text);
      ({ gate, reason } = extractBriefGate(briefResult.text));
      if (opts.draftJobDir) {
        writeDraftState({ phase: "brief_done", briefPath, briefGate: gate, briefGateReason: reason });
      }
      ```
      - 关键：用括号赋值解构 `({ gate, reason } = extractBriefGate(...))`（不是 `const` 重新声明——外层已 `let` 声明）；这样赋值给外层作用域的 `gate` / `reason`，Phase 3 item 2 才能引用。
      - `briefGate` / `briefGateReason` 字段无论 gate 值（pass / blocked / null）都写入——null 也写（让 draft-state.json 显式表态"无 marker"，区分"还没跑到 Stage 1"与"跑了但 AI 没输出 marker"）。
      - Skill: none
- [x] Add | Fix: 在 Stage 1 闭括号（`if (!skipBrief) { ... }` 的闭合 `}`）之后、Stage 2 注释（当前 `// ── Stage 2: draft (roadmap + mission.json) ──`）之前，插入 gate 分支：
      ```js
      if (gate === "blocked") {
        console.log(`\n[BRIEF GATE] blocked: ${reason || "(no reason)"}`);
        console.log(`Brief written to ${briefPath || "(unknown)"}. Resolve the open questions there, then re-run draft.`);
        if (opts.draftJobDir) {
          writeDraftState({ status: "blocked", endedAt: new Date().toISOString() });
        }
        await runner.close();
        return;
      }
      ```
      - gate 分支在 `if (!skipBrief)` 块**外**——这就是 Phase 3 item 1 要求把 `gate` / `reason` 声明在外层的原因。
      - `gate === "pass"` 与 `gate === null`（旧 brief 无 marker，或 `--skip-brief` 路径）：不进 if 块，控制流落到 Stage 2（同旧行为）。
      - `process.exitCode` 不设（默认 0；gate blocked 是正常工作流，不是错误；与 WI1 `validateDraftDesc` 失败的 `process.exitCode = 1` 区分）。
      - 不调 `runner.runAgent("draft-mission", ...)`、不写 `mission.json` / roadmap（Stage 2 整段跳过）。
      - Skill: none

Exit Criteria:

- [x] `gate === "blocked"` 时 Stage 2 不执行：mock runner 的 `runAgent` 只被调用 1 次（`mission-brief`），无 `draft-mission` 调用；`draft-state.json` `status === "blocked"` + `phase === "brief_done"` + `briefGate === "blocked"` + `briefGateReason` 含 reason；不写 `phase: "draft"` / `phase: "completed"` / `missionName` / `missionFile`。
- [x] `gate === "pass"` 时 Stage 2 正常执行：mock runner 的 `runAgent` 被调用 2 次（`mission-brief` + `draft-mission`）；`draft-state.json` 含 `briefGate === "pass"`（其它字段同旧行为）。
- [x] `gate === null`（旧 brief 无 marker）时 Stage 2 正常执行（向后兼容）：mock runner 的 `runAgent` 被调用 2 次；`draft-state.json` `briefGate === null`（显式写 null，区分"未跑 Stage 1"）。
- [x] gate blocked 时 `process.exitCode` 保持 `undefined` / `0`（不设）。
- [x] `--skip-brief` 路径不回归：`skipBrief: true` 时 Stage 1 整段不跑，`briefPath === null`、外层 `gate === null`（Phase 3 item 1 初始化为 null 且 Stage 1 跳过不赋值）、`reason === null`、Stage 2 正常执行；`draft-state.json` 因为 `stateFile` 检查只在 `opts.draftJobDir` 时写，所以可能含或不含 `briefGate` 字段——测试容忍"`briefGate` 字段不存在 或 === null"（取决于 Stage 1 是否被进入；skipBrief 时根本不进入所以不存在；非 job 模式则 stateFile 不写）。
- [x] `docs/logs/` 更新。

### Phase 4 - 单元 + 集成测试

Status: completed
Targets: `tools/mission-driver/test/brief-gate.test.js`（新增）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1、Phase 3 完成（Phase 2 的 prompt 改动不影响测试——测试用 mock runner 直接注入 gate marker 文本，不依赖 AI 实际输出）

- [x] Add: 新增 `test/brief-gate.test.js`，沿用 `test/draft-brief.test.js:1-33` 的范式（`__setRunnerFactoryForTest` + `makeFakeRunner` + `makeTmpProject` + try/finally `rmSync`）。覆盖：
      - 用例 A（纯函数层）：直接 `import { extractBriefGate } from "../src/main.js"`（Phase 1 已 export），断言：
        - `extractBriefGate("<BRIEF_GATE>pass</BRIEF_GATE>")` → `{ gate: "pass", reason: null }`。
        - `extractBriefGate("<BRIEF_GATE>blocked</BRIEF_GATE><BRIEF_GATE_REASON>desc too vague</BRIEF_GATE_REASON>")` → `{ gate: "blocked", reason: "desc too vague" }`。
        - `extractBriefGate("<BRIEF_GATE> PASS </BRIEF_GATE>")` → `{ gate: "pass", reason: null }`（大小写 + 前后空白容忍）。
        - `extractBriefGate("<BRIEF_FILE>docs/backlog/x-brief.md</BRIEF_FILE>")` → `{ gate: null, reason: null }`（无 gate marker → 向后兼容 null）。
        - `extractBriefGate(undefined)` / `extractBriefGate(null)` / `extractBriefGate(123)` → `{ gate: null, reason: null }`（非字符串兜底）。
        - `extractBriefGate("<BRIEF_GATE>blocked</BRIEF_GATE>")`（无 reason tag）→ `{ gate: "blocked", reason: null }`（reason 缺失不抛错）。
        - `extractBriefGate("<BRIEF_GATE>unknown</BRIEF_GATE>")`（非法 gate 值）→ `{ gate: null, reason: null }`（正则只匹配 pass|blocked，其它值视为无 marker）。
        - Skill: none
      - 用例 B（cmdDraftMission 集成层，gate=blocked）：用 `__setRunnerFactoryForTest` 注入 mock runner，让 `mission-brief` 返回 `<BRIEF_FILE>...</BRIEF_FILE>\n<BRIEF_GATE>blocked</BRIEF_GATE>\n<BRIEF_GATE_REASON>desc too vague</BRIEF_GATE_REASON>`，调用 `cmdDraftMission("optimize", { dir: tmpDir, draftJobDir: jobDir })`，断言：
        - mock runner 的 `runAgent` 只被调用 1 次（`stepName === "mission-brief"`）；无 `draft-mission` 调用。
        - `process.exitCode` 未被设为非 0（在测试里 `process.exitCode = undefined` reset 后调用，断言 `process.exitCode === undefined`）。
        - `draft-state.json` `status === "blocked"` + `phase === "brief_done"` + `briefGate === "blocked"` + `briefGateReason === "desc too vague"` + 含 `endedAt`；不含 `phase: "draft"` / `phase: "completed"` / `missionName` / `missionFile`。
        - stderr / console.log 含 `[BRIEF GATE] blocked` 文案（捕获 `console.log`）。
        - Skill: none
      - 用例 C（cmdDraftMission 集成层，gate=pass）：让 `mission-brief` 返回 `<BRIEF_FILE>...</BRIEF_FILE>\n<BRIEF_GATE>pass</BRIEF_GATE>`、`draft-mission` 返回 `<AI_STEP_RESULT>created</AI_STEP_RESULT>`，调用同上，断言：
        - mock runner 的 `runAgent` 被调用 2 次（`mission-brief` + `draft-mission`）。
        - `draft-state.json` 含 `briefGate === "pass"` + `phase === "completed"` + `status === "completed"`（与旧路径一致 + 新字段）。
        - Skill: none
      - 用例 D（cmdDraftMission 集成层，gate=null 向后兼容）：让 `mission-brief` 只返回 `<BRIEF_FILE>...</BRIEF_FILE>`（无 gate marker，模拟旧 brief），调用同上，断言：
        - mock runner 的 `runAgent` 被调用 2 次（Stage 2 照跑，向后兼容）。
        - `draft-state.json` `briefGate === null`（显式写 null）+ `phase === "completed"` + `status === "completed"`。
        - Skill: none
      - 用例 E（`--skip-brief` 路径不回归）：调用 `cmdDraftMission("add audit count", { dir: tmpDir, draftJobDir: jobDir, skipBrief: true })`，断言 mock runner 只被调用 1 次（`draft-mission`）；`draft-state.json` 不含 `briefGate` 字段（或为 null，由实现决定——Stage 1 整段跳过，gate 永远是 null；测试断言"`briefGate` 字段不存在 或 === null"以容忍实现细节）。
        - Skill: none
      - 用例 F（**完整 grep 锚点**）：用 `readFileSync` 读取 `prompts/mission-brief.md`，断言全文 `match(/<BRIEF_GATE>/g) !== null` 且 `match(/<BRIEF_GATE_REASON>/g) !== null`——锁住"prompt 文件含 gate marker 契约"（防 Phase 2 改动被回退）。
        - Skill: none
- [x] Proof: 运行 `pnpm --prefix tools/mission-driver test`，确认新测试全绿且不破坏现有套件（特别 `draft-brief.test.js` / `draft-job.test.js` / `draft-desc-validate.test.js` / `draft-path-consistency.test.js` / `draft-plans-audit-gate.test.js` / `prompt-markers.test.js`）。
      - Skill: none
- [x] Proof: 运行 `pnpm --prefix tools/mission-driver run lint:prompts`，确认 prompt 改动通过 `prompt-check.mjs` 检查。
      - Skill: none

Exit Criteria:

- [x] `test/brief-gate.test.js` 用例 A/B/C/D/E/F 全部通过。
- [x] `pnpm --prefix tools/mission-driver test` 整体绿（含现有套件）。
- [x] `pnpm --prefix tools/mission-driver run lint:prompts` 通过。
- [x] `docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (task `ses_07d1fea59ffeLDQluunJx8HmWi`) 因为四处阻塞性问题：(1) Phase 3 item 1 在 `if (!skipBrief)` 块内用 `const { gate, reason } = extractBriefGate(...)` 声明，但 Phase 3 item 2 的 `if (gate === "blocked")` 分支在块外——`gate` / `reason` 不可达，`skipBrief` 两路径都触发 `ReferenceError`，直接违反 Phase 3 `--skip-brief` Exit Criteria；(2) Current Baseline `cmdDraftMission` 范围 `main.js:244-453` 过期——live `cmdDraftMission` 在 `:292`（WI1 加 `validateDraftDesc` 后整体下移 ~48 行）；(3) Export 语句引用 `main.js:801` 过期——实际在 `:872`，`:801` 在 commander 设置块里；(4) Closure Gates 手动验证 `draft "优化"` 不可执行——`"优化".length === 2`，WI1 `validateDraftDesc` 在 Stage 1 之前就 exit 1，gate 路径根本不触发。
- Iteration 1 revision: (1) Phase 3 item 1 改为**外层 `let` 声明 `gate = null, reason = null`**（在 `skipBrief` 声明附近、`if (!skipBrief)` 之前），Phase 3 item 2 改 Stage 1 结束段时用**括号赋值解构** `({ gate, reason } = extractBriefGate(...))`（不重新 `const` 声明，赋值给外层）——这样 gate 分支可引用，`skipBrief` 路径下 `gate === null` 自然落到 Stage 2（向后兼容）；同时把 `--skip-brief` Exit Criteria 措辞改为容忍"`briefGate` 字段不存在 或 === null"以匹配"Stage 1 整段跳过，gate/reason 保持外层 null 初始化"的实现现实。(2) `cmdDraftMission` 范围改为 `:292-501`，Stage 1 改 `:413-448`、Stage 2 改 `:450-501`。(3) Export 引用改 `:872`（Current Baseline + Phase 1 item 2 + Targets 行三处）。(4) 手动验证 desc 改为 `draft "optimize performance"`（length=21，过 WI1 黑名单与长度，但语义足够 vague 让 brief agent 判 blocked）。顺带修了 Phase 4 用例 C 的 typo `mission-bission` → `mission-brief`。
- Independent draft review iteration 2: `needs revision` (task `ses_07d155de7ffeC2oj5x1BFVnTat`) — iteration 1 的 4 个 blocker 全部解决（外层 `let` + 括号赋值解构、export 改 `:872`、手动验证改 `"optimize performance"`、typo 修复），但发现 1 个**新引入**的阻塞问题：iteration 1 修订把"+48 偏移"误用到函数**体内部**所有行号（Stage 1 `:413-448` / Stage 2 `:450-501` / 函数末 `:501`），但只有函数**起始**下移了 48 行，函数体内部行号**不变**——live 函数末在 `:453`、Stage 1 末在 `:395-400`、Stage 2 在 `:402-453`。内部矛盾：Current Baseline 的相邻两句（函数范围说 Stage 1 是 `:413-448`、下一句说 Stage 1/2 边界在 `:400`/`:402`）相互打架；更严重的是 Phase 3 Targets 引用 `:413-448` / `:450-455` 把 gate 分支的插入点指向 Stage 2 中段（`runAgent("draft-mission")` **之后**），与 gate 的目的相反。
- Iteration 2 revision: Current Baseline line 15 改 `cmdDraftMission:292-453` / Stage 1 `:365-400`（末段 `:395-400`）/ Stage 2 `:402-453`；显式注明"函数起始下移 ~48 行，但函数体内部行号不变"。Phase 3 Targets 改 "Stage 1 结束 `:395-400` 与 Stage 2 开始 `:402`"。所有其它已校准的精确插入点引用（`:359` `:360` `:395-400` `:400` `:402` `:872` `:160-164`）保持不变。
- Independent draft review iteration 3: `accept` (task `ses_07d108919ffef4Pk0FI1EnqSn1`) — iteration 2 blocker 已解决（`cmdDraftMission:292-453` / Stage 1 `:365-400` 末段 `:395-400` / Stage 2 `:402-453`；Phase 3 Targets 改 `:395-400` + `:402`），所有 line 号对 live code 准确；新增的"函数起始下移 ~48 行，但函数体内部行号不变"注解防止再混淆；Phase 3 gate 分支插入点（`:359`/`:360` 外层声明 → `:395-400` 改写 → `:400`/`:402` 之间分支）逻辑正确连续。Baseline 与 live code 一致，无新阻塞。共识达成，Plan Status → active。

## Closure Gates

- [x] in-scope behavior is complete（extractBriefGate 函数 + Stage 1→2 gate 分支 + draft-state 字段 + prompt marker 契约 + 测试）
- [x] relevant docs are aligned（设计文档 §4.2 已是 owner doc；CONTEXT.md "draft 两段式管线"段落无需改文案——gate 是 prompt 内部契约不是模块 API；本 plan 闭合时在日志记录"已落地"，No owner-doc update required）
- [x] verification has run（`pnpm --prefix tools/mission-driver test`；`pnpm --prefix tools/mission-driver run lint:prompts`；手动跑 `node src/main.js draft "optimize performance"` 看 brief 输出 blocked marker 后是否真的不进 Stage 2——选 `"optimize performance"` 而非裸 `"优化"`：后者 `length === 2` 会被 WI1 `validateDraftDesc` 在 Stage 1 之前拦下，gate 路径根本不会触发）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent
- [x] closure evidence exists in files

## Deferred But Adjudicated

### monitor draft-job UI 显示 briefGate / briefGateReason 字段

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 本 plan 保证 `draft-state.json` 写入 `briefGate` / `briefGateReason` 字段；UI 是否渲染这些字段属 monitor 前端升级，设计文档 §4.2.3、§5.2 明确"新字段对旧 UI 透明（忽略未知字段）；UI 升级非阻塞"。
- Successor Required: no — 仅在 monitor draft-job UI 显式决定展示 gate 状态时才需前端改动；当前 phase 字段（`brief_done` / `draft` / `completed` / `blocked`）已能粗粒度提示。

### AI 不稳定输出 `<BRIEF_GATE>` marker 的兜底

- Classification: `watch-only residual`
- Why Not Blocking Closure: 设计文档 §5.2 已声明对策——`gate === null` 时退化为旧行为（继续 Stage 2），不强制阻塞；prompt 里给正向 + 反向例子。本 plan 的 prompt 改动（Phase 2）已含正向 + 反向示例。若实际跑下来发现 AI 经常漏 marker（gate === null 比例高），可再加 `extractTagTolerant` 风格的容错正则或在 prompt 顶部加更显眼的 marker 提醒。
- Successor Required: yes — 若手动验证发现 AI 输出 marker 不稳定（null 比例 > 20%），由后续 plan 承接 prompt 强化或解析容错。

## Closure

Status Note: All four Phases executed end-to-end and ticked. `extractBriefGate` 纯函数（Phase 1）+ export 已落地；`mission-brief.md` 加 `<BRIEF_GATE>pass|blocked</BRIEF_GATE>` + `<BRIEF_GATE_REASON>` marker 契约段与 pass/blocked 判定规则段（Phase 2）；`cmdDraftMission` 外层 `let gate/reason` + 括号解构赋值 + Stage 1→2 之间 gate 分支（Phase 3）；`test/brief-gate.test.js` 6 用例 A-F（含纯函数、blocked/pass/null 三分支集成、`--skip-brief` 不回归、prompt grep 锚点）全绿（Phase 4）。验证全绿：`pnpm --prefix tools/mission-driver test` → 504 pass / 0 fail（WI3 baseline 492 + Phase 4 新增 12）；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built；`pnpm --prefix tools/mission-driver run lint:prompts` OK。in-scope 全部到位、无 downgrade，monitor draft-job UI 显示新字段、AI 不稳定输出 marker 的兜底均按设计文档 §5.2 / §4.2.3 显式 deferred。

Closure Audit Evidence:

- Auditor / Agent: solo cold-replay pass (no second reviewer available; non-protected / non-high-risk per AGENTS.md Reviewer-Availability Fallback)
- Evidence:
  - `tools/mission-driver/src/main.js` — `extractBriefGate` 新增 + `export` 行加入；`cmdDraftMission` 外层 `let gate = null, reason = null;` + `({ gate, reason } = extractBriefGate(...))` + `if (gate === "blocked") { ... return; }` 分支；`writeDraftState({ phase: "brief_done", briefPath, briefGate: gate, briefGateReason: reason })`。
  - `tools/mission-driver/prompts/mission-brief.md` — `## Brief Gate` 规则段 + `## Output` 块加 `<BRIEF_GATE>` + `<BRIEF_GATE_REASON>` marker 字面量。
  - `tools/mission-driver/test/brief-gate.test.js` — 6 describe × 12 assertions，覆盖 pure / blocked / pass / null / skipBrief / grep anchor。
  - `docs/backlog/mission-driver-draft-robustness-roadmap.md` — WI2 → `done`。
  - `docs/logs/2026/07-21.md` — WI2 closure 条目。
  - Verification (full green): `pnpm --prefix tools/mission-driver test` → 504 pass / 0 fail；`pnpm --prefix tools/mission-driver/web run typecheck` clean；`pnpm --prefix tools/mission-driver/web run build` built；`pnpm --prefix tools/mission-driver run lint:prompts` OK。
