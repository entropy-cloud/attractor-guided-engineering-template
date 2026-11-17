# AGE 模板 v2 重构分析报告

- 日期：2026-11-17
- 状态：Proposal（待拍板后进入实施）
- 证据基线：`c:/workspace/cobol-robot`、`c:/can/nop/cobol-simulator`、`c:/can/nop/nop-entropy`、`c:/can/nop/nop-chaos-flux` 四个由本模板适配出的真实项目 + 模板本体现状扫描
- 目标：回答"模板哪里与真实项目不匹配"，并给出 v2 重构方案

---

## 1. 背景与问题陈述

模板当前 `docs/` 有 **21 个一级子目录** + index.md，AGENTS.md 190 行、含 15 条 Operating Rules 和 15 个目录的所有权声明，`.opencode/skills/` 只有 mission-driver 一个技能，mission-driver 引擎以"引用不复制"（`MISSION_DRIVER_HOME` shim）方式接入。

四个适配项目反馈的核心痛点：

1. **目录太多、与自己的项目不匹配**——每个项目都自己砍目录，且砍法各不相同，交叉维护成本高；
2. **mission-driver 不是人人要**——四个项目里一个彻底剔除、一个休眠、两个在用但接入方式各异且都有死链；
3. **"引用不复制"的引擎接入在真实环境会断链**；
4. **指南散落**——各目录内的 `00-*-guide.md` + `docs/process/` + `docs/references/` 三处并存；
5. **技能没有分层**——通用技能（git-master 等）在多个项目里被手工重复拷贝。

## 2. 证据基线：四个项目的实际落地数据

### 2.1 目录使用频率（文件数 / 近期活跃度）

| 模板目录 | robot | simulator | entropy(ai-dev/) | chaos | 结论 |
| --- | --- | --- | --- | --- | --- |
| plans | 198 ★ | 1561 ★ | 1097 ★ | 700 ★ | 四仓全部日用主力 |
| audits | 102 ★ | 346 ★ | 1204 ★ | 473 ★ | 四仓全部日用主力 |
| analysis | 64 ★ | 192 ★ | 383 ★ | 664 ★ | 四仓全部日用主力 |
| design | 39 ★ | 164 ★ | 304 ★ | （砍掉，并入 components/） | 3/4 日用 |
| architecture | （无，并入 design） | 20 ★ | （砍掉，并入 design） | 91 ★ | 2/4 日用，2/4 合并入 design |
| backlog(roadmaps) | 55 ★ | 124 ★ | 47 ★ | 21 ★ | 四仓全部在用（主力是 roadmap） |
| bugs | 46 ★ | 152 ★ | 35 ★ | 189 ★ | 四仓全部日用 |
| logs | 96 ★ | 149 ★ | 177 ★ | 156 ★ | 四仓全部日用 |
| requirements | 10 ▽ | 21 ▽ | （砍掉） | （砍掉） | 低频，但概念上不可缺 |
| lessons | 14 ▽ | 12 ▽ | 17 ▽ | （砍掉） | 普遍低频 |
| retrospectives | （无） | 5 ▽ | （砍掉） | （砍掉） | 3/4 弃用 → 应按需创建 |
| discussions | 1 ✗ | 35 ✓ | 5 ✓ | 26 ✓ | 分化，按需创建 |
| input | — | 18（加工管线） | 1 ✗（改名 inputs） | 0 ✗（纯空壳） | 3/4 近空壳 → 按需创建 |
| examples | — | 10 | （砍掉） | 6 | 边缘 |
| process | 9 | 5 | （砍掉） | （砍掉） | 内容应并入 guides |
| references | 13 | 93 ✓ | 10 | 54 ✓ | 中频，与 guides 语义重叠 |
| articles | — | — | 14 | 23 | 模板自留，不该随拷贝分发 |
| archive | — | 239（轮转） | 1 ✗（与 archived/ 212 重复并存） | 1276 | 机制可留，目录按需创建 |
| **guides** | **69 ★（项目自创）** | — | — | — | **robot 自己发明了 docs/guides 且重度使用** |
| skills | .agents/skills 22 ★ | docs/skills 27 ★ | ai-dev/skills 25 ★ | docs/skills 29 ★ | 四仓全部重度使用（位置不统一） |

