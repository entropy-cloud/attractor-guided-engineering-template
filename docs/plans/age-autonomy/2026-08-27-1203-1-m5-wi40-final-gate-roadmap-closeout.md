---
status: active
mission: age-autonomy-implementation
work-item: M5-WI40
group: "2026-08-27-1203"
verify: [test, verify-age]
---

# 2026-08-27-1203-1 M5-WI40 最终关门：门命令实测 + monitor extends 合并修复（Follow-up P2 清偿）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI40（M5 最终 Verification Gate）；Follow-up Backlog 未勾项「monitor 读 mission 配置未走 extends 合并」（deep-audit round 2 P2，2026-08-27-1023-3 WI39 plan Non-Goals 指定后继 slice = 本 plan）
> Related: 2026-08-27-1023-3（WI39 owner-doc 收口——本 plan 为其登记的后续 slice）、2026-08-27-1023-1（WI37 总判定：引擎留任，M5 收口无引擎退役动作）、2026-08-27-0433-1（WI31 门命令 3 括号语义先例）

## Current Baseline

- roadmap 状态：M1–M4 全勾 + M5 WI37/WI38/WI39 已勾（1023 批次）；列 0 未勾仅 WI40 一行（`grep -c "^- \[ \]"` = 1）。Follow-up Backlog 仅剩一条未勾（monitor extends 合并 P2，缩进 2 格——在机器计数域与 WI40 grep 门之外）。
- monitor 配置读面现状（`tools/mission-driver/src/monitor.js`）：`readMissionConfig`（:543）对 `missions/<name>.json` 裸 `JSON.parse` 后白名单提取——不解析 `extends` 链；消费面四处在库（:531 flowName 兜底 / :594 `handleGetRun` config / :823 `handleListPlans` plansDir / :1160 `handleStartRun` 白名单门（POST /api/runs；`handleStartDraft` :1229 直读 base.json、非本面消费））。`handleListConfigs`（:727）逐文件裸 parse、`if (!mission.roadmapPath) continue` 过滤；`handleGetRoadmap`（:794）裸 parse 取 roadmapPath。后果（deep-audit round 2 P2）：从 base.json 继承 roadmapPath/plansDir/commands 的 mission 在 dashboard 显示为空/缺字段且被 `/api/configs` 过滤——本仓库 mission 自带全字段故无实害，模板消费者面 latent。
- 引擎侧合并单一实现在库：`mission-check.mjs` `resolveExtends`（内部函数，base → base.local → mission 浅合并 + 递归 extends + `_` 前缀键剥离）经导出面 `loadMission(missionFile, projectRoot?)`（:100）可达；`projectRoot` 缺省 = 跳过路径存在性校验（仅必填字段校验）；无效 mission throw（monitor 需 try/catch 退化）；文件尾 CLI guard 在库（`import.meta.url === pathToFileURL(process.argv[1]).href`，monitor import 无副作用）。`handleGetBaseConfig`（:766）已是 base+base.local 合并显示面先例。
- WI40 门命令（roadmap :103-108）：`./verify-age.sh` L1+L2 全绿 / `pnpm --prefix tools/mission-driver test` 0 失败 / `pnpm --prefix plugin/dsh run verify:e2e`（真宿主 e2e；缺 env → fail-fast exit ≠ 0，CI opt-in 不阻塞——括号语义）/ `mission-check.mjs missions/age-autonomy-implementation.json .` exit 0 / `grep -c "^- \[ \]"` → 0 / 独立 subagent 收口审计（跑通 M1–M4 全部 Verification Gate + 三硬门全 allow face，pass 才允许整 roadmap 全 done）。
- 末条门字面 `docs/audits/age-autonomy/<final-closure>.md` 为 M2-WI22 证据面重建（2026-08-25）之前的旧指针：外部审计生命周期通道已退役，mission 级审计结论唯一面 = roadmap `## Deep Audit Record` inline，plan 级收口审计唯一面 = plan `## Closure` 回执——落点裁定需在本 plan 成文。
- 验证基线（1023-3 回执在案）：引擎 953/953、插件 420/0、真值表 116/0、verify-age L1+L2+L2.5 GREEN。
- roadmap 写回纪律：`roadmap-write-guard` 允许已注册 WI 行 `[ ]→[x]` 翻转 + 行内尾部证据注记；Follow-up Backlog 行不在 milestone 比对域（清偿编辑合法）；`[x]→[ ]` 回退翻转需 engine/supervisor/approved-project 例外（本 plan active 期间正文含 roadmap 路径字符串，`activePlanReferencing` 例外保持可用）。00-roadmap-authoring-guide §Roadmap Role 禁 AI 发明新 work item——Follow-up P2 清偿收编进本 WI40 收口 plan，不注册新 WI。

