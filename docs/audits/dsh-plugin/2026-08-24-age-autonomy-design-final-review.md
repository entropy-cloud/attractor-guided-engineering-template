# AGE Autonomy 设计基线终审报告（独立 subagent）

> Status: audit record（终审记录）
> Date: 2026-08-24
> Scope: `docs/design/age-autonomy/` 六文档 + `docs/backlog/age-autonomy-implementation-roadmap.md` + `missions/age-autonomy-implementation.json` + 相关现役代码与宿主源码
> Method: 独立 subagent（无会话种子，不采信前审/讨论记录结论），文件级核对 + 宿主能力源码复核
> Verdict: **conditional-pass**（无 P0；5 P1 + 7 P2 均不阻断立项；P1-1/P1-2 须在 M1/M2 立项首片关闭）
> 前审关系：`docs/audits/dsh-plugin/2026-08-24-age-autonomy-design-audit.md`（4 P0 + 25 P1）；grill `docs/discussions/2026-08-24-age-autonomy-design-independent-grill.md`（A1–A8）

## 1. Verdict 与一句话理由

六份设计文档互相一致，与 A1–A8 裁决对齐，前审 P0/P1 全部闭环；交叉引用、宿主能力事实、零引擎 diff 底线、roadmap WI 覆盖均经文件级核对。两处 A1/A2 落地后未跟随的痕迹：G3 成文义务未进 05-usage（P1-1）、02 §4.5 仍按「CAS 无法」的旧假设写（P1-2）。**不阻断 supported baseline 候选资格，但收口条件见 §2 剩余风险。**

## 2. 终审发现（subagent 原文要点）

### P0：无

### P1（M1/M2 立项首片处理）

| # | 位置 | 问题 | 处置 |
| --- | --- | --- | --- |
| P1-1 | 05-usage.md 全文 | A3 裁定「同一 checkout 单执行形态」成文义务未落地（grep 无命中） | **已收口**：05 §3.3 增边界行（本记录同日） |
| P1-2 | 02-rule-law.md §4.5 | 仍写「若宿主 edit 无法提供 CAS」——实际 CAS 存在但单槽被 fs-observation-policy 占据（源码核实：fs-observation-policy/src/index.ts:116-122 不调 next()；bundle/base/cordis.patch.yml:221-222 默认挂载） | **已收口**：§4.5 改写为三选一 + Q4 显式标记未裁决（本记录同日） |
| P1-3 | 02 §4.9 | fixedPrefix 块 schema 不完整（04 §5 用 kind: file/dir/maxFileBytes，02 未列） | **已收口**：§4.9 增块 schema（本记录同日）；WI13 测试用例覆盖 |
| P1-4 | tools/mission-driver/src/plan-check.mjs | 现役仍是 `> Plan Status:` 老格式解析（PLAN_STATUS_RE:30）——WI7/WI10/WI11 已承接，需确保双读过渡后 frontmatter 版也 exit 0 | 归 WI7 落地验证（不开新项） |
| P1-5 | mission-check.mjs + mission json | mission-check 不校验 policy 路径；mission json 未引用 `autonomy.policy.yml` | **部分收口**：mission json 增 `autonomyPolicy` 字段（本记录同日）；mission-check 校验实现随 WI13 |

### P2（随里程碑）

| # | 位置 | 问题 | 处置 |
| --- | --- | --- | --- |
| P2-1 | 02 §4.5 / 03 §5 / 01 §4.4 | G7 claim TTL 心跳：续期信号通道未定义 | M3 WI26（已增补充入 roadmap） |
| P2-2 | 02 §3 | G9 trigger 谓词语法未定义（and/or/not + 谓词集应受限）；R1–R4 硬编码在守夜人代码 | WI13 结构测试钉住（roadmap 已增补） |
| P2-3 | 01 §6 / 03 §7 | G10 failures 归因桶不区分（测试红 vs 执行者错 vs 命令过时） | M3 WI27（已增补） |
| P2-4 | M4 WI36 | G11 效率收益无真实观测项 | WI36 增观测项（不阻断；已增补） |
| P2-5 | 04 §2.4 | G4 角色互斥未成文（同一 session 跨 drafter/reviewer/auditor） | M4 WI32（已增补） |
| P2-6 | 01 §4.1 示例 | `agent: "audit-heavy"` 不在定义的名单里，易误导 | **已收口**：示例改 `agent: "auditor"` + 02 §4.9 增引用示例行 |
| P2-7 | 03 §2 receipt 行 | 「回执到发起会话/人工」与 A8「死会话投递失败成文接受」未同步 | **已收口**：03 §2 receipt 描述同步（本记录同日） |

## 3. 剩余风险清单

**P1 立项前**（P1-1/P1-2/P1-3/P2-6/P2-7 文档级已收口，P1-5 校验实现随 WI13）：无阻塞项。

**可随里程碑**：G7 claim 心跳（M3）、G9 trigger 语法（M2 WI13）、G10 归因桶（M3 WI27）、G11 收益观测（M4 WI36）、G4 角色互斥（M4 WI32）。

**已结（对账）**：前审 6 P0 + 25 P1 全部确认闭环；A1–A8 全部落地确认（A3 的成文义务例外 → P1-1 已补）；宿主两未知数（actor= `exec.agent?.id`、CAS=单槽被占）源码确认；partial/blocked EXIT_MAP 纪律三处一致；trigger DSL 迁移与存量迁移由 WI7/8/9/10/13/22/24/26/31 承接；「候选最终版」status 与 human approval 前置四处成文。

## 4. 终审后立即收口（本记录同日，subagent 交付后）

1. 05-usage §3.3 增 A3 边界行（P1-1）；
2. 02 §4.5 改写为 CAS 三选一 + Q4 未裁决标记（P1-2）；
3. 02 §4.9 增 fixedPrefix 块 schema + plan 级 agent 引用示例（P1-3/P2-6）；
4. 01 §4.1 示例 `agent: "audit-heavy"` → `agent: "auditor"`（P2-6）；
5. 03 §2 receipt 描述同步 A8（P2-7）；
6. missions/age-autonomy-implementation.json 增 `autonomyPolicy` 字段（P1-5 数据面）；
7. roadmap WI13/WI26/WI27/WI32/WI36 增补终审映射项（P1-3/P1-5/P2-1/P2-2/P2-3/P2-4/P2-5）。

## 5. 转 supported baseline 的技术建议（subagent 原文）

推荐 conditional-pass；候选基线骨架正确、自审闭环；两处 P1 文档级收口后（已收口）不再有阻断项。**最终批准仍属 human 行为**：AI 修改过的 owner 文档不能自行转 supported baseline（ai-autonomy-policy）；六文档 status 行「目标设计基线（候选最终版）」待 human 一句话确认后统一转「supported baseline（人类批准）」。

## 6. 诚实标注

已读：六设计文档全文、roadmap 全文、mission json、前审、grill 全文（277 行）、ai-autonomy-policy 全文、plan-check/mission-check/exit-map/native-executor/plan-status-gate 关键文件、宿主源码（pre-execute/Agent/ModelSelection/fs types/edit-intent/observation-policy/bundle patch）。未读（不影响判定）：现役引擎核心 js（零引擎 diff 底线不要求）、plan 指南（M1 触发）、audit prompts 本体（WI 阶段使用）、`.test.mjs` 断言体。