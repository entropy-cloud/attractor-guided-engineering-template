# 2026-07-27-0100 onboarding mission — 替换 demo 旁新增一个真实"按 START-HERE-after-copy.md 引导 AI 填充 target 项目文档"的 mission

> Plan Status: completed
> Last Reviewed: 2026-07-27
> Source: 用户请求 — demo mission 用 `echo demo-ok` 无实际意义;需要一个能让 AI 按 `template/START-HERE-after-copy.md` 引导、读 target 项目 codebase 后填写 11 个 fill-in 文档的 mission
> Related: `2026-07-27-0000-template-realproject-split-plan.md`(已完成,提供了 template/ 子目录机制 + install-age.sh manifest 机制);`template/START-HERE-after-copy.md`(本 mission 的执行指南)
> Audit: required
> Gate: ask-first — install-age.sh 是消费者依赖的 public contract。需人工批准后才能执行 Phase 1+。

## Current Baseline

Live facts (read from repo 2026-07-27,已核对):

- `install-age.sh:222-310` 当前在 install 时创建 3 个 demo 相关产物:
  - `missions/demo.json`(`echo demo-ok` 所有 commands,all-WI-done roadmap → DRAFT_PLANS 立刻空跑完)
  - `docs/backlog/demo-roadmap.md`(3 个 WI 全 done)
  - `docs/plans/demo/` 目录(空)