## Goals

- 清偿最后一条 Follow-up Backlog：monitor 三个配置读面（`readMissionConfig`/`handleListConfigs`/`handleGetRoadmap`）改经共享 `loadMission` extends 合并（零第二合并实现），继承 mission 在 dashboard 全部 API 面显示有效配置，graceful degrade 与 base 过滤语义保持，测试钉住。
- 执行 WI40 最终门：全部门命令真实绿（verify:e2e 按括号语义如实记录），独立 subagent 收口审计（M1–M4 全部 Verification Gate 复跑 + 三硬门全 allow face）通过，WI40 勾选 + 证据回写 → roadmap 全 done（grep → 0）。

## Non-Goals

- 不新增 roadmap work item（roadmap guide 禁 AI 发明 WI；Follow-up P2 清偿在本 plan 内完成）。
- 不改引擎状态机核心（`git diff --stat tools/mission-driver/src/engine.js` 为空）；monitor.js 仅显示/配置读面修复；零新增 npm 运行时依赖。
- 不复活 `docs/audits/` 外部审计生命周期通道（WI22 已退役）；不新建旧形审计文件。
- 不改 monitor web 前端（API 数据面修复后前端自然显示；UI 增强另行立项）。
- 不重证 M1–M4 已收口 WIs 的交付面（收口审计复核范围 = 各 Verification Gate 命令 + 三硬门 allow face，不逐 WI 重开）。

## Task Route

- Type: `implementation-only change`（Phase 1 monitor 修复）+ `verification or audit work`（Phase 2/3 门实测与收口审计）
- Owner Docs: roadmap WI40、`docs/backlog/00-roadmap-authoring-guide.md`（write-back 纪律）、`tools/mission-driver/CONTEXT.md`（monitor API 段 + 验证命令）、`docs/design/age-autonomy/01-file-ledger.md` §3（roadmap 计数域）
- Skill Selection Basis: 默认审计 prompt（closure-audit-prompt 等）是引擎派发面（CLOSURE_AUDIT/deep-audit 步）的工作方法，非本 plan 起草/执行方法；修复与门实测无匹配 skill——Skill: none（逐 Phase 标注）

## Infrastructure And Config Prereqs

- Prereqs: 2026-08-27-1023-3（WI39）derived completed（在案）；无其他 infra 前置（真宿主 e2e env 属括号语义分支，非前置条件）。

## Phase 1 — Follow-up P2 清偿：monitor extends 合并修复

Targets: `tools/mission-driver/src/monitor.js`、`tools/mission-driver/src/mission-check.mjs`（只读消费）、`tools/mission-driver/test/monitor.test.js`、`tools/mission-driver/CONTEXT.md`、roadmap Follow-up Backlog 行
Skill: none

- Item Types: `Fix | Decision | Proof | Add`
- Prereqs: 本 plan 前无未完成 Phase

