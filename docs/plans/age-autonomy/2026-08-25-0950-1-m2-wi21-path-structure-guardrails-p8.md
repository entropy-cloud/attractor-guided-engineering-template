---
status: active
mission: age-autonomy-implementation
work-item: M2-WI21
group: "2026-08-25-0950"
verify: [test, verify-age]
---

# 2026-08-25-0950-1 M2 路径与结构护栏 + 执法层自护 P8（age-autonomy M2-WI21）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI21；契约 owner `docs/design/age-autonomy/02-rule-law.md` §4.7（路径与结构护栏 + P8 执法层自护）、§6（部署面与上线纪律）
> Related: 前置 `2026-08-25-0815-{1,2,3}`（law 内核/注册表/policy/三硬门与终态冻结——本 plan 在其注册表落护栏与自护规则）；同批执行顺序：本 plan（N=1）→ `2026-08-25-0950-2`（N=2，WI22 证据面重建——其落点含 law 文件族，须在本 plan 的 P8 例外通道就位后执行）→ `2026-08-25-0950-3`（N=3，WI23+WI24 CI 接线与 M2 收口门）；`2026-08-25-0815-3` Non-Goal 显式移交：「复合 work-item 标签约定……留给 WI21 立项时定」——本 plan 兑现

## Current Baseline

**路径与结构护栏是 02 §4.7 的唯一未立项面：work-item 只查非空字符串不查 roadmap 注册、plan 落盘位置无域约束、roadmap 写回无注册项护栏、执法层自身（law 实现/policy/执法 CLI）对 AI 写零防护。本 plan 在 0815 批次的 law 注册表上把这四块落成规则。**（以下事实 2026-08-25 live 核实；0815 批次尚未执行——其交付面以 plan 文字为准，本 plan 的 Prereqs 保证执行序）

- **work-item 注册面现状**：`validatePlanFrontmatter`（ledger-frontmatter.mjs）对 `work-item` 只校验非空字符串；roadmap 侧注册表机器面已就绪——`scanRoadmapLedger`（ledger-sections.mjs:324-360）按里程碑块提取 `workItems[]`（`WI_ID_RE` :21 `\bWI(\d+)\b` → `id: "WI<n>"`、`checked`、`line`），milestone 块携带 `number`。**跨文件消费为零**：无任何代码把 plan frontmatter `work-item` 与该注册表对账。
- **work-item 标签语料（裁定输入，0815-3 Non-Goal 显式移交）**：frontmatter 语料 live 计 10 份（含本 plan）：0635-3（`M1-WI4+WI7+WI8+WI9+WI10+WI11`）、0815-{1,2,3}（`M2-WI12+WI13` / `M2-WI14+WI15+WI16` / `M2-WI17+WI18+WI19+WI20`）、0925-{1,2,3}（`M2-WI41` / `M2-WI42+WI44` / `M2-WI43`）、0950-{2,3}（`M2-WI22` / `M2-WI23+WI24`）、本 plan（`M2-WI21`）——首 token 携 `M<n>-` 前缀、后续 token 为裸 `WI<m>` 继承同里程碑。另有 legacy 语料 2 份（0635-1 `M1-WI1+WI2`、0635-2 `M1-WI3+WI5+WI6`，`> Work Item:` 头行形态）经双读通道读取——只作语法形态输入，不进注册对账面（legacy 文件无 frontmatter）。语法未被任何校验器钉住。
- **路径域现状**：02 §4.7「plan 文件只能落在 mission 配置的 plansDir 域内」无实现。被动扫描 `missions/*.json` 收集 plansDir 的先例 = plan-status-gate.ts `knownPlansRootsAt`（:258-278，含默认 `docs/plans` 根 + missions 各自 plansDir，malformed mission 贡献零根）。域外写入 plan 形文件（携合法 plan frontmatter 的 .md）今日无拦截。
- **one-mission-one-roadmap 边界现状**：01-file-ledger「边界」条（:30）——「一个 roadmap 只归属一个 mission（mission config 的 roadmapPath 唯一反向对应）」——无任何校验面（mission-check 不查跨 mission 唯一性；本仓库 missions/ 下多份 mission 各持不同 roadmapPath，现状合规）。
- **roadmap 写回护栏现状**：02 §4.7「roadmap 写回只能改已登记 work-item 的 checkbox」无实现。**与回写实践的张力须裁定**：roadmap guide（`docs/backlog/00-roadmap-authoring-guide.md`:66）规定 AI 回写 = 勾选 checkbox 且**结构性变更（新增/删除/重排 milestone 或 WI）须 human 审**；但 M1 以来的实际回写在 WI 行内追加证据指针（同行内容变更，非纯勾选），且 deep-audit findings=items 经引擎 DRAFT 步落成新 WI 行（WI41–WI44 即实例）。字面「只能改 checkbox」与既成实践冲突，护栏语义须按实践钉住而不是按字面误杀。
- **执法层自护（P8）现状**：02 §4.7 P8——`plugin/dsh/src/law/**`、`missions/autonomy.policy.yml`、`tools/mission-driver/src/{plan-check,gate-check}.mjs` 对 AI 写一律 deny，合法例外 = 人工 / CI / 已批准立项。当前 `plugin/dsh/src/` 无 law/ 目录、missions/ 无 autonomy.policy.yml、src/ 无 gate-check.mjs（0815-1 批次交付面）——P8 规则落地时这些路径已存在，规则本身不依赖其内容形状。02 §2 信任模型：P8 是唯一**无条件对抗级**的面（不走护栏强度降级）；02 §6 上线纪律的 observe-first 爬坡不适用于它。
- **「已批准立项」例外的机器面空白**：P8 例外的第三支（已批准立项）需要可判定判据。本仓库可结构判定的近似：存在 `status: active` 的 plan（经独立 draft review，见 00-guide Plan Status Flow）其正文（Phase Targets 或 body）显式列出目标路径。M2 无守夜人，这是唯一零新机制的可判定面；精确到「active plan 声明的 Targets 含该路径」。
- **终态冻结归属**：roadmap WI21 文字含「终态冻结」，其契约本体 = 02 §4.3（硬门 3），0815-2 Phase 3 已实现——本 plan 只消费不重实现（0815-2 Non-Goal 双向成文）。
- **测试通道**：engine `tools/mission-driver/test/*.test.js` 进 L1 链（813 基线，执行时以当日实测为准且不得回退）；plugin `plugin/dsh/test/law-truth-table.test.mjs` 由 0815-1 创建、0815-2/3 增补——本 plan 继续增补（WI24 gate ≥30 的组成部分）。law 内核/policy 改动后须 `node plugin/dsh/scripts/build-bundle.mjs` 重建 assets（freshness check）。