★ = 日用（近期仍有新增）；▽ = 低频；✗ = 空壳/近空壳

**关键事实：**

- 模板本体自己的 `docs/archive/`、`docs/lessons/` 只有 README（空壳），`docs/input/` 近空壳——模板自己都没用起来的目录却随拷贝分发；
- chaos 的 `docs/input/` 是纯空目录；entropy 把 input 改名 inputs 只放了 1 个文件——同一个模板目录被两个项目各自"不彻底地"处理；
- 四个项目砍掉的目录集合互不相同（entropy 砍 6 个，chaos 砍 5 个另增生 8 个自有目录），**证明 21 目录的默认骨架对谁都偏大**；
- AGENTS.md 适配后膨胀：robot 588 行 / entropy 269 行 / chaos 289 行 / simulator 215 行（最接近模板原味）。

### 2.2 mission-driver 的四种命运（关键证据）

| 项目 | 接入方式 | 现状 |
| --- | --- | --- |
| cobol-robot | 未采用 | AGENTS.md 零提及；`_tmp/` 残留 2026-09-21 的 8 个试验目录后彻底剔除，换成自研 agent-service |
| cobol-simulator | shim + 引用外部引擎 | 完整落地（26 个 mission 配置）但 **10-28 后休眠**；`mission-driver-flow.md` 引用不存在的 `.opencode/skills/mission-driver/SKILL.md`（死链） |
| nop-entropy | 整体 vendor（194 文件） | 在用，30 个 mission；`tasks.yaml` 仍指向已改名的 `opencode-goal-driver/src/main.js`（死链） |
| nop-chaos-flux | shim，`MISSION_DRIVER_HOME` 默认硬编码 `../attractor-guided-engineering-template` | 在用，22 个 mission；**模板仓库不在旁边即断链** |

结论：mission-driver 有真实价值（entropy/chaos 的长周期自治循环），但**不应该是缺省配置**；且"引用不复制"模式已被证伪（chaos 断链风险、simulator 死链）。

### 2.3 技能（skills）的实际分层证据

- **通用技能跨项目重复拷贝**：`nop-git-master`、`nop-git-worktree`、`nop-deep-interview`、`nop-file-converter` 在 entropy 与 chaos 中同名同文并存——手工分发的痕迹，正是模板该内置的；
- **项目类型技能真实存在**：chaos 的 `docs/skills/` 29 个全是前端方法论 prompt（react19 评审、visual-page-quality、e2e 探索测试等），被 AGENTS.md 与 mission 配置双向引用，是真实接线的主技能层；simulator 的 27 个是 COBOL 审计 prompt；entropy 的 25 个是审计 prompt；
- **运营型技能的落位不统一**：robot 把 22 个领域技能放进 `.agents/skills/`，entropy/chaos 把运营技能放 `.opencode/skills/`（opencode 自动加载），chaos 的 AGENTS.md **全文 0 次提及 `.opencode/skills`**——5 个已装技能对读 AGENTS.md 的 agent 不可见（组织断层）。

### 2.4 卫生问题（模板缺省约束不足）

- 根目录散落：robot 有 40+ 个 `.dat` + JVM crash log + `.tmp/` 与 `_tmp/` 双临时目录并存；chaos 有 `_tmp/`(46) + `tmp/`(38) + `test-results/` 三临时目录并存 + 0 字节 `nul` 文件；
- 重复目录：entropy 的 `archive/`(1) 与 `archived/`(212) 并存；chaos 的根 `analysis/`(3) 与 `docs/analysis/`(664) 并存；
- 改名死链：goal-driver → mission-driver 改名后，entropy 的 tasks.yaml、simulator 的流程文档都没跟上。

## 3. 对五个观点的逐条评估

### 观点 1：精简目录、集中 guides、简化 AGENTS.md —— 同意，附修正

**同意的部分：**