- [x] Decision: 复用裁定——monitor 经 `mission-check.mjs` 导出面 `loadMission` 消费 extends 合并（单一实现，零第二合并）；display 面调用不传 `projectRoot`（跳过路径存在性校验，保持 dangling-path 显示容忍）；throw → try/catch 退化为 null/skip（graceful degrade 保持）。备选否决：monitor 内复刻合并链（第二实现漂移面）/ 导出 `resolveExtends` 新公共面（`loadMission` 已覆盖需求）。残险 = 无（只读消费 + 校验语义即既有 `/api/configs` 过滤意图）。
- [x] Fix: `readMissionConfig`（monitor.js :543）改经 `loadMission(missionFile)` try/catch（失败 → null 保持）；合并后白名单提取字段集不变；:531 / :594 / :823 / :1160 四消费面自动受益（零各自改动）。
- [x] Fix: `handleListConfigs`（:727）逐文件改经 `loadMission` try/catch skip；`if (!mission.roadmapPath) continue` 防线保留（base/base.local 仍自然过滤，extends 继承 roadmapPath 的 mission 进列表）。
- [x] Fix: `handleGetRoadmap`（:794）改经 `loadMission` try/catch 取 roadmapPath（继承 mission 的 roadmap 面可解析；失败 → 既有空响应形状不变）。
- [x] Proof: `tools/mission-driver/test/monitor.test.js` 增用例（fixture mission `extends: "base"`）——① `/api/configs` 列出该 mission 且合并链字段可见 ② `/api/configs/:name/roadmap` 解析继承的 roadmapPath ③ `/api/configs/:name/plans` 读继承 plansDir ④ base.local.json 覆盖优先级 ⑤ dangling extends target → graceful skip（不 500、不进列表）⑥ base.json 仍被过滤（回归钉）⑦ 无 extends mission 响应形状不变（向后兼容钉）。验证命令：`pnpm --prefix tools/mission-driver test`。
- [x] Add: CONTEXT.md 增量句（Mission 配置系统段：monitor 配置读面走 extends 合并）；roadmap Follow-up Backlog 行清偿（`[ ]`→`[x]` + 删除线 + 已清偿注记指针本 plan，:156-160 先例）。

Exit Criteria:

- [x] extends 继承 mission 在 configs/roadmap/plans 三 API 面显示有效配置（测试断言在案）；无 extends 语境零行为变化（回归钉在案）
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空 + 零新增 npm 依赖
- [x] CONTEXT.md 增量在册；roadmap Follow-up 行 `[x]` + 注记在册
- [x] `docs/logs/2026/08-27.md` updated

## Phase 2 — M5 门命令实测

Targets: `./verify-age.sh`、`tools/mission-driver` 测试面、`plugin/dsh` e2e 面、`missions/age-autonomy-implementation.json`
Skill: none

- Item Types: `Proof`
- Prereqs: Phase 1

- [x] Proof: `./verify-age.sh` → L1+L2+L2.5 GREEN（实测输出留痕 docs/logs）。
- [x] Proof: `pnpm --prefix tools/mission-driver test` → 0 失败（含 Phase 1 新用例；相对 953 基线只增不减）。
- [x] Proof: `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` → exit 0。
- [x] Proof: `pnpm --prefix plugin/dsh run verify:e2e` → 真宿主 e2e；本机缺宿主 env 时按括号语义如实留档（fail-fast exit ≠ 0 = 文档化行为，CI opt-in 不阻塞——0433-1 WI31 门命令 3 同型先例）；env 在场则真实跑绿记录。
- [x] Proof: 三硬门 allow face 复核——`node tools/mission-driver/src/gate-check.mjs <本 plan 文件>` exit 0（自指一致）+ 任一已收口 M4 plan 语料 exit 0（closure-audit-binding / writer-identity / plan-completed 全 allow）。

Exit Criteria:

- [x] verify-age / test / mission-check / 三硬门 allow face 真实绿在案；verify:e2e 按括号语义两分支取一如实记录（不留模糊）
- [x] `docs/logs/2026/08-27.md` 条目在册

## Phase 3 — 最终收口审计 + roadmap 回写

Targets: 本 plan `## Closure`、`docs/backlog/age-autonomy-implementation-roadmap.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Decision | Add | Proof | Follow-up`
- Prereqs: Phase 2

