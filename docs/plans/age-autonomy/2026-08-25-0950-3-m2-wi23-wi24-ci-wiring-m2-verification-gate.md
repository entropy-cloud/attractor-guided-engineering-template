---
status: active
mission: age-autonomy-implementation
work-item: M2-WI23+WI24
group: "2026-08-25-0950"
verify: [test, verify-age]
---

# 2026-08-25-0950-3 M2 CI 门禁接线 + Verification Gate 收口（age-autonomy M2-WI23+WI24）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI23（CI 门禁接线）+ WI24（Verification Gate — M2，自动验证硬门）；0635-3 Deferred 显式移交：「pre-commit hook / plan-check CI job / age-ci 触发路径扩展 → M2 WI23 字面范围」；0925-3 Deferred 触发条件命中：「roadmap 退役格式段清理……下一次 roadmap 结构性维护或 M2 收口批次顺带」——本 plan 即 M2 收口批次
> Related: 前置 = M2 全部前序 plan：`2026-08-25-0815-{1,2,3}`（law 内核/三硬门/配套门禁 + truth-table ≥30 基线）、`2026-08-25-0925-{1,2,3}`（WI41 路由修复 / WI42+WI44 读面与空真封堵 / WI43 架构 owner-doc 同步）、`2026-08-25-0950-{1,2}`（WI21 护栏与 P8 / WI22 证据面重建）——WI24 的每条 gate 命令都以它们落地为前提；`verify-age.sh`/`age-ci.yml`（dsh-plugin M2-WI8 产物，本 plan 的接线宿主）

## Current Baseline

**M2 的执法面全部沉淀在本地命令（gate-check/law truth-table/mission-check），但 merge-blocking 链只盖代码路径不盖账本路径：CI 触发路径无 `docs/plans/**`/`docs/backlog/**`/`missions/**`，本地无 pre-commit 钩子——plan/roadmap/policy 的违规写入在 CI 面不可见；WI24 收口门（4 条真实命令）尚无执行载体。**（以下事实 2026-08-25 live 核实；0815/0925/0950-1/2 批次尚未执行——其交付面以 plan 文字为准，本 plan 的 Prereqs 保证执行序）