- `architecture / design / roadmaps / plans / lessons / requirements / audits` 作为核心目录与四仓数据吻合（加上实际日用的 `analysis / bugs / logs / context / index.md / skills`，默认骨架收敛到 ~14 个条目）；
- guides 集中到 `docs/guides/`：**robot 自创 docs/guides（69 文件、重度使用）是最强证据**。模板现有"三处散指南"（各目录 00-*-guide.md + process/ + references/）应收敛；
- AGENTS.md 简化为"做什么事 → 遵循什么 guide"的路由表：正确方向。现有 190 行里 Documentation Ownership 15 条 + Operating Rules 15 条大量可以下沉到 guides，AGENTS.md 只留身份声明、目录地图、任务路由表和硬规则。

**修正建议：**

- **"backlog → roadmaps" 改名**：现有 `docs/backlog/` 的实际主力内容就是 roadmap（四仓皆然），"backlog"语义（候选停车场）反而催生了 robot 的 proposals/reports、simulator 的 commercialization-decisions 这类空壳增生目录。建议正名为 `docs/roadmaps/`，候选工作项作为 roadmap 内的 section 而非独立目录语义。
- **两级目录制代替一刀切**：默认只创建核心目录；`discussions / input / testing / references / examples / retrospectives / archive` 不预创建，由 `docs/guides/doc-organization.md` 声明"什么情况创建什么目录、命名规范是什么"。空壳目录问题的根治是不发空壳。
- **每个保留目录只留一个 5-10 行的 README**（所有权 + 命名规范），how-to 全部进 guides。目录内 colocated 的 `00-*-guide.md` 迁走。
- `articles/` 是模板自己的方法论文章，**保留在模板仓库但从复制 manifest 中剔除**。

### 观点 2：mission-driver 缺省不使用 —— 同意，保留为可选加餐

证据充分（一个剔除、一个休眠、两个在用）。v2 缺省形态：

- 缺省**不生成** `missions/`、不拷贝 mission-driver skill、不启用 mission-check 钩子；
- `.githooks/pre-commit` 里的 roadmap `## Work Item Status` 解析契约是引擎耦合物，缺省改为纯文档约定（推荐格式，不做 CI 硬校验）；
- 保留 **mission-driver add-on**：一份 `docs/guides/mission-driver-add-on.md` + 安装器可选开关（如 `--with-mission-driver`），按观点 3 的复制模式把引擎快照 vendor 进项目。entropy/chaos 证明了长周期自治场景的真实需求，不能删掉能力，只是不默认。

### 观点 3：适配 = 复制一份 + 精选工具集 —— 同意

"引用不复制"已被证伪（chaos 硬编码相对路径断链、simulator 死链）。v2 复制清单提案：

| 保留（复制） | 剔除（不随缺省复制） |
| --- | --- |
| 精简版 docs 骨架（~14 条目 + 各目录 README） | mission-driver 引擎（转可选 add-on） |
| `docs/guides/` 全部指南 | `plugin/`（DSH 平台插件，模板自留） |
| `docs/skills/common/` + 按项目类型的技能包（观点 4） | `docs/articles/`、真实项目专属内容 |
| `.agents/skills/` 通用技能集（观点 5） | web 监控台、release/web-dist CI |
| 4 个经过验证的文档卫生脚本：`check-docs-garbled / check-doc-references / check-duplicates / code-stats`（四仓中反复存活的是这 4+1：jscpd 配置） | age-ci 的 L1/L2 引擎门（换成最小文档卫生 CI，可选） |
| `.githooks/pre-commit` 精简版（仅文档卫生检查，fail-open） | oversized-code-files 检查（按需） |
| `install-age` 本体（重写：支持 `--profile`） | |

注意：Java 项目自带 checkstyle/spotbugs、前端 monorepo 自带 husky/prettier/turbo/stryker（chaos 全是自建）——**模板不碰项目自有工具链**，只管文档与方法论卫生。

### 观点 4：docs/skills 按项目类型分子目录 —— 同意

模板作为"技能超市"，按类型组织货架；适配时复制 `common/` + 对应类型货架：