## Goals

- `work-item-registered` 校验：复合标签语法钉住（`M<n>-WI<a>(+WI<b>)*`，后续 token 裸 `WI<m>` 继承里程碑；兼容显式重复前缀形态）+ 每 token 命中 `scanRoadmapLedger` 注册表对应里程碑的 WI——接进 law 结构规则面与 gate-check CLI 面（存量 frontmatter 语料 10 份（含本 plan）全过，构造反例全 deny）。
- `path-guardrail` 规则：携合法 plan frontmatter 的 .md 写入只允许落在注册 plansDir 域内（missions/*.json plansDir ∪ 默认 `docs/plans` 根，被动扫描先例承袭）；域外 → deny + reason 指向 plansDir。
- one-mission-one-roadmap 边界校验：policy/mission 加载面校验 `roadmapPath` 跨 mission 唯一反向对应，违例 = 加载错误（fail-fast，非写入时拦截）。
- roadmap 写回护栏：允许勾选翻转与已注册 WI 行内的证据注记追加；deny 未注册 WI 行的新增/删除/改写与 milestone 结构变更（除非 actor ∈ {engine, supervisor} 或已批准立项——deep-audit findings 落 WI 的引擎路径合法）。
- `law-self-protection`（P8）规则：四类保护路径（law 实现 / policy / 执法 CLI plan-check+gate-check）对 AI 写 deny；合法例外 = 02 §4.7 字面的三支——人工（actor role = human）/ CI（无 actor 结构子集面，映射见 Phase 3 Decision）/ 已批准立项（存在声明该路径为 Target 的 active plan）。直接 enforce（02 §2/§4.7 授权：P8 无条件对抗级，不走 observe 爬坡）。
- `law-truth-table.test.mjs` 增补本批规则用例（向 WI24 ≥30 推进）；CONTEXT.md 增护栏行；roadmap WI21 tick 回写。

## Non-Goals

- 终态冻结实现（0815-2 Phase 3 交付，本 plan 消费）。
- 证据面重建与 plan-status-gate 迁移/退役（WI22 / 同批 N=2）；pre-commit hook 与 CI 接线（WI23 / 同批 N=3）；WI24 收口门（同批 N=3）。
- monitor 显示面的 work-item/路径校验呈现（display-only，无回执/路由后果）。
- 守夜人 trigger 执行与 mdcontrol.unlock/disposition 路由（M3）。
- `.github/workflows/**`、`verify-age.sh`、`install-age.manifest` 任何改动（本 plan 不触 CI/模板交付面）。
- P8 保护路径清单的扩张（如把 ledger-*.mjs 加入保护）——清单以 02 §4.7 字面为准，扩张须设计 owner-doc 变更另立项。

## Task Route

- Type: `architecture change`（法律层护栏与自护规则：新增 deny 面 + 跨文件注册校验）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md` §4.7/§2/§6、`docs/design/age-autonomy/01-file-ledger.md` §2（frontmatter 子集）/边界条（:30）、`docs/backlog/00-roadmap-authoring-guide.md`（roadmap 回写纪律 :66）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（默认审计 prompt 面向 plan/roadmap 审计，非架构实现；同 0815/0925 批次裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-25-0815-{1,2,3}` 全部落地（law 内核注册表 / policy 实例 / 三硬门与终态冻结 / truth-table 文件存在）。
- No infra prereqs beyond existing baseline（不改 engine.js、不新增 npm 依赖、不触 CI 触发路径；`missions/autonomy.policy.yml` 增 gate 条目属 0815-1 Phase 2 成文的合法演化面——经本 plan 的 Add 项，非随手改）

## Phase 1 — work-item 注册面：复合标签裁定与注册谓词

Targets: law 内核（注册谓词 + 规则接线）、`missions/autonomy.policy.yml`（gate 条目）、`plugin/dsh/test/law-truth-table.test.mjs`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 0815-1 全部 Phase（注册表与 policy 加载在 Phase 1/2；gate-check CLI 单文件评估面是 Phase 3 交付——本 Phase 的 CLI 接线项消费之）

- [x] `Decision` **复合 work-item 标签语法钉住**（0815-3 Non-Goal 移交项）：合法形态 = `M<n>-WI<a>` 单项 或 `M<n>-WI<a>+WI<b>+...` 复合——首 token 携里程碑前缀，后续 token 裸 `WI<m>` 继承同里程碑；后续 token 显式重复 `M<n>-` 前缀的形态**接受**（等价展开，防语料分歧误杀）。每个展开后的 `M<n>-WI<m>` 必须命中 `scanRoadmapLedger` 注册表中里程碑 `M<n>` 的已登记 WI id。备选：强制每 token 全前缀——否决，frontmatter 语料 10 份（含本 plan）的后继 token 均为裸形态，会全量误杀。残险：里程碑号写错但 WI 号存在的跨里程碑错挂（如 `M3-WI21`）——由注册表的 (milestone, id) 二元组匹配消解，错挂即 deny。
- [x] `Add` 注册谓词 `workItemRegistered(label, roadmapScan)`（law 内核纯函数）：标签展开 + (milestone, WI id) 二元组对账，返回命中明细或 deny reason（含未命中 token 与注册表合法集提示，02 §2 结构化 deny 纪律）；接进 plan-structure 规则的校验链（0815-1 种子规则的增项：proposedContent frontmatter `work-item` 逐 token 对账 ctx 内 roadmap 扫描结果）。
- [x] `Add` gate-check CLI 面单文件评估携带注册对账结果（结构子集面：路径在 plansDir 域内的存量 plan 全量校验，输出 registered/missing 明细）；存量 frontmatter 语料 10 份（含本 plan，见 Current Baseline 清单）全过（live 对账断言）。
- [x] `Proof` 真值表：合法单项/复合/显式重复前缀；未知 WI 号、错挂里程碑、空展开、畸形分隔符（`WI12+`、`+WI12`）；roadmap 扫描结果注入的反例（注册表空/里程碑缺失时的 fail 行为）。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs` + `pnpm --prefix tools/mission-driver test`。

Exit Criteria:

- [x] 存量 frontmatter 语料 10 份注册对账全 pass（`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/<file>` 抽验 ≥3 份含复合标签）
- [x] 构造反例（未知 WI / 跨里程碑错挂）在写面与 CLI 面均 deny 且 reason 指向注册表
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿
- [x] `docs/logs/` 更新

## Phase 2 — 路径护栏、one-mission-one-roadmap 与 roadmap 写回护栏

Targets: law 内核（path-guardrail / roadmap-write-guard 规则）、policy 加载面（roadmapPath 唯一性校验）、`plugin/dsh/test/law-truth-table.test.mjs`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1（注册谓词是写回护栏「已登记」判定的输入）

- [x] `Decision` **plan 形文件的判定面**：path-guardrail 拦截目标 = 写入 `.md` 文件且 proposedContent 经 frontmatter 解析命中 plan 字段集特征（`status` + `mission` + `work-item` 三键齐备即视为 plan 形，宽松于全字段——非 plan 文档不会巧合三键齐备）。域 = 被动扫描 `missions/*.json` 的 plansDir 值 ∪ 各祖先默认 `docs/plans` 根（承袭 plan-status-gate `knownPlansRootsAt` 先例，malformed mission 贡献零根）。备选：拦一切含 YAML frontmatter 的 .md——否决，00-guide/00-roadmap-guide 等带 frontmatter 的非 plan 文档会被误杀。legacy `> Plan Status:` 形 plan 的域外写入不在本规则面（legacy 冻结收编归 N=2/WI22 裁定）。**残险（成文）**：跨 mission 弱化——域是全 mission plansDir 并集而非 per-mission 域，plan 形文件写入另一 mission 的 plansDir 不会被本规则拦（02 §4.7 字面是「mission 配置的 plansDir 域内」的 per-mission 强读法）；M2 采并集域是 passive-scan 先例下的最小实现，per-mission 强读法需要 proposedContent `mission` 字段与落盘域的交叉校验，误杀面（合法跨域引用）未经验证——列为后续收紧项（见 Deferred），CI 结构面兜底。
- [x] `Add` `path-guardrail` 规则：plan 形 .md 写入路径不在注册域内 → deny + reason 指向合法 plansDir 集域内写、域外不写。新建与改写同拦（proposedContent 判定对两者等价）。
- [x] `Add` one-mission-one-roadmap 校验（policy/mission 加载面，fail-fast）：扫描 missions/*.json 的 roadmapPath，同一 roadmap 被多 mission 声明 → 加载错误（结构化报错指明冲突 mission 名；01 :30 边界条契约）。本仓库现状合规（live 各 mission roadmapPath 互异），构造 fixture 钉住。
- [x] `Decision` **roadmap 写回护栏语义（字面 vs 实践裁定）**：允许 = 已注册 WI 行的勾选状态翻转 + 该行内追加证据注记（M1 以来回写实践，roadmap guide :66 AI 回写纪律的既成解释）；deny = 新增/删除 WI 行、改写 WI 行首的 WI id、增删改 milestone 标题行，除非 actor ∈ {engine, supervisor}（deep-audit findings=items 经引擎 DRAFT 步落新 WI 的合法路径——02 §2 role enum 内的合法角色；DSH 面 flow 步会话到 role 的映射依 0815-1 Phase 1 actor 裁定，映射不可得时该例外退化为 unverified-writer 注记）或已批准立项（active plan 声明 roadmapPath 为 Target）。备选 A：02 §4.7 字面「只能改 checkbox」——否决，证据指针追加是 roadmap guide 实践且 M1 全量回写依赖之，字面执行 = 全量误杀；备选 B：完全不拦 roadmap 结构变更——否决，注册表是 Phase 1 注册谓词的根基，根基可被随手改则注册校验空转。残险：WI 行内恶意改写非注记内容（如改 WI 描述文字）不在此拦——对账面归 CI 结构校验与 git 归因（A1 护栏强度，02 §2 成文漏杀面）。
- [x] `Add` `roadmap-write-guard` 规则：按上述裁定实现（proposedContent 与 currentFileState 的 WI 行集合比对：id 集合不变 ∧ 勾选只 [ ]→[x] ∧ 行内变更限定为尾部追加——首 token 前缀字节保持）。
- [x] `Proof` 真值表：path-guardrail（域内新建/改写 allow、域外 plan 形 deny、域外非 plan 形 .md allow、三键不齐备不拦）；roadmap-write-guard（勾选翻转 allow、行内证据追加 allow、新增 WI 行 engine actor allow / drafter actor deny、删行 deny、改 id deny、milestone 标题改写 deny）；roadmapPath 唯一性（合规 pass / 冲突 fixture fail-fast）。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs`。

Exit Criteria:

- [x] 全部真值表用例判定正确，deny reason 指向合法路径
- [x] 本 roadmap 真实语料抽验：勾选翻转与证据注记追加两形态 allow（构造 fixture，不实际改 roadmap）
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿
- [x] `docs/logs/` 更新

## Phase 3 — P8 执法层自护、姿态裁定与回写

Targets: law 内核（law-self-protection 规则）、`missions/autonomy.policy.yml`（本批 gate 条目注册）、`plugin/dsh/test/law-truth-table.test.mjs`、`tools/mission-driver/CONTEXT.md`、roadmap tick 回写
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1/2（规则注册序）

- [x] `Decision` **P8 直接 enforce 授权与例外集字面钉住**：`law-self-protection` 注册即 `mode: enforce`——授权 = 02 §2 信任模型（P8 是唯一无条件对抗级，不走护栏降级）+ §4.7 字面；observe 爬坡对自护规则无意义（observe 期间被执法者可改执法者，爬坡本身就是漏洞窗口）。**例外集 = 02 §4.7 字面三支：人工（actor role = human）/ CI / 已批准立项——`engine` 不入例外集**：roadmap 与 02 §4.7 的例外字面均无 engine，且本批全部合法写入面（0815-1 的 policy Add、0950-2 的 law/policy 写入、本 plan 自身落地）均由「已批准立项」支覆盖（active plan 正文含目标路径字面），把 engine 加进例外只会无条件放宽对抗级面而无任何需求方——不加。「CI 支」的机器面映射：CI 无 actor（02 §2 结构子集），其合法性由部署面承载（CI runner 的写入不经 pre-execute 拦截面——与 hook/CI 接线后「CI 是唯一机器字段写者」的 M3 演进方向一致；同一边界等价地适用于人类经 git commit 而非 DSH 宿主的写入——02 §2 A1 裁定的成文漏杀面，非本规则独有）；结构子集面（gate-check CLI）对保护路径的判定 = 纯结构条件。「已批准立项」例外的机器面 = 存在 `status: active` 的 plan 其正文显式含目标路径字符串（Phase Targets 或 body；结构近似，M2 无守夜人下的唯一零新机制判据）。备选：例外的精确判据（plan Phase Targets 逐条解析）——列为执行期可收紧项，首版字符串包含即可（防过松：reason 记录命中的 plan 文件与行）。
- [x] `Add` `law-self-protection` 规则：保护路径集 = `plugin/dsh/src/law/**`、`missions/autonomy.policy.yml`、`tools/mission-driver/src/plan-check.mjs`、`tools/mission-driver/src/gate-check.mjs`（02 §4.7 字面，路径按 mission/projectRoot 上下文解析）。写入命中且不满足例外（actor role = human ∨ active-plan 引用）→ deny + reason 列出可援引的例外通道。结构子集面（无 actor）的判定分解：身份依赖例外（human）退化为 unverified-writer 注记不 deny 不冒充；**actor 无关条件保持可判**——保护路径 ∧ 无 active-plan 引用 → 结构面亦 deny（「已批准立项」支本身是结构事实，不依赖 actor）。**自指注意**：本规则自身落地的写入（law 内核新文件 + policy 增条目）由本 plan 的 active 状态构成「已批准立项」例外——规则的第一个合法消费者是它自己的宿主 plan。
- [x] `Add` 本批三规则（work-item 对账并入 plan-structure 增项 + path-guardrail + roadmap-write-guard + law-self-protection）注册进 `missions/autonomy.policy.yml`（姿态：path-guardrail/roadmap-write-guard/work-item 面 = enforce——窄域可判定事实，同 0815-3 Phase 1 四门禁裁定的①②③论证；law-self-protection = enforce，P8 授权）；CONTEXT.md 增护栏与自护行。
- [x] `Proof` 收口：真值表累计用例数与覆盖清单记录（向 WI24 ≥30 推进，gate 验收归 N=3）；P8 反例（executor 角色改 policy / 改 law 内核 / 改 gate-check.mjs → deny；援引 active plan fixture → allow；human actor → allow；engine role 改 policy → deny——例外集字面钉住的反向用例）；存量 corpus 无误杀（gate-check 对 docs/plans/age-autonomy/ 全量 + docs/plans/00-guide：本 plan 不改这些文件，评估面只读）。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs` + `pnpm --prefix tools/mission-driver test` + `./verify-age.sh`。
- [x] `Add` 文档同步与回写：roadmap WI21 tick + 证据指针（规则模块 + truth-table 路径 + corpus 输出；**残项注记**：「已批准立项」例外判据为结构近似（active plan 引用字符串），精确化归 M3 守夜人统一落盘路径；02 §4.7 保护清单与 0815-1 law 内核放置裁定的字面错位指针——见 Deferred「law 内核 P8 覆盖缺口」，防 roadmap 侧丢线索）；`docs/logs/` 收口条目。

Exit Criteria:

- [x] P8 四路径反例全 deny 且例外通道（active plan 援引）可过；规则自身落地经例外通道完成（自指一致性）
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` + `./verify-age.sh` L1+L2 全绿
- [x] roadmap WI21 `[x]` + 证据指针；`docs/logs/` 收口条目

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8-1-120131f8 to ses_reviewer_4
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8-1-120131f8（独立评审 ses_reviewer_4：baseline 抽查全实证、依赖链无环；阻塞项 = P8 例外集含 `engine` 无契约依据（02 §4.7 字面三支无 engine，全部合法写入面由已批准立项支覆盖）+ 复合标签语料口径不实（legacy 头行误计为 frontmatter 语料，漏 0950-{2,3} 标签）；已修：例外集收窄为字面三支 + engine 反向真值表用例、语料重述为 10 份 frontmatter（含本 plan）+ legacy 降为双读语法输入；非阻塞 4 项——Phase 1 Prereqs 补 Phase 3、结构面自相矛盾句重写、per-mission 域弱化残险成文（Phase 2 Decision + Deferred）、law 内核 P8 覆盖缺口 Deferred（successor = 02 §4.7 owner-doc 同步）——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8-2-444c1069 to ses_reviewer_4
- 2026-08-25：iteration 2，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8-2-444c1069（独立复核：两项阻塞修复落地且 sound（例外集三支 + CI 映射成文 + 结构面判定分解自洽；语料清单 live 复核准确）；残留 = Goals 与 Phase 1 Decision 两处「9 份」未随口径更新；已修：两处统一为 10 份；非阻塞 2 项——CI 映射补 human git-commit 边界对称注记（02 §2 A1）、tick 回写残项注记补 02 §4.7 错位指针——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8-3-7af98548 to ses_reviewer_4
- 2026-08-25：iteration 3，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0950-1-m2-wi21-path-structure-guardrails-p8-3-7af98548（独立复核：语料计数全文件一致（Baseline/Goals/Decision/Add/Exit 五处均 10 份）；CI 映射边界注记与 tick 回写指针落地；checkbox 纪律/frontmatter/无 scope 漂移复核通过；无新引入问题）

## Verification

## Closure

## Deferred But Adjudicated

### monitor 显示面的 work-item 注册对账呈现

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: monitor plans 列表为显示面，无回执/路由后果；注册对账的执法面（law + gate-check CLI）已覆盖判定需求。
- Successor Required: no（条件触发：monitor extends 合并 P2 修复时的顺带增强面）

### path-guardrail 的 per-mission 强读法收紧

- Classification: `watch-only residual`
- Why Not Blocking Closure: M2 落地的是全 mission plansDir 并集域（passive-scan 先例下的最小实现）；跨 mission 弱化面（plan 形文件写入另一 mission 的 plansDir）由 CI 结构面兜底，无已知活语料触发。
- Successor Required: no（条件触发：出现跨 mission 域错放实例，或 M3 守夜人引入 mission 上下文强校验时）

### law 内核（引擎侧规则实现本体）的 P8 覆盖缺口

- Classification: `watch-only residual`
- Why Not Blocking Closure: 0815-1 Phase 1 裁定 law 内核落引擎侧（`tools/mission-driver/src/` 零 import 模块），而 02 §4.7 P8 保护清单字面只列 `plugin/dsh/src/law/**`（宿主适配层）——规则实现本体（引擎侧模块）不在字面保护集内。这是设计 owner-doc 与落地裁定的既有错位（先于本 plan），本 plan 按 02 字面执行不扩张清单（Non-Goal 成文）；引擎侧模块受「已批准立项 + CI + git 归因」既有纪律保护。
- Successor Required: yes（02 §4.7 保护清单与 0815-1 放置裁定的 owner-doc 同步——归 M5 WI39 docs 一致性收口或独立 doc-sync 立项）