- [x] Decision: 收口审计回执落点裁定——WI40 行字面 `docs/audits/age-autonomy/<final-closure>.md` 为 M2-WI22 证据面重建前旧指针；as-built 映射 = 本 plan `## Closure` dispatch/accepted 回执（独立 subagent = 引擎 CLOSURE_AUDIT 步；审计范围 = M1–M4 全部 Verification Gate 命令复跑 + 三硬门全 allow face 验证）+ mission 级审计（如引擎再派 deep-audit 轮）落 roadmap `## Deep Audit Record` inline。不新建 `docs/audits/age-autonomy/` 旧形文件。残险 = 与 WI40 字面不符——以本裁定注记 + 收口审计复核承接。
- [x] Add: WI40 勾选前置核验——M1–M4/M5 各 Verification Gate 证据指针齐全性复核（各 WI 行内证据在册）+ 勾选前 grep 计数 = 1 确认。
- [x] Add: roadmap WI40 `[ ]`→`[x]` + 行内证据注记（门命令实测结果 + 收口审计回执指针）+ `> Last Updated` 头同步；`docs/logs/2026/08-27.md` 收口条目。
- [x] Proof: `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` → 0 实测（勾选后）。
- [x] Follow-up: 若收口审计拒绝（findings ≠ none）——Closure Findings 落未勾项 + WI40 回退 `[x]→[ ]`（经 approved-project 例外：本 plan active 期间正文含 roadmap 路径字符串）+ 修复后重走 Phase 2/3；触发条件 = 收口审计 findings ≠ none。（未触发：收口审计 findings=none——回执见 `## Closure`）

Exit Criteria:

- [x] 收口审计 dispatch/accepted 回执在 `## Closure` 在案（同 id 配对）
- [x] roadmap WI40 `[x]` + 行内证据 + Last Updated 同步在册；grep → 0 实测
- [x] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-1203-1-m5-wi40-final-gate-roadmap-closeout-1-d7a584ce to ses_reviewer_2026-08-27-1203
- 2026-08-27：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-1203-1-m5-wi40-final-gate-roadmap-closeout-1-d7a584ce（独立冷验证：roadmap grep 未勾=1 且 monitor-extends Follow-up 行缩进在计数域外；monitor.js readMissionConfig 四消费面 :531/:594/:823/:1160 与 :543/:727/:766/:794 行号实测相符；mission-check.mjs loadMission 导出/resolveExtends 内部/缺 projectRoot 跳路径校验/尾部 CLI guard 语义核实；verify 键 ⊆ mission commands；格式合规（checkbox 仅 Phase 区列 0、无禁用词、Follow-up 带触发条件）；gate-check exit 0 + work-item M5-WI40 对账 ok；WI39 Non-Goals 后继指定在案、docs/audits/age-autonomy 确已不存在故回执落点裁定成立、Follow-up 收编不注册新 WI 符合 00-roadmap-guide §Roadmap Role）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=e696b6a97daa4610a2e7756427f830e0f893eb90959b633c75ebb3b8e9942a0d exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=e696b6a97daa4610a2e7756427f830e0f893eb90959b633c75ebb3b8e9942a0d exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-27-1203-1-m5-wi40-final-gate-roadmap-closeout-1-4ce2a7f1 to ses_fbe1dd4e
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-27-1203-1-m5-wi40-final-gate-roadmap-closeout-1-4ce2a7f1：独立 subagent 收口审计结论 none——16 命令复跑全绿：M1（plan-check --strict exit 0 / 引擎 961/961·0 / ledger-frontmatter 23/0（实际路径 `tools/mission-driver/test/ledger-frontmatter.test.js`，WI11 门字面 plugin/dsh 路径为 M1 期笔误 informational N1）/ 勾选前 grep=1 仅 WI40 行）+ M2（gate-check --policy exit 0 / 真值表 116/116·0 / WI22 语料 gate-check exit 0 / mission-check exit 0）+ M3（supervisor-trigger 43/0 / supervisor-recovery 18/0 / verify:e2e:continuous 缺 env fail-fast exit 1 = 文档化括号语义（WI31 opt-in 门）/ WI31 plan --law exit 0 九 enforce gate 全 allow）+ M4（pool-lifecycle 13/0 / prompt-assembly 16/0 / context-profile 13/0）+ 三硬门 allow face（WI36 语料 exit 0）+ spot-check（Phase 1/2 全勾、engine.js 零 diff、零新依赖、Follow-up extends 行清偿在册、日志条目在册）——roadmap WI40 允许勾选（PASS）；收口审计回执落点 = 本 `## Closure`（`docs/audits/age-autonomy/<final-closure>.md` 旧指针退役，Phase 3 Decision 裁定在案）；roadmap WI40 [x] + 行内证据 + Last Updated 同步，勾选后 grep → 0 实测（44 WI 全勾）。