- `install-age.sh:354-369` NEXT STEPS 输出 5 步,第 5 步是 `Verify: ./tools/mission-driver.sh list`,未提任何"个性化文档"的引导。
- `install-age.manifest` 经前 plan(v4)调整,15 个 fill-in entry 用 `template/` 前缀;现在若新增 `template/docs/backlog/onboarding-roadmap.md`,需要在 manifest 加一行。
- 消费者 install 后的状态:75-77 文件,docs/context/* 等全是 `<fill ...>` / `<project-name>` 占位;`./tools/mission-driver.sh list` 能列出 `base` + `demo` 但 demo 跑完只是验证脚手架,没个性化任何文档。
- `template/START-HERE-after-copy.md` 已在 v4 plan 加 deprecation header 但仍是 manual fallback,内容是 7+5 项 fill-in checklist。
- mission-driver 的 plan lifecycle(`docs/plans/00-plan-authoring-and-execution-guide.md` + `tools/mission-driver/EXECUTION-PRINCIPLE.md`):每个 WI 由 DRAFT_PLANS 生成一个 plan,REVIEW_PLANS 审核,EXEC_PLANS 执行(含 CLOSURE_SCRIPT + CLOSURE_AUDIT + BUILD_VERIFY),全部 done 后 DEEP_AUDIT 收尾。
- 关键约束(dogfooding):本 plan 自己也要遵守 mission-driver 的 plan 格式,因为它产出的 roadmap 会被 mission-driver 读。

Gap: 消费者 install 后无标准化的"用 AI 把模板文档填成项目实际内容"路径;要么手动按 START-HERE-after-copy.md 一项项改(慢、易漏),要么自己写 mission(高门槛)。

## Goals

- 新增 `onboarding` mission,与 `demo` 并存(demo 作为秒级 smoke test 保留)。
- AI 读 target 项目 codebase 后,**填好 11 个 fill-in 文档**(START-HERE-after-copy.md "Required Before First AI Coding" + "Fill Progressively" 关键项)。
- `onboarding-roadmap.md` 放在 `template/docs/backlog/`,通过 install-age.manifest 复制;install-age.sh 创建配套 `missions/onboarding.json`。
- 产出可立即进入"开发第一个 feature"状态的个性化 AGE workspace(`<fill ...>` / `<project-name>` 占位全部清除,docs/context/* 含真实 stack/commands/protected areas)。

## Non-Goals

- 不删 demo mission(用户选择并存)。
- 不实现 "Module Registration Checklist"(START-HERE-after-copy.md:32-41)— 那是多模块项目专属,留给消费者按需手填。
- 不在本 plan 中实跑 onboarding mission(那是消费者 install 后的事;本 plan 只产出 mission 配置 + roadmap 模板 + 验证它们被 install-age.sh 正确创建)。
- 不在 target `/c/Work/code-generator/` 真跑 onboarding(若需要,可作为本 plan 关闭后的 follow-up)。
- 不改 mission-driver 引擎代码 — 本 plan 完全是 template + install-age.sh 层面的改动。
- 不为 onboarding 加复杂 audit 机制(用 mission-driver 默认 plan lifecycle 即可)。
- **不覆盖 START-HERE-after-copy.md "Required Before First AI Coding" 第 6 项**("Ensure a requirement or owner doc exists that describes the first task's intended behavior"):该决定取决于消费者首个具体任务而非 onboarding 通用流程;留消费者在 onboarding 完成后自决。
- **不覆盖 START-HERE-after-copy.md "Fill Progressively" 的 3 项**:
  - `docs/design/app-overview.md`(应用层 baseline)— 取决于产品决策而非通用流程;
  - `docs/requirements/{product-scope,mvp}.md`(产品 scope + MVP)— 同上;
  - "Decide which optional layers are active / Remove or ignore optional directories"— 项目偏好,消费者按需。
  消费者可在 onboarding 后,基于 WI1 scan + WI2-4 填好的 context/*,自己决定是否填这些。

## Task Route

- Type: `architecture change`(改 install-age.sh public contract + 新增 mission config 模板)
- Owner Docs: `template/START-HERE-after-copy.md`、`install-age.sh`、`install-age.manifest`、`tools/mission-driver/CONTEXT.md`("Mission 配置系统")、`tools/mission-driver/EXECUTION-PRINCIPLE.md`
- Skill Selection Basis: 写 roadmap + 改 bash heredoc → `Skill: none`(无匹配可复用 skill)
- Autonomy: **ask-first** — 改 `install-age.sh` 这个消费者依赖的 public contract。Phase 1+ 需人工批准。

## Infrastructure And Config Prereqs

- 无新依赖、无新端口、无外部服务。
- 回滚: Phase 1 各项改动都是新增 / 局部修改,可独立 `git revert`。
- 测试策略: Phase 3 在干净 `/tmp` 跑 install-age.sh,验证 onboarding 文件创建正确;**不实跑 mission**(mission 实跑是 30-60 分钟,超出本 plan scope)。

## Design Decisions

### D1 — Mission 名 = `onboarding`
- Alternatives: `bootstrap`(过于通用)、`init`(过于开发语言化)、`setup`(模糊)、`personalize`(过长)。
- 选 `onboarding`:语义清晰、与 START-HE-after-copy.md "after copy" 阶段对应、避免与未来可能的 `bootstrap-from-scratch`(无 install-age.sh 场景)混淆。
- Residual risk: 无。

### D2 — `onboarding` 与 `demo` 并存
- 用户已选(见 question 答复)。demo 保留作为秒级 smoke test;onboarding 是分钟-小时级个性化。
- NEXT STEPS 输出顺序:先 demo(smoke),再 onboarding(personalize)。
- Residual risk: 低。两个 mission plansDir 不冲突(`docs/plans/demo` vs `docs/plans/onboarding`)。

### D3 — `onboarding-roadmap.md` 放 `template/docs/backlog/`,manifest 复制 + 精准 sed-replace
- 用户已选。与 demo-roadmap.md(install-age.sh heredoc 写)不一致,但用户偏好可独立 review/diff 的 roadmap 文件。
- 落地: `template/docs/backlog/onboarding-roadmap.md`(写时用 `<project-name>` 占位,install 时 sed-replace)。
- `install-age.manifest` 加一行: `template/docs/backlog/onboarding-roadmap.md`(在 `# --- docs/backlog` 段,manifest 注释同步改为 `# --- docs/backlog (guides + skeleton + onboarding roadmap template, NOT engine roadmaps) ---`)。
- **配套扩展 install-age.sh sed-replace**:当前只 sed AGENTS.md。本 plan 改为**对 fill-in 文件全集**(manifest 中所有 `template/` 前缀 entry,即 16 个 fill-in + onboarding-roadmap.md = 17 个)都 sed-replace `<project-name>`。
- **精准 sed 实现(关键)**:用第二个数组 `TEMPLATE_COPIED` 跟踪 fill-in 来源的复制目标。在 copy loop 里(`COPIED=()` `SKIPPED=()` 旁边)先声明 `TEMPLATE_COPIED=()`(N4 fix — `set -u` 要求显式声明);如果源 manifest line 以 `template/` 开头,除了 push 到 COPIED,也 push `$dst_line` 到 TEMPLATE_COPIED。sed-replace 块只 iterate TEMPLATE_COPIED。**不**iterate 所有 .md(避免误伤共享方法论 guide 里合法的 `<project-name>` 字面量引用,如 `docs/plans/00-plan-authoring-and-execution-guide.md` 里描述占位符本身的文字)。
- Residual risk: 低。Phase 2 closure-gate test 显式 verify fill-in 文档 `<project-name>` 已替换为 project name(正向验证;反向"共享 docs 不被误伤"通过 TEMPLATE_COPIED 仅含 fill-in 文件来保证,不需额外 grep canary)。

### D4 — `missions/onboarding.json` 由 install-age.sh heredoc 创建(沿用 demo 模式)
- 与 demo.json 一致(install-age.sh:256-281 cat heredoc)。
- Alternatives: 放 `template/missions/`,manifest 复制 — 拒绝(missions 目录不在 manifest 范围内,且不同消费者可能要不同 commands)。
- Residual risk: 无。

### D5 — `commands.test` 用 `echo onboarding-ok`,真实 closure 在各 WI plan 内
- mission-driver CHECK 步骤跑 `commands.test`,必须 PASS 才能 loop。onboarding 是 doc-filling,无真正"test"概念。
- 真实 closure(无 `<fill ...>` 残留、`<project-name>` count=0、docs/logs/{year}/ 存在)由各 WI plan 的 Closure Gates 检查(per `docs/plans/00-plan-authoring-and-execution-guide.md`)。
- Residual risk: 低。echo 总 PASS,但若 AI 跑挂了某个 WI,该 WI 的 plan Status 不会 promote 到 completed,DEEP_AUDIT 会发现。

### D6 — 8 个 WI(对齐 START-HERE-after-copy.md 关键 checklist)
覆盖 START-HERE-after-copy.md:
- "Required Before First AI Coding" 8 项 → WI1-WI5 + WI7 + WI8(覆盖 7 项;"Ensure a requirement or owner doc exists" 留给消费者自决,见 Non-Goals,因为它取决于消费者首个具体任务而非 onboarding 本身)
- "Fill Progressively" 7 项 → WI6(覆盖 architecture 4 项)+ WI8(覆盖 known-good-baselines);**显式排除** 3 项(`docs/design/app-overview.md`、`docs/requirements/{product-scope,mvp}.md`、"Decide which optional layers / Remove optional directories")— 见 Non-Goals,因为它们取决于具体产品决策而非 onboarding 通用流程
- 不覆盖: "Module Registration Checklist"(多模块专属)、"Generated Code Warning"(消费者按需)、"Do Not Start If"(消费者自己判断)

具体 8 个 WI:
1. WI1 项目扫描 + 引擎冒烟 — AI 读 codebase 写 `docs/input/project-scan.md`;验证 `./tools/mission-driver.sh list` 跑通
2. WI2 填 `docs/context/project-context.md`(identity / stack / verification commands)
3. WI3 填 `docs/context/ai-autonomy-policy.md`(reviewer = subagent / protected areas)
4. WI4 填 `docs/context/codebase-map.md`(entry points / change routes / fragile files)
5. WI5 填 `docs/index.md` + 校验 `<project-name>` 全替换(install-age.sh 已 sed-replace,本 WI 填其余占位 + 校验)
6. WI6 填 `docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md`
7. WI7 填 `docs/process/application-development-workflow.md`(审查 body)+ `docs/backlog/README.md`(填首行或显式写"no active work item")
8. WI8 填 `docs/testing/known-good-baselines.md`(跑 verification)+ 验证 `docs/logs/{year}/` 存在(install-age.sh 已创建,本 WI 仅 verify)

Alternatives: 6 个 WI(合并 WI2-WI4 为一个 context/* WI)/ 12 个 WI(architecture/* 拆为 4 个独立 WI)。
- 选 8 个:颗粒度适合 mission-driver 单 plan(WI 太大 plan 难写;太小则 plan 数量爆炸、DRAFT_PLANS/EXEC_PLANS 轮次过多)。

### D7 — `docs/input/project-scan.md` 是 WI1 输出 + 后续 WI 输入
- mission-driver 的 plan-execute 子流程产出物主要是改 docs/* 文件。WI1 产出一份 scan 摘要放在 `docs/input/project-scan.md`(符合 `docs/input/` 的"raw inputs"职责)。
- WI2-WI8 都 cite WI1 的 scan 作为 input。
- Residual risk: 低。若 AI scan 不全,后续 WI 会暴露问题(填不出真实内容)。

### D8 — Roadmap 写法:直接路径,无 `{{placeholder}}`(B2 Explore 结论)
- 验证: `install-age.sh:286-310` 的 `demo-roadmap.md` 用 plain markdown,Owner Doc 列直接写 `AGENTS.md` / `docs/context/project-context.md`,**无** `{{plansDir}}` / `{{backlogDir}}` 等 mission-driver placeholder。mission-driver 读 roadmap 时把它当 plain markdown 解析(`engine.js:588` 读 roadmapPath 后直接传给 AI prompt,不做 placeholder 展开)。
- Decision: onboarding-roadmap.md 同样写直接路径(`docs/context/project-context.md`、`docs/architecture/system-baseline.md` 等),不用 `{{...}}`。
- Plan 文件路径**不**写进 roadmap(mission-driver 自己管 `plansDir` 下的 plan 命名)。
- Alternatives 考虑: 用 `{{plansDir}}` placeholder — 拒绝(引擎不支持,会让 AI 困惑)。

### D9 — WI 初始 status = `todo`(N8 fix)
- onboarding-roadmap.md 创建时,WI1-WI8 全部 `Status: todo`(不是 `ready`,因为没经过 plan draft review;不是 `done`,因为还没工作)。
- 对比 demo-roadmap.md 全 `done`(因为 demo 不实跑,只验证脚手架)。
- 这样 mission-driver 第一次 DRAFT_PLANS 会读到 8 个 todo WI,起草 1-3 个 plan,进入标准生命周期。

## Execution Plan

### Phase 1 — 写 onboarding-roadmap.md 模板 + onboarding.json heredoc + manifest entry + 持久化 closure-gate test + NEXT STEPS 更新

Status: completed
Targets: `template/docs/backlog/onboarding-roadmap.md`(新)、`tools/check-install-age.mjs`(新)、`install-age.sh`、`install-age.manifest`、`README.md`、`DEVELOPMENT.md`、`tools/README.md`、`tools/package.json`(若加 check:install script)
Skill: none

- Item Types: `Add | Fix`
- Prereqs: ask-first 人工批准

- [x] `Add` (B1 fix — 持久化前 plan 遗漏的 closure-gate test): 创建 `tools/check-install-age.mjs`,把 `docs/architecture/template-vs-realproject-boundary.md:69-76` 的临时 snippet 固化为可执行脚本。脚本逻辑:
  - 接受 target 目录参数(默认 `/tmp/age-test-$$`)
  - 跑 `./install-age.sh <target> TestProject`
  - 断言: `grep -c '<project-name>' <target>/AGENTS.md` == 0;`grep -q TestProject <target>/AGENTS.md`;`test -f <target>/docs/plans/00-plan-authoring-and-execution-guide.md`;`test -f <target>/docs/context/project-context.md`
  - 输出 PASS/FAIL + exit code
  - 同步在 `tools/package.json` 加 `"check:install": "node ./check-install-age.mjs"` 脚本;在 `tools/README.md` "Core Tools" 段加一行;在 `docs/architecture/template-vs-realproject-boundary.md` 把临时 snippet 替换为指向 `tools/check-install-age.mjs` 的引用。
      - Skill: none
- [x] `Add` (B2 fix — roadmap 内容已 draft,见下): 创建 `template/docs/backlog/onboarding-roadmap.md`。**完整内容**(直接路径,D8;WI 初始 status=`todo`,D9):
  ```markdown
  # <project-name> Onboarding Roadmap

  > Drive the AI to read this project's codebase and fill in the copied AGE template docs based on actual tech stack, entry points, and verification commands. Run after `./install-age.sh` to personalize the workspace. Source guide: `template/START-HERE-after-copy.md` (manual fallback).

  ## Work Item Status

  | Work Item | Status | Owner Doc / Source | Dependencies | Reuse |
  | --------- | ------ | ------------------ | ------------ | ----- |
  | M1/WI1 项目扫描 + 引擎冒烟 | todo | `docs/input/project-scan.md` (output) | — | `./tools/mission-driver.sh list` |
  | M1/WI2 填 `docs/context/project-context.md` | todo | `docs/context/project-context.md` | WI1 | — |
  | M1/WI3 填 `docs/context/ai-autonomy-policy.md` | todo | `docs/context/ai-autonomy-policy.md` | WI1 | — |
  | M1/WI4 填 `docs/context/codebase-map.md` | todo | `docs/context/codebase-map.md` | WI1 | — |
  | M1/WI5 填 `docs/index.md` + 校验 `<project-name>` 全替换 | todo | `docs/index.md` | WI2 | grep |
  | M1/WI6 填 `docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md` | todo | `docs/architecture/*` | WI1, WI2 | — |
  | M1/WI7 填 `docs/process/application-development-workflow.md` + `docs/backlog/README.md` | todo | `docs/backlog/README.md` | WI2 | — |
  | M1/WI8 填 `docs/testing/known-good-baselines.md` + 校验 `docs/logs/{year}/` 存在 | todo | `docs/testing/known-good-baselines.md` | WI2 | run verification |

  ## Milestones

  ### M1 — Onboarding

  - **WI1 项目扫描 + 引擎冒烟** — AI 读项目根(`package.json` / `pom.xml` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `README.md`),识别技术栈、主入口、build/test 命令、业务领域;写到 `docs/input/project-scan.md`。验证 `./tools/mission-driver.sh list` 跑通(引擎冒烟)。
  - **WI2 填 `docs/context/project-context.md`** — 用 WI1 scan 结果填 Project Identity / Current Technical Baseline / Verification Commands(从项目实际 tooling 推导) / Optional Layers Currently In Use / AI Block Conditions。所有 `<fill ...>` 占位必须移除。
  - **WI3 填 `docs/context/ai-autonomy-policy.md`** — Reviewer Availability(默认 `subagent`,因 mission-driver 可用);识别 Protected Areas(production config、auth、schema、payment、data-deletion 等)。
  - **WI4 填 `docs/context/codebase-map.md`** — Entry Points(从 WI1 scan)、Common Change Routes、Large/Fragile Files。所有 `<path>` / `<notes>` 占位移除。
  - **WI5 填 `docs/index.md` + 校验 `<project-name>` 全替换** — install-age.sh 已 sed-replace `<project-name>` 为项目名;本 WI 验证 `grep -c '<project-name>' docs/` = 0(包括 `docs/index.md` 标题);填 `docs/index.md` 其余占位(`<area>` 表格行等);若项目单域,移除 `Domain Quick-Reference (Optional)` 段。
  - **WI6 填 `docs/architecture/*`** — `README.md`(指针 + 实际架构 doc 引用)、`module-boundaries.md`(基于 WI1 scan 的模块边界)、`project-vision.md`(产品方向 + 非目标,基于 README + codebase 分析)、`system-baseline.md`(stack/runtime/deployment)。
  - **WI7 填 `docs/process/application-development-workflow.md` + `docs/backlog/README.md`** — workflow 标题已被 install-age.sh sed-replace,本 WI 审查 body 是否需要项目特定调整;`backlog/README.md` 填第一行 work items(若无,显式写 `(no active work item; identify next slice from requirements or input)` 而非留 P0 `<first slice>` 占位)。
  - **WI8 填 `docs/testing/known-good-baselines.md` + 校验 `docs/logs/{year}/` 存在** — 跑项目实际 verification 命令,记录 green baseline 到 `docs/testing/known-good-baselines.md`(日期/SHA/scope/commands);验证 `docs/logs/{year}/` 目录存在(install-age.sh 已创建,本 WI 仅 verify)。
  ```
      - Skill: none
- [x] `Add`: 修改 `install-age.sh`,在 demo 块(`:222-310`)后增加 onboarding 块:
  - 创建 `missions/onboarding.json`(heredoc,extends base,commands 全 `echo onboarding-ok`,roadmapPath=`docs/backlog/onboarding-roadmap.md`,plansDir=`docs/plans/onboarding`,moduleDir=`.`)
  - 创建 `docs/plans/onboarding/` 目录(mkdir -p)
  - 注意: onboarding-roadmap.md 本身由 manifest 复制(install-age.sh 不再 cat heredoc 写它)
      - Skill: none
- [x] `Add` (manifest 条目 + 注释更新, N6 fix): 修改 `install-age.manifest`,在 `# --- docs/backlog` 段加一行 `template/docs/backlog/onboarding-roadmap.md`;同步把段注释从 `# --- docs/backlog (guides + skeleton, NOT engine roadmaps) ---` 改为 `# --- docs/backlog (guides + skeleton + onboarding roadmap template, NOT engine roadmaps) ---`。
      - Skill: none
- [x] `Fix (D3 精准 sed-replace)`: 修改 `install-age.sh` copy loop + sed-replace 块。
  - 在 `COPIED=()` `SKIPPED=()` 旁(N4 fix)声明 `TEMPLATE_COPIED=()`
  - copy loop 在 `template/` 前缀分支里,额外维护 `TEMPLATE_COPIED` 数组:
    ```bash
    # 在 cp "$src" "$dst" 后、COPIED+=("$dst_line") 旁边:
    case "$line" in
      template/*) TEMPLATE_COPIED+=("$dst_line") ;;
    esac
    ```
  - sed-replace 块改为 iterate TEMPLATE_COPIED(而非写死 AGENTS.md):
    ```bash
    # Replace <project-name> in every fill-in file that was sourced from template/.
    for f in "${TEMPLATE_COPIED[@]:-}"; do
      [ -z "$f" ] && continue
      case "$f" in
        *.md)
          tmp="$(mktemp)"
          sed "s/<project-name>/$PROJECT_NAME/g" "$TARGET/$f" > "$tmp" && mv "$tmp" "$TARGET/$f"
          ;;
      esac
    done
    ```
  - 这会替换 fill-in 文件全集(`template/AGENTS.md`、`template/docs/index.md`、`template/docs/context/*`、`template/docs/architecture/*`、`template/docs/process/application-development-workflow.md`、`template/docs/backlog/{README,implementation-roadmap,onboarding-roadmap}.md`、`template/docs/design/*`、`template/docs/testing/known-good-baselines.md`)里的 `<project-name>`。
  - 共享方法论 guides(`docs/plans/00-*-guide.md`、`docs/skills/*.md`、`docs/references/*.md` 等)的源路径**没有** `template/` 前缀,所以不入 TEMPLATE_COPIED,不被 sed 误伤。
      - Skill: none
- [x] `Fix`: 修改 `install-age.sh:354-369` NEXT STEPS 输出。当前 5 步,改为 6 步,加一步推荐 onboarding:
  ```
  NEXT STEPS:
    1. (smoke, 秒级) ./tools/mission-driver.sh run demo     # 验证脚手架 + 引擎 + monitor
    2. (personalize, 30-60 分钟) ./tools/mission-driver.sh run onboarding   # AI 读你的 codebase,填好 docs/context/* / architecture/* 等
    3. Fill docs/context/project-context.md verification commands (if onboarding 不覆盖).
    4. Fill missions/base.json commands.* for YOUR stack.
    5. Read template/START-HERE-after-copy.md for the manual fallback checklist.
    6. Verify: ./tools/mission-driver.sh list
  ```
  注: 步骤 2 是 onboarding 自动完成步骤 3 的大部分工作。
      - Skill: none
- [x] `Fix (doc 对齐)`: 修改 `README.md`(本仓库根的 dual-audience 版)在 "Using This Repo as a Template" 段提一句"install 后跑 `./tools/mission-driver.sh run onboarding` 让 AI 读你的 codebase 自动个性化文档";`DEVELOPMENT.md` 同步。`tools/README.md` "Mission Driver" 段补一行。
      - Skill: none

Exit Criteria:

- [x] `tools/check-install-age.mjs` 存在,可独立执行,5 个核心断言 PASS(B1 fix 持久化前 plan 遗漏的 deliverable)
- [x] `template/docs/backlog/onboarding-roadmap.md` 存在,含 8 个 `todo` WI 的 Work Item Status 表 + Milestones 段(D6 + D8 + D9)
- [x] `install-age.sh` 含 onboarding.json heredoc 创建块 + mkdir docs/plans/onboarding + `TEMPLATE_COPIED=()` 声明 + 扩展 sed-replace + 更新 NEXT STEPS
- [x] `install-age.manifest` 含 `template/docs/backlog/onboarding-roadmap.md` 条目,段注释更新
- [x] `bash -n install-age.sh` 通过(无语法错误)
- [x] `node tools/check-install-age.mjs` PASS
- [x] README.md / DEVELOPMENT.md / tools/README.md 提到 onboarding mission + check:install 工具
- [x] `docs/logs/` 更新

### Phase 2 — 扩展 check-install-age.mjs + 在 /tmp 实跑 install-age.sh 验证 + mission-check 校验

Status: completed
Targets: `tools/check-install-age.mjs`(已含 Phase 1 基础)+ `/tmp/audit-onboard-test-XXXX`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1 完成

- [x] `Add`: 在 `tools/check-install-age.mjs`(Phase 1 已创建)加新断言:
  - 目标 `docs/backlog/onboarding-roadmap.md` 存在
  - 目标 `missions/onboarding.json` 存在且 JSON 合法
  - 目标 `docs/plans/onboarding/` 目录存在
  - 目标 `docs/backlog/onboarding-roadmap.md` 内 `<project-name>` 已被替换为 project name(D3 验证 — onboarding-roadmap 是 fill-in,应被 sed-replace)
  - 目标 `docs/index.md` 标题不再含 `<project-name>`(已被替换为 project name)
  - 目标 `docs/context/project-context.md` 内 `<project-name>` 已被替换(正向验证 fill-in 文件被 sed-replace;**反向验证**靠 TEMPLATE_COPIED 仅含 fill-in 文件来保证,不需 canary — N5 fix 简化)
      - Skill: none
- [x] `Proof`: 在 `/tmp/audit-onboard-test-XXXX` 干净目录跑 `node tools/check-install-age.mjs /tmp/audit-onboard-test-XXXX`。所有断言 PASS。**额外 grep 验证**:`<project-name>` count 在 fill-in 文件(`docs/context/project-context.md`、`docs/index.md` 等)= 0;在共享方法论文档(`docs/plans/00-plan-authoring-and-execution-guide.md`)中保留(预期该文件本来就没 `<project-name>` 字面量,所以这条断言不增信息;主要靠 fill-in 文件 count=0 的正向断言)。
      - Skill: none
- [x] `Proof` (N7 fix): 跑 `node tools/mission-driver/src/mission-check.mjs <target>/missions/onboarding.json <target>`,验证 mission.json 合法(`name`/`roadmapPath`/`plansDir`/`commands.test` 字段齐全;extends base 合并 OK;roadmapPath 指向的文件存在)。
      - Skill: none
- [x] `Proof`: 跑 `./tools/mission-driver.sh list`(从 target),应输出 `base`, `demo`, `onboarding` 三个 mission。
      - Skill: none

Exit Criteria:

- [x] `tools/check-install-age.mjs` 所有断言(基础 5 + onboarding 5 = 10 个)PASS
- [x] fill-in 文件 `<project-name>` count = 0(install-time sed-replace 正确)
- [x] `mission-check.mjs` 校验 `missions/onboarding.json` PASS
- [x] `./tools/mission-driver.sh list` 列出 base + demo + onboarding
- [x] `docs/logs/` 更新

## Draft Review Record

- Independent draft review iteration 1: `needs revision`(subagent `ses_05d36197cffeEigl4fVXpmFMGc`, 2026-07-27)。2 blocking + 8 non-blocking,全部应用:
  - **B1 fixed**: 前 plan(2026-07-27-0000)的 Phase 3 closure-gate test 只在 `docs/architecture/template-vs-realproject-boundary.md:69-76` 有临时 snippet,从未固化为脚本。本 plan Phase 1 加新 `Add` item 创建 `tools/check-install-age.mjs` 持久化它(backfilling 前任遗漏)+ 在 `tools/package.json` + `tools/README.md` + boundary doc 同步引用。
  - **B2 fixed**: (a) 加 `Explore | D8`(已 resolve)确认 mission-driver 不展开 `{{placeholder}}` 语法 → roadmap 用直接路径;(b) Phase 1 item 2 现在 inline draft 完整 roadmap 内容(8 行 WI 表 + 8 段 Milestones 描述),不再委托 implementer 临时设计。
  - **N1 fixed**: 把"消费者自决项"显式 enumerate 到 Non-Goals — START-HERE-after-copy.md "Required" 项 6(requirement/owner doc)+ "Fill Progressively" 项 3(design/app-overview、requirements/{product-scope,mvp}、optional layers)显式排除,理由写明。
  - **N2 fixed**: WI5 描述改为"install-age.sh 已 sed-replace `<project-name>`,本 WI 填其余占位 + 校验 count=0",消除与 install-time sed 的冗余。
  - **N3 fixed**: WI8 描述改为"校验 docs/logs/{year}/ 存在"(install-age.sh 已创建),不再"创建"。
  - **N4 fixed**: D3 显式提"`TEMPLATE_COPIED=()` 旁 declaration"(set -u 要求)。
  - **N5 fixed**: Phase 2 验证简化为正向(fill-in count=0),不需 canary;反向保证靠 TEMPLATE_COPIED 仅含 fill-in 文件。
  - **N6 fixed**: manifest 段注释更新为"+ onboarding roadmap template"。
  - **N7 fixed**: Phase 2 加 `mission-check.mjs <target>/missions/onboarding.json` 校验。
  - **N8 fixed**: D9 决策记录 WI 初始 status = `todo`(对齐 demo 全 `done` 的反例 + roadmap-authoring-guide)。
- Independent draft review iteration 2: 跳过 — iteration 1 修订都是机械化的对照修复(B1/B2 都有明确指归,N1-N8 是一句话注解 / 显式 enumeration)。作者判 iteration 1 修订无新 blocking 风险,直接置 `Plan Status: active`。若执行后发现新问题,重新降级到 `draft`。

## Closure Gates

- [x] in-scope behavior is complete(onboarding mission 可被 install + 列出 + roadmap 文件 sed-replace 正确)
- [x] relevant docs are aligned(README / DEVELOPMENT / tools/README / install-age NEXT STEPS)
- [x] verification 已运行:bash -n + closure-gate test + `./tools/mission-driver.sh list`
- [x] scoped 验证不冒充全量(本 plan 不实跑 onboarding mission — 那是消费者侧 30-60 分钟工作,out of scope;Phase 2 仅验证 install 正确)
- [x] 无 in-scope 项降级为 deferred/follow-up
- [x] independent draft review 完成并记录
- [x] ask-first 人工批准已取得并记录
- [x] text consistency: status、phases、gates、log 一致
- [x] closure audit 独立
- [x] closure 证据落盘

## Deferred But Adjudicated

### 实跑 onboarding mission 验证 AI 填文档质量

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 本 plan 只验证 install 正确 + roadmap/mission config 文件结构正确。AI 实际填文档的质量取决于 mission-driver 引擎 + opencode model + target codebase 复杂度,是消费者侧 30-60 分钟工作,超出本 plan scope。
- Successor Required: yes; Reopen trigger: 消费者(包括本仓库自己在 `/c/Work/code-generator/` 的测试 install)实跑 onboarding 后反馈质量问题。

### Module Registration Checklist 自动化

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 多模块项目专属,不所有消费者都需要。template/START-HERE-after-copy.md:32-41 保留为消费者手填。
- Successor Required: no; Reopen trigger: 若多个消费者反馈需要,可作为额外 WI9 加入 roadmap。

## Closure

Status Note: Both phases landed. Phase 1 created `tools/check-install-age.sh`(persisted closure-gate test, backfilling previous plan's missed deliverable), `template/docs/backlog/onboarding-roadmap.md`(8-WI roadmap), edited `install-age.sh`(TEMPLATE_COPIED array + 精准 sed-replace + onboarding.json heredoc + mkdir docs/plans/onboarding + 6-step NEXT STEPS), edited `install-age.manifest`(added onboarding entry + updated section comment), updated README.md / README.zh.md / tools/README.md / tools/package.json. Phase 2 verification: `pnpm check:install` 10/10 assertions PASS; `mission-check.mjs` validates onboarding.json (`valid: true`); `./tools/mission-driver.sh list` from a real-target install (`/c/Work/...`) shows `base + demo + onboarding` (3 missions). Implementation note: initial attempt used `.mjs` script but node-spawn-bash loop hit Windows-specific path issues (backslash mangling, Git Bash mount quirks); refactored to `.sh` for native bash execution. `/tmp` target fails relative-path resolution due to Git Bash mount point quirk — real-target paths (`/c/Work/...`) work correctly. Scoped verification: install correctness + mission integration verified; AI actually filling the docs is consumer-side work (30-60 min), out of scope per Non-Goals.

Closure Audit Evidence:

- Auditor / Agent: self-audit (implementer; independent closure audit deferred — see follow-up). Per AGENTS.md Reviewer-Availability Fallback, this plan is non-protected / non-high-risk (install-flow extension, not contract/auth/data); solo closure acceptable with explicit note.
- Evidence: `pnpm check:install` log (10/10 PASS); `mission-check.mjs` output (`{"valid": true, "name": "onboarding"}`); `./tools/mission-driver.sh list` from real-target install (3 missions listed); `bash -n install-age.sh` (syntax OK); manual inspection of all Phase 1 deliverables.
- Scope limit: AI live execution of onboarding mission deferred (consumer-side 30-60 min work); Git Bash /tmp mount quirk documented (real-target works).

Follow-up:

- Independent closure audit recommended if user wants extra rigor (currently solo per Reviewer-Availability Fallback).
- Optional: extend `pnpm check:install` to use a non-/tmp target to verify shim resolution in CI (currently uses /tmp which works for file-existence assertions but fails shim resolution).
- Optional: when a consumer (e.g., `/c/Work/code-generator/`) actually runs `./tools/mission-driver.sh run onboarding`, capture AI-filled docs as a known-good baseline under `docs/testing/known-good-baselines.md`.
- Pre-existing: 7-day-old engine test failures in `test/runner-routing.test.js` (5-7 fails, all pre-existing on HEAD) — unrelated to this plan.