- **现有 merge-blocking 链**：`verify-age.sh`（35 行，dsh-plugin M2-WI8 Option A）= L1（`pnpm --prefix tools/mission-driver test`，含 prompt-check）+ L2（`npm --prefix plugin/dsh test`，含 backend-parity matrix / manifest check / node --test / tsc / bundle freshness / smoke import），插件 devDependencies 按需安装，纯 Node 零网络零凭证；`​.github/workflows/age-ci.yml` 单 job `l1-l2` 直接跑同一脚本（本地=CI 同构声明在其头注）。头注明示该脚本「NOT part of the install-age.sh template manifest」。
- **CI 触发路径缺口**：age-ci.yml 的 push/pull_request paths = `tools/mission-driver/**`、`plugin/dsh/**`、workflow 自身、`verify-age.sh`——**账本与执法数据路径（`docs/plans/**`、`docs/backlog/**`、`missions/**`）不在触发集**：只改 plan/roadmap/policy 的提交不跑 CI（0635-3 Deferred 移交字面的第三项「age-ci 触发路径扩展」）。
- **pre-commit 现状**：无 `.githooks/` 目录、无 husky、仓库根无 package.json（live 核实）——git hooks 接线的唯一零依赖通道 = `git config core.hooksPath .githooks` + 脚本（启用动作是每个开发者的本地一次性配置，须文档化；CI 不依赖 hooks）。
- **接线对象（Prereqs 交付面）**：`tools/mission-driver/src/plan-check.mjs` frontmatter 版（M1 交付）+ `gate-check.mjs`（0815-1：`--policy` 校验模式 + 单文件结构面评估；0815-3 增 `--verify` 模式）+ `plugin/dsh/test/law-truth-table.test.mjs`（0815-1 奠基，0815-2/3、0950-1/2 增补，WI24 gate 要求 ≥30 用例）+ `roadmap-check.mjs`（M1 起存在，0925-2 接线字段集校验）+ `missions/autonomy.policy.yml`（0815-1 起存在，0950-1/2 增条目）。
- **WI24 gate 命令与落地形态的对齐**：roadmap WI24 字面第 1 条 `node plugin/dsh/src/law/check-policy.mjs missions/autonomy.policy.yml`（或 plan-check 的 `--policy` 模式）——0815-1 已裁定落点为 `node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml`（同一校验面的 CLI 前门实现，roadmap 的「或」分支意图 = policy 经 CLI 可校验，非字面二选一文件名）；WI24 执行时以实际落地命令形态记录并在 tick 证据注明该对齐注记（防 roadmap over-claim 双向：命令名不同 ≠ gate 未跑）。第 2 条 roadmap 字面 `node plugin/dsh/test/law-truth-table.test.mjs`——执行用 `node --test plugin/dsh/test/law-truth-table.test.mjs`（node 直跑测试文件依赖文件自含 `node:test` 顶层执行面；以 `--test` runner 形态为准确记录实际命令与输出，同第 1 条的对齐注记纪律）。第 3 条 `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/<a-plan>.md` 真实 plan 三硬门全 pass（执行时选当期已收口的 M2 plan 作语料）。第 4 条 mission-check exit 0（policy 字段被校验——0815-1 Phase 2 交付该校验面）。
- **WI23 字面与落地面的映射（预记，防 tick 时字面争议）**：roadmap WI23 字面「plan-check.mjs frontmatter 版 + pre-commit hook + CI job（结构子集 + audit track）」——`plan-check.mjs` frontmatter 版已由 M1/WI10 交付（本 plan 直接消费，非重做）；hook/CI 的「结构子集」= gate-check 单文件结构面（无 actor，02 §6 独立形态行）；「audit track」= gate-check 已注册规则中的回执绑定结构面（closure-audit-binding/roadmap-audit-binding 的 CI 面 = dispatch/accepted 同 id 配对不验证写者，02 §4.1 CI 行字面）——L2.5 段对 plan corpus 全量跑 gate-check 即同时覆盖两者。
- **模板消费者边界**：`.github/` 与 `verify-age.sh` 均不在 `install-age.manifest`——本 plan 新增的 `.githooks/` 与 CI 扩展同属 real-project 面，**不得**加入 manifest（模板消费者无 plugin/dsh、无 gate-check 可执行对象）；hook 与 CI 的 law 段在 policy/mission 缺失时必须 fail-open + 注记（02 §6 never-ran 项目手写文档合法——与 plan-status-gate D3 裁定同型姿态）。
- **roadmap 收口维护面（Deferred 触发条件命中）**：①`## Status Values` 表与 `Work Item Status` 导语的 `ready` 生命周期散文——00-roadmap-authoring-guide 2026-08-25 changelog 已退役该格式（done=勾选、ready 语义归 plan 侧），roadmap 未清理（deep-audit round-1 P2 + 0925-3 Deferred）；②roadmap 头部 `> Last Updated: 2026-08-24` 过期（round-2 P2——M2 收口回写时同步刷新）。
- **测试基线**：`pnpm --prefix tools/mission-driver test`（813 基线，执行时以当日实测为准且不得回退）+ `npm --prefix plugin/dsh test`；`./verify-age.sh` L1+L2 绿是本 plan 改动 CI 面后的自证通道。

## Goals

- pre-commit hook（`.githooks/pre-commit` + core.hooksPath 文档）：对暂存区内 plan 形 .md / roadmap / mission/policy 配置跑结构子集校验（gate-check 单文件面 + roadmap-check），fail-open 于 policy/mission 缺失语境（模板消费者合法面）。
- CI 接线：age-ci.yml 触发路径扩至账本与执法数据路径；law-gates 校验段并入聚合门（形态按 Phase 2 Decision 裁定），本地与 CI 保持同一入口。
- WI24 Verification Gate 执行：roadmap 字面 4 条命令真实绿（含 ≥30 真值表用例计数证据、真实 plan 的三硬门 pass、mission-check 含 policy 校验），全量输出记录进本 plan 收口证据。
- M2 收口回写：roadmap WI23/WI24 tick + 证据指针；Deferred 清偿（Status Values/ready 散文清理 + Last Updated 刷新）；M2 收口 sanity（unchecked 计数与 M3–M5 余量对账）。