```
docs/skills/
├── README.md            # 技能注册表 + 选择规则（保留现有机制）
├── common/              # 现有 15 个 prompt 全部归此（plan-audit、closure-audit、multi-dimensional-audit…）
├── frontend/            # 从 chaos 的 29 个中精选（react 评审、visual 质检、e2e 探索…）
└── java/                # 从 simulator/entropy 沉淀（审计 prompt、缺陷账本方法…）
```

**边界规则（需写进 guides）**：`docs/skills/` = 方法论 prompt/playbook（人读、plan 引用、跨工具可移植）；`.agents/skills/` = 运行器可自动加载的运营型技能。robot 的 22 个领域技能放 `.agents/skills` 是适配项目自己的选择，模板不约束适配后的增长，只约束出厂形态。

### 观点 5：.agents/skills 放通用技能 —— 同意

跨项目重复拷贝的 `nop-git-master / nop-git-worktree / nop-deep-interview / nop-file-converter` 就是该内置的清单，另加 **grillme**（质询/独立评审技能，与模板"plan 必须独立 draft review"的传统衔接）。保持 4-6 个，不贪多。

**一个需要拍板的机制问题**：`.agents/skills/` 是否被你的目标运行器自动加载？opencode 读 `.opencode/skills/`，ZCode 读自己的目录。方案：`.agents/skills/` 为权威存放处，`install-age --runner opencode` 时同步拷贝/链接到 `.opencode/skills/`（缺省不做，保持纯净）。

## 4. v2 目标形态

### 4.1 目录骨架（缺省创建，共 14 条目）

```
项目根/
├── AGENTS.md                 # ~100 行：身份 + 目录地图 + 任务路由表 + 硬规则
├── .agents/skills/           # git-master / git-worktree / deep-interview / file-converter / grillme
├── .githooks/pre-commit      # 文档卫生检查（fail-open）
├── tools/                    # 4 个文档卫生脚本 + jscpd 配置
├── install-age（模板仓库侧）
└── docs/
    ├── index.md              # 总路由表（entropy/chaos 验证有效，保留）
    ├── context/              # 精简为 2 件：project-context.md + codebase-map.md
    ├── architecture/  design/  requirements/  roadmaps/
    ├── plans/  audits/  lessons/
    ├── analysis/  bugs/  logs/{year}/
    ├── guides/               # 全部 how-to 集中地（见 4.2）
    └── skills/
        ├── common/
        └── <frontend|java|…>/   # 按 --profile 复制
```

`context/` 从 5 件精简为 2 件：`conventions.md` 并入 project-context 与 guides；`source-of-truth-and-precedence.md` 并入 `docs/index.md`（真相源路由本来就是 index 的职责）；`ai-autonomy-policy.md` 精简后并入 AGENTS.md 硬规则区。

### 4.2 guides 初始清单（全部从现有 00-*-guide / process / 迁移整合）

| guide | 来源 |
| --- | --- |
| doc-organization.md | 新写：目录落位总则 + 按需目录（discussions/input/testing/references/…）的创建时机与命名 |
| application-development-workflow.md | docs/process/ 同名文件 |
| plan-authoring-and-execution.md | docs/plans/00-* |
| roadmap-authoring.md | docs/backlog/00-*（去掉引擎解析契约的硬约束表述） |
| audit-execution.md | docs/audits/00-* |
| bug-fix-note.md | docs/bugs/00-* |
| log-writing.md | docs/logs/00-* |
| requirements-synthesis.md | docs/requirements 相关约定 + input-processing-guide |
| testing-note.md | docs/testing/00-*（按需目录配套） |
| mission-driver-add-on.md | 新写：可选引擎接入（复制模式） |

### 4.3 AGENTS.md v2 骨架（~100 行）

1. **Project Intent**（5 行内）
2. **Documentation Map**：14 个条目各一行所有权
3. **Task Routing**（核心，"做什么事遵循什么 guide"）：

| 你要做的事 | 先读 |
| --- | --- |
| 写/改计划 | docs/guides/plan-authoring-and-execution.md |
| 定路线图 | docs/guides/roadmap-authoring.md |
| 修 bug | docs/guides/bug-fix-note.md |
| 审计/评审 | docs/guides/audit-execution.md + docs/skills/ |
| 提交/rebase | .agents/skills/git-master |
| 计划被质疑/要质询 | .agents/skills/grillme |
| … | … |