## Non-Goals

- M3 守夜人对 trigger/机械验证的接管（gate 命令的自动化执行者演进）。
- `.githooks/`、CI 变更进 install-age.manifest（模板交付面不动——real-project 专用，边界已成文）。
- web-dist-check / release workflows 的任何改动。
- monitor 前端对 gate 结果的展示。
- M5 WI40 终局收口门（整 roadmap done 判定 + `grep -c "^- \[ \]"` = 0——本 plan 的 sanity 对账只到 M2 边界：unchecked = M3+M4+M5 全量 WI）。

## Task Route

- Type: `implementation-only change`（CI/hook 接线与收口执行——执法面本体已由前序 plan 交付，本 plan 是部署面接线 + Verification Gate 执行；无新契约设计）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md` §6（部署面三形态表：独立形态 = CI job + git pre-commit hook 结构子集）、`docs/backlog/age-autonomy-implementation-roadmap.md` WI23/WI24 字面、`verify-age.sh`/`.github/workflows/age-ci.yml` 头注（聚合门与本地=CI 同构纪律）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（同批次裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: M2 全部前序 plan 收口（0815-1/2/3、0925-1/2/3、0950-1/2）——gate 命令的可执行对象与 ≥30 真值表基线皆其交付面；Phase 1/2（hook 与 CI）可在 0950-2 后先行，Phase 3（WI24 执行）须全部前序收口。
- No infra prereqs beyond existing baseline（CI 已存在 runner 面；hook 为仓库内脚本 + 本地启用文档；零新增 npm 依赖）

## Phase 1 — pre-commit hook

Targets: `.githooks/pre-commit`（新）、`tools/mission-driver/CONTEXT.md`（启用文档——落点钉死 CONTEXT.md「构建与验证」段，不另开 README 面）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 0815-1（gate-check CLI）、0925-2（roadmap-check 字段集校验面）

- [x] `Decision` **hook 机制与触发面**：机制 = `git config core.hooksPath .githooks` + bash 脚本（零依赖纪律：无 husky——根无 package.json 且引入 npm 依赖违反引擎面约束的同等精神；启用是一次性本地配置，文档化进 CONTEXT.md「构建与验证」段）。触发面 = 暂存区（`git diff --cached --name-only`）中的：`docs/plans/**/*.md`（逐文件 `node tools/mission-driver/src/gate-check.mjs <file>` 结构子集面）、`docs/backlog/*.md`（逐文件 `node tools/mission-driver/src/roadmap-check.mjs <file>` 带参形态——**现状事实**：roadmap-check.mjs 今日是纯库模块（零 argv 处理，live 核实任意参数 exit 0 无输出；仅被 engine.js/monitor.js import）；带文件参、非法 roadmap 非零退出的 CLI 面是 `2026-08-25-0925-2` 的 Proof ③ 交付物（其对 roadmap-check 的字段集校验接线含 CLI 判定面）——hook 消费该交付后的形态，依赖经本 Phase Prereqs 声明，非本 plan 假设其已存在）、`missions/*.json`（`node tools/mission-driver/src/mission-check.mjs <file> .`）。fail-open 纪律：missions/ 无 mission 配置或 policy 缺失语境（模板消费者/never-ran 项目）→ 跳过对应段 + 注记退出 0（02 §6）；node 不可用 → 跳过 + 注记（hook 不得比仓库既有工具链更脆弱）。备选：拦全量 corpus 而非暂存区——否决，提交延迟不可接受且 CI 已有全量面。执行期注记（两则落地面裁定）：① legacy 形 plan（无 `---` frontmatter 块）注记跳过——WI22 `legacy-plan-freeze` 在无 actor 结构面按设计 fail-closed（corpus 未注入例外不可评估，54 份 legacy 冻结语料 live 实测全 deny），human git-commit 通道是 02 §2 A1 成文合法面，hook 不重复执法；② 无 `roadmapPath` 键的 base 配置（base.json 实测 mission-check exit 1）注记跳过——monitor.js `GET /api/configs` 过滤先例。
- [x] `Add` `.githooks/pre-commit` 实现上述裁定（bash，`set -euo pipefail`，逐段独立 fail-fast、段间注记分隔）；CONTEXT.md 增「pre-commit hook 启用」条目（一行 `git config core.hooksPath .githooks` + 作用面说明）。
- [x] `Proof` hook 面：干净仓库 `bash .githooks/pre-commit` exit 0（无暂存变更 = 空触发面）；暂存一份构造的违规 plan（如域外 checkbox / 畸形 frontmatter fixture）→ exit ≠ 0 且输出指向 gate-check reason；暂存一份构造的违规 roadmap（如缺 `audit-rounds` frontmatter 或畸形 checkbox 块 fixture）→ exit ≠ 0（backlog 段的负例——roadmap-check CLI 面消费 0925-2 交付，此场景同时是其接线回归）；暂存合法 plan → exit 0；临时移走 missions/ 目录模拟模板消费者 → exit 0 + 注记（fail-open 面）。命令：`bash .githooks/pre-commit`（各 fixture 场景）。实测（fixture 用后即弃）：五场景 exit 码 = 0 / 1（reason = plan-structure「"completed" is a derived status」deny）/ 1（fieldErrors = unknown field "note" + missing "audit-rounds"）/ 0 / 0（+ missions 段 fail-open 注记）；违规 plan 语料用 frontmatter 写派生态 `status: completed`（比域外 checkbox 更窄且确定性的 deny 面）。

Exit Criteria:

- [x] hook 五场景（空/违规 plan/违规 roadmap/合法/无 mission 语境）行为正确且退出码可脚本断言
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空；仓库根无新增 package.json / npm 依赖
- [x] `pnpm --prefix tools/mission-driver test` 全绿（hook 不触测试链，回归确认）——904/904 + prompt-check OK
- [x] `docs/logs/` 更新

## Phase 2 — CI 接线

Targets: `.github/workflows/age-ci.yml`、`verify-age.sh`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1（hook 语义先钉，CI 段与其同源）

- [x] `Decision` **law-gates 段的承载形态**：选择 = 扩展 `verify-age.sh` 增第三段「L2.5 law gates」，内容钉死为三面：① `node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml`；② 对 `docs/plans/age-autonomy/` **全量** plan corpus 逐文件 `gate-check.mjs <file>`（全量不抽样——merge-blocking 门禁不容非确定性子集；corpus 规模数十文件、纯函数秒级，全量无延迟顾虑）；③ `node --test plugin/dsh/test/law-truth-table.test.mjs`（显式独立调用，与 L2 段 `npm --prefix plugin/dsh test` 内含的同文件跑双轨——独立调用是 WI24 gate 字面的对齐面）。age-ci.yml 保持单 job 跑同一脚本。理由：头注纪律「Runs the same verify-age.sh developers run locally」的本地=CI 同构是既定契约，拆独立 job 会产生第二入口与漂移面。备选：age-ci.yml 增独立 `law-gates` job——否决（同构契约 + job 间 Node/pnpm setup 重复）。段内 fail-open：policy/mission 缺失 → 注记跳过（与 hook 同姿态，CI 在本仓库恒有 policy 故实际恒跑；模板面不消费此脚本）。执行期注记（corpus 面）：legacy 形 plan（无 `---` frontmatter 块——0635-1/2，全树 live 实测 54 份 legacy 冻结语料在无 actor 结构面全 deny）注记跳过——WI22 `legacy-plan-freeze` 按设计 fail-closed（corpus 未注入例外不可评估），CI 本身是该冻结面合法通道（02 §4.7 CI 支）；frontmatter 形语料全量逐文件必须 exit 0（全量不抽样纪律维持——每个文件都被处理，legacy 跳过是域外语义非抽样）。
- [x] `Add` verify-age.sh 增 L2.5 段（按 Decision；头注 L1/L2 描述同步 + gate 出处注记）；age-ci.yml 触发路径扩集：`docs/plans/**`、`docs/backlog/**`、`missions/**`、`.githooks/**`（push + pull_request 两侧对称）；workflow 头注同步。
- [x] `Proof` 接线面：本地 `./verify-age.sh` 全绿（L1+L2+L2.5）；构造违规 plan 后 `./verify-age.sh` exit ≠ 0（L2.5 段拦截证明——fixture 用后即弃，不入库）；`git diff --stat tools/mission-driver/src/engine.js` 为空。命令：`./verify-age.sh`。实测：三段全绿 exit 0（L1 904/904 + prompt-check OK、L2 223/223、L2.5 policy ok + 10 份 frontmatter corpus ok + 2 份 legacy 注记跳过 + 真值表 113/113）；拦截证明 = 合法 frontmatter + body 带 legacy 终态行 fixture（L1 905/905 容忍通过）→ L2.5 `DENY`（structural-9 legacy-plan-freeze reason）exit 1；首版探针（frontmatter 写派生态 `status: completed`）在 L1 段即被 `ledger-corpus.test.js` 语料钉扎拦截 exit 1（同一合法性属性双层钉住）；YAML 解析核对 + push/pull_request 对称断言通过。

Exit Criteria:

- [x] `./verify-age.sh` 三段全绿；违规 fixture 拦截证明记录
- [x] age-ci.yml 触发路径覆盖账本/执法数据/hooks 路径（YAML 结构核对）——push/pull_request 两侧对称，8 路径齐全
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿——904/904 + 223/223（verify-age 三段内含）+ web typecheck/lint:prompts 绿
- [x] `docs/logs/` 更新

## Phase 3 — WI24 Verification Gate 执行与 M2 收口回写

Targets: roadmap tick 回写、roadmap 头部维护、`docs/logs/`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: M2 全部前序 plan 收口（0815-{1,2,3}、0925-{1,2,3}、0950-{1,2}）+ Phase 1/2

- [x] `Proof` **WI24 gate 四命令真实执行**（全量输出贴入收口证据，任何一条红 = M2 不收口、本 plan 不闭环）：① `node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml`（roadmap 字面 check-policy 的落地形态，对齐注记见 Current Baseline）→ exit 0；② `node --test plugin/dsh/test/law-truth-table.test.mjs`（独立显式调用，与 L2.5 段同源）→ ≥30 用例 0 失败，用例计数与三硬门/配套门/护栏门覆盖清单逐类记录；③ `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/<当期已收口 M2 plan>` → 三硬门全 pass（语料选择注记理由）；④ `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` → exit 0（autonomyPolicy 字段经校验）。实测（2026-08-26，全输出摘要见 roadmap WI24 证据行 + docs/logs/2026/08-26.md Phase 3 条目）：① exit 0（valid=true，18 gates/7 triggers/4 agents）② **113 用例 0 失败**（三硬门 34 = binding 15 + writer-identity 10 + plan-completed 9；配套门 19 = nothing 4 + claim 7 + meter 4 + append-only 2 + verify-keys 2；护栏/结构面 60 含 actor 缺省结构子集 seam 5 + freeze 8 + p8 5）③ 语料 = `2026-08-25-0950-2-m2-wi22-evidence-face-rebuild.md`（选择理由：当期最新收口 M2 plan，回执对 + Verification pass 行齐全）→ exit 0，**三硬门 closure-audit-binding/writer-identity/plan-completed 全 allow** + 其余 6 结构规则 allow + workItem 对账 ok ④ exit 0（valid=true）。
- [x] `Add` M2 收口回写：roadmap WI23/WI24 tick + 证据指针（hook/CI 接线面 + gate 四命令输出摘要）；roadmap 头部 `> Last Updated` 刷新为收口日（round-2 P2 清偿）；`## Status Values` 表与 `Work Item Status` 导语 ready 散文清理（round-1 P2 + 0925-3 Deferred 触发条件命中——按 00-roadmap-authoring-guide 现行格式归一：done=勾选、状态语义引 plan 侧）；**Follow-up Backlog 对应两条 P2 行标注 absorbed-by 指针**（round-1 退役格式段条目与 round-2 Last Updated 条目——注明由本 plan Phase 3 清偿，防止 backlog 悬挂为 apparent-open）；M2 sanity 对账：`grep -c "^- \[ \]"` + `grep -c "^- \[x\]"` 之和 = **44** WI 全量（M1=11 + M2=17（含 WI41–WI44）+ M3=7 + M4=5 + M5=4，live 计数 2026-08-25 评审期 33+11=44 复核口径）、M2 收口后预期 28 `[x]` + 16 `[ ]` = 44（unchecked = M3+M4+M5 = 16；WI24 gate 不含全零断言——那是 M5/WI40 的语义，防越界 over-claim）。实测：28 [x] + 16 [ ] = 44 逐项一致；`grep -c "ready"` 仅余 2 命中且均为历史注记类（头部 Last Updated changelog 散文 :7 + Follow-up 已清偿条目划线文本 :157）；roadmap-check 改后复跑 exit 0。
- [x] `Add` `docs/logs/` 收口条目（gate 输出摘要 + M2 milestone 收口声明）；CONTEXT.md 增 CI 触发路径说明一行（Phase 2 的 workflow 头注/触发路径变更是其依据——部署面文档增量成立，落定而非条件式）。

Exit Criteria:

- [x] WI24 四命令真实输出全部记录且全绿（exit 0 / ≥30 计数证据 / 三硬门 pass 面）——113 计数 + 全 allow 面记录进 roadmap WI24 证据行与日志
- [x] roadmap WI23/WI24 `[x]` + 证据指针；Last Updated 刷新；Status Values/ready 散文清理完成（`grep -c "ready" docs/backlog/age-autonomy-implementation-roadmap.md` 仅余历史注记类命中，逐条列出——:7 头部 changelog「ready 散文退位」注记 + :157 Follow-up 已清偿条目划线文本）
- [x] M2 sanity 对账数字一致（44 全量 / M2 全勾 17 项 / M3–M5 余量 16）
- [x] `./verify-age.sh` 三段全绿；`pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿；`docs/logs/` 收口条目——904/904 + 223/223 + L2.5（policy/corpus/113 真值表）GREEN exit 0；web typecheck/build/lint:prompts 绿

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-1-04b606ef to ses_reviewer_6
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-1-04b606ef（独立评审 ses_reviewer_6：baseline 全实证（verify-age.sh/age-ci 触发路径/无 hooks 基建/manifest 边界/verify 键可解析/Deferred 触发条件命中/0815-1 gate-check --policy 裁定确认）；WI23+WI24 合 bundling 判定同意（同 batch 先例 + 共享收口判据）；阻塞项 = M2 sanity 算术 40 应为 44（M1=11 + M2=17 含 WI41–44 + M3=7 + M4=5 + M5=4；收口后 28 [x] + 16 [ ]）；已修：44 全量 + 分项拆解 + live 33+11 口径；非阻塞 6 项——或 子句措辞、node --test 对齐注记、corpus 钉全量、Targets 消歧、WI23 字面映射段、Follow-up absorbed-by 指针——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-2-cf4e25e4 to ses_reviewer_6
- 2026-08-25：iteration 2，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-2-cf4e25e4（独立复核：算术修复落地且独立重算一致（含 bold 前缀 gate WI 的 grep 口径说明）；七项非阻塞修复全部核实；新阻塞 = roadmap-check 论据陈述假事实（live 探针：纯库模块零 argv 处理、任意参数 exit 0；「bare 扫 missions 全集」不实）+ backlog 段无负例场景；已修：论据改写为真事实（库模块现状 + CLI 面是 0925-2 Proof ③ 交付 + 依赖经 Prereqs 声明）+ 第五 Proof 场景（违规 roadmap → exit ≠ 0）+ 杂空格与 CONTEXT.md 条目落定）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-3-61682f7c to ses_reviewer_6
- 2026-08-25：iteration 3，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-3-61682f7c（独立复核：三项 claimed 修复全部落地；新发现 = Phase 2 Proof 项在排版修正编辑中被意外删除（违反 guide Minimum Rule 10 / Anti-Slacking——scope 收窄未记录）+ 交付者引用误植 0950-2；已修：Proof 项逐字恢复 + 引用更正为 0925-2 单引）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-4-cd7817a3 to ses_reviewer_6
- 2026-08-25：iteration 4，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-4-cd7817a3（独立复核：Proof 项逐字恢复 + 空行归位 + Item Types 对齐 + 出口判据恢复产出项；引用更正落地；其余面与 iter3 批准态逐字节一致（算术/五场景/落定条目/frontmatter）；无新引入问题。非阻塞 1 项留任意后续触碰时顺带：Phase 2 Exit Criteria 头后空行归一）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=0c94b30ec341cc0858bbbb944a2feab6ee3a9c93de88aa8e769493eb065fb663 exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=0c94b30ec341cc0858bbbb944a2feab6ee3a9c93de88aa8e769493eb065fb663 exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-1-d236a475 to ses_auditor_2026-08-26-130203 models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-25-0950-3-m2-wi23-wi24-ci-wiring-m2-verification-gate-1-d236a475：approved——独立收口审计通过（2026-08-26，ses_auditor_2026-08-26-130203 引擎派发独立 subagent；单模型 exec/aud 同型按 policy `downgrade: single-model` 声明如实记录，承 0950-1/0950-2 先例）。① 计数域 21/21 全勾（Phase 1/2/3 各 7 项含 Exit Criteria）、零 `- [ ]` 残留、Draft Review Record 四轮回执在册（iteration 4 acceptable-as-is）。② Phase 1 工件实证（live）：`.githooks/pre-commit` 在位（可执行，3928B）且干净暂存面本审计实跑 exit 0；CONTEXT.md「构建与验证」段 pre-commit 启用条目 + `git config core.hooksPath .githooks` 一行文档在册。③ Phase 2 工件实证（live）：`verify-age.sh` 第三段 L2.5 三面（--policy / corpus 全量 / 真值表独立调用）在位；`.github/workflows/age-ci.yml` push/pull_request 两侧对称各 4 路径（`docs/plans/**`/`docs/backlog/**`/`missions/**`/`.githooks/**`）；单 job 本地=CI 同构保持（无第二入口）。④ Phase 3 回写实证（live）：roadmap WI23/WI24 `[x]` + 证据指针（hook 五场景 / L2.5 拦截双探针 / gate 四命令输出摘要）在册；`> Last Updated: 2026-08-26` M2 收口刷新；`grep -c "ready"` = 2 且均为历史注记类命中（:7 头部 changelog 散文 + :160 Follow-up 已清偿条目划线文本）；Follow-up 两条 P2 行 absorbed-by 指针在册；`docs/logs/2026/08-26.md` 收口条目在册。⑤ 命令复跑（本 run 实测 2026-08-26）：`pnpm --prefix tools/mission-driver test` 904/904 + prompt-check OK exit 0；`./verify-age.sh` L1+L2+L2.5 GREEN exit 0（插件 223/223 + policy ok + frontmatter corpus 10 份 ok 含本 plan + 2 份 legacy 注记跳过 + 真值表 113/113 ≥30）；双 pass 行 basisHash=0c94b30e…fb663 与 plan 当前 basis 一致。⑥ Deferred 诚实性：两项（hooks/CI 模板交付面、gate 命令守夜人自动化）均与 Non-Goals/baseline 裁定对应且重开条件成文，无 in-scope 缺陷藏匿 Deferred。结论：21/21 计数域全勾 + 双 pass 行 basisHash 绑定 + 本回执对同 id 配对，01 §5.2 完成派生公式五合取满足。

## Deferred But Adjudicated

### hooks/CI 面向模板消费者的交付

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: `.github/`、`verify-age.sh`、`.githooks/` 均不在 install-age.manifest（real-project 专用）；模板消费者无 plugin/dsh 与 gate-check 可执行对象，hook/CI 的 law 段对其恒 fail-open，无保护意义也无破坏面。
- Successor Required: no（条件触发：若未来模板决定内置轻量 plan-check hook，须 human 批准 manifest 变更后另立项）

### gate 命令的守夜人自动化执行

- Classification: `optimization candidate`
- Why Not Blocking Closure: WI24 的 gate 语义是「真实命令真实绿」，执行者是人/AI 会话或 CI 均满足；M3 守夜人接管后同批命令成为 trigger 常驻面，属演进非缺口。
- Successor Required: yes（M3/WI26 mechanical-verification trigger 立项时收编）