4. **Hard Rules**（≤10 条：file-in/file-out、计划触发条件指针、log 必写、验证命令以 project-context 为准、教训晋升链 lesson→skill→script）
5. **Read This First**：`docs/context/project-context.md`（1 个入口，其余靠路由表）
6. **Verification Baseline**

## 5. 对既有适配项目的影响与迁移

- **不强制迁移**。四个项目已各自成型，v2 只约束模板出厂形态；
- chaos 的 `../attractor-guided-engineering-template` 外部引擎依赖建议一次性 vendor 化修复（无论 v2 是否落地）；
- 模板仓库自身的双身份（real project = 引擎开发 + template）保留，但边界文档 `template-vs-realproject-boundary.md` 需按 v2 manifest 重写；
- 建议增加**模板版本戳 + CHANGELOG**：适配项目记录"从 age-template v? 复制"，未来可 diff 漂移（本轮四个项目已证明：复制之后零升级路径，漂移不可挽回）。

## 6. 待拍板的决策点

1. `backlog/` 是否正名为 `roadmaps/`？（推荐：是）
2. `discussions / input / testing / references / examples / retrospectives / archive` 七个目录改为"按需创建"，是否接受？（推荐：是）
3. `.agents/skills/` 的运行器适配：缺省纯 `.agents/`，`--runner opencode` 时才镜像到 `.opencode/skills/`，是否符合你的工具链现实？
4. mission-driver add-on 用复制（vendor）模式确认？（推荐：是，与观点 3 一致）
5. 计划结构门（gate-check.mjs）在没有引擎的项目里保留为可选 pre-commit 检查还是彻底去掉？（推荐：保留为可选，它是文档质量门而非引擎耦合物——需核实其对引擎的依赖度）
6. 技能货架初版类型：`common + frontend + java` 三档是否够？（cobol 类是否也要从 robot/simulator 沉淀一档？）

## 7. 实施阶段草案（拍板后执行）

| 阶段 | 内容 | 验证 |
| --- | --- | --- |
| P1 | docs 重构：建 guides/、迁移 00-*-guide、砍/并目录、各目录 README 重写、index.md 重写 | check-doc-references 全绿 |
| P2 | AGENTS.md v2 + template/ 双写同步 | 人工评审 + 路由表完整性检查 |
| P3 | skills 重组：common/frontend/java 货架 + .agents/skills 通用集 + grillme 编写 | 技能注册表与文件一致 |
| P4 | 工具精选 + install-age v2（--profile / --runner / --with-mission-driver） | check:install 闭环门更新后通过 |
| P5 | mission-driver add-on 打包 + 边界文档/CHANGELOG/版本戳 | verify-age.sh 全绿 |

## 8. 附录：证据明细

- 模板本体：docs/ 21 子目录；空壳 archive(1)/lessons(1)/input(2)；`.opencode/skills/` 仅 mission-driver（419 行 SKILL.md + 2 references）；`.agents/` 不存在；
- robot：AGENTS.md 588 行中文；docs 736 文件/17 子目录；`.agents/skills/` 22 技能；mission 机制零痕迹；reports(2，9-29 停更)/discussions(1)/proposals(3) 空壳；guides 69 文件自创重度使用；
- simulator：AGENTS.md 215 行；docs 3824 文件/26 子目录；missions 26 个（10-28 后休眠）；`mission-driver-flow.md` 死链；双 skills 体系（docs/skills 27 + .agents/skills 1）；
- entropy：ai-dev/ 16 子目录（因 docs/ 是历史用户文档目录）；audits 1204/plans 1097 重度；archive(1) 与 archived(212) 并存；tasks.yaml 死链 `opencode-goal-driver`；引擎 vendor 194 文件；
- chaos：docs 24 子目录；`docs/input/` 纯空壳；根 analysis/(3) 与 docs/analysis/(664) 并存；AGENTS.md 0 次提及 .opencode/skills；引擎外部依赖 `../attractor-guided-engineering-template`；husky/prettier/semgrep/stryker/turbo 全为自建。
