# 2026-07-24-1030 mission-driver-web naive-ui 按需减包

> Plan Status: completed
> Last Reviewed: 2026-07-24
> Source: user request — 减小前端首屏打包体积（index-*.js 1.47MB）
> Related: 2026-07-24-1030-mission-driver-web-onboarding-committed-dist-plan.md（A+B，分拆自同一评审）
> Audit: required

## Current Baseline

Live facts (read from repo 2026-07-24，已核对文件):

- 首屏入口 `dist/assets/index-*.js` = 1.47MB raw / 408KB gzip（本地 build 实测值，dist 未入 git，视为"本地测得、待 Phase 1 用 visualizer 复核"）。
- 根因：`web/src/main.ts:3,17` `import naive from 'naive-ui'` + `app.use(naive)` **全量注册**整个 naive-ui，覆盖 Vite tree-shaking。经 grep 验证入口 chunk 混入应用**从未使用**的组件：Calendar(87)/TimePicker(25)/Cascader(18)/DatePicker(13)/Transfer(29)/ColorPicker/Mention/AutoComplete/Carousel + date-fns 本地化(formatDistance)。
- 业务组件多已按需 `import { N* } from 'naive-ui'`；但 `App.vue` 的 `<n-config-provider>/<n-message-provider>/<n-layout>/<n-layout-content>` 仅依赖全局注册（只 import 了 `darkTheme`/`GlobalThemeOverrides` 非组件导出）。
- 评审确认：`web/src` 内无 `<component :is="'n-…'">` 字符串动态解析组件，按需重构不会漏解析。
- naive-ui 共享核心（vueuc/css-render/seemly/treemate/evtd）无法 tree-shake，删未用组件的收益是"可量化下降"而非腰斩。

Gap: 全量注册导致大量未用组件进入首屏 chunk，可通过按需导入去除。

## Goals

- 删除全量 `app.use(naive)`，naive-ui 改按需，入口首屏 gzip **有可量化下降**（记录前后数值）。
- 功能零回归：provider（暗色主题、message toast）、各 Modal、两路由渲染正常。

## Non-Goals

- 不承诺首屏"腰斩"（naive-ui 共享核心不可裁剪）。
- 不换 UI 库、不做 Modal 懒加载（列入后续候选）。
- 不改后端引擎/flow/prompt，不碰分发与 dist 提交（属 A+B 姊妹 plan）。

## Task Route

- Type: `implementation-only change`（前端按需重构，不改分发/契约）
- Owner Docs: `tools/mission-driver/web/README.md`、`tools/mission-driver/CONTEXT.md`（技术栈段）
- Skill Selection Basis: naive-ui 全量→按需属机械重构 → `docs/skills/code-refactor-prompt.md`。
- Autonomy: 非 protected area、用户直接请求、低风险 → 可自主实施（reviewer availability 占位=none 仅影响 A+B 的 deployment 类改动，不阻塞本 plan）。

## Infrastructure And Config Prereqs

- 使用工具本地验证命令（`npm run typecheck`/`npm run build`，`workdir=tools/mission-driver/web`），不依赖 `project-context.md` 占位命令。
- 若选自动按需方案，新增 devDeps：`unplugin-vue-components`（+ 可选 `unplugin-auto-import`）。
- 回滚：纯源码/配置改动，git revert 即可。

## Execution Plan

### Phase 1 - naive-ui 按需减包

Status: completed
Targets: `web/src/main.ts`、`web/src/App.vue`、`web/vite.config.ts`、`web/package.json`、任何 template 用 `<n-*>` 但未 import 的组件、`web/README.md`、`CONTEXT.md`
Skill: `code-refactor-prompt`

- Item Types: `Proof | Decision | Fix | Add`
- Prereqs: 无

- [x] `Proof(基线)`：用 `vite build` 每-chunk gzip 输出作基线（免加 devDep）。改造前首屏为**单一入口** `index-*.js` = 1476.48 KB / **gzip 408.74 KB**，且 grep 确认入口含未用组件（Calendar 87/Transfer 29/TimePicker 25/Cascader 18/DatePicker 13…）。
- [x] `Decision`：选 (a) `unplugin-vue-components` + `NaiveUiResolver` 自动按需。理由：零手改即可覆盖 `App.vue` 等仅靠全局注册的 provider/layout；社区主流。备选 (b) 手动逐文件 import 易漏 App.vue，被否。残余风险：新增 1 个构建期 devDep（可接受）。`useMessage`/`useDialog` 等 composable 全项目已显式 import，无需 `unplugin-auto-import`。
- [x] `Fix`：删除 `main.ts` 的 `import naive` + `app.use(naive)`（保留 `darkTheme`/`GlobalThemeOverrides` 手动 import）。App.vue 等的 `<n-config-provider>/<n-message-provider>/<n-layout>/<n-grid>/<n-tabs>/<n-select>…` 由 resolver 自动补齐（见生成的 `components.d.ts`）。
- [x] `Add`：`vite.config.ts` 加 `Components({ dts: 'src/components.d.ts', resolvers: [NaiveUiResolver()] })`；`package.json` 加 devDep `unplugin-vue-components@32`；`src/components.d.ts` 为**构建自动再生的产物**，已加入 `web/.gitignore`（不入 git；置于 `src/` 内以落在 tsconfig `include`，供 IDE/未来 strictTemplates 使用；`vue-tsc` 当前 strictTemplates 关闭，缺失亦不报错）。
- [x] `Proof(对比)`：改造后首屏 = 入口 `index-BXlkLssv.js` 375.87 KB/gz **117.17** + 静态共享 `index-3RZDE2zp.js` 289.38 KB/gz **80.82** ≈ **gzip 197.99 KB**（保守计两 chunk 均首屏）。**gzip 408.74 → ~198 KB，约 −51%**。未用组件近乎清零：Calendar 87→2、Transfer 29→6、TimePicker 25→4、Cascader 18→3、DatePicker 13→3、date-fns formatDistance 8→1（残余为零星字符串匹配非实现）。
- [x] `Fix(doc)`：`CONTEXT.md` NFR-3 行 + `web/README.md` 更新为“按需导入 + 首屏 gz≈198KB”。

Exit Criteria:

- [x] `npm run typecheck` + `npm run build` 全绿；入口 gzip 408.74 → ~198 KB（下降 ~51%，有 build 输出为证）。
- [x] 运行时冒烟通过（Playwright headless 加载 `vite preview` 首屏）：`appMounted=true`、`naiveRendered=true`、**0 console/page errors**；页面完整渲染 RunList（header/表格/tag/layout/暗色主题），证明删全局注册后 provider 未失效。RunDetail 的 Modal 组件已由 resolver 注册（`components.d.ts` 列出 NConfigProvider/NMessageProvider 等）。
- [x] `web/README.md`/`CONTEXT.md` 与“按需”一致。
- [x] `docs/logs/2026/07-24.md` 追加条目。

## Draft Review Record

- Independent draft review iteration 1（subagent, task ses_06e05cf6effe1FvCvMicJYZchh, 2026-07-24）: 原 A+B+C 合并 plan 判 `needs revision`。针对 C 的相关结论：M3=建议将 C 从 A+B 拆分（本 plan 即拆分结果，C 可独立 ship）；m4=Non-Goals 诚实、以"可量化下降"为验收上限、以 provider 冒烟为回归证据，"materially lowers C's risk"；m5=已核对 baseline 事实与 live 文件一致，且无字符串动态组件解析 → 按需重构安全。C 部分无 Blocking/Major 遗留。
- 结论：拆分后 C 为非 protected、低风险、implementation-only，draft review 无阻塞项 → 置 `active`。

## Closure Gates

- [x] 按需改造落地、全量 `app.use(naive)` 已删
- [x] `web/README.md`/`CONTEXT.md` 与"按需"对齐
- [x] 验证已运行：`npm run typecheck`、`npm run build`、Playwright headless 首屏冒烟（provider/Modal 组件注册确认）
- [x] 入口 gzip 下降有 build 输出前后数值为证（408.74 → ~198 KB）
- [x] 无 in-scope 项降级为 deferred/follow-up
- [x] 独立 draft review 已完成并记录（见上）
- [x] 文本一致性：状态、phase、exit criteria、closure gates、log 一致
- [x] 独立 closure audit（subagent）
- [x] 闭环证据落盘

## Deferred But Adjudicated

### 首屏进一步减小 / 换更轻 UI 库 / Modal 懒加载

- Classification: `optimization candidate`
- Why Not Blocking Closure: naive-ui 共享核心不可 tree-shake；更激进优化收益/成本另评。
- Successor Required: `no`（若未来有硬性首屏 KB 预算再单开 plan）

## Closure

Status Note: naive-ui 按需改造完成并验证；首屏 JS gzip 由 408.74KB 降至 197.99KB（−51.6%，独立 closure audit 复核为保守计法，入口单 chunk 更是 117.17KB/−71%）。typecheck+build 全绿，未用组件已 tree-shake，运行时首屏冒烟 0 错误，无组件解析回归。

Closure Audit Evidence:

- Auditor / Agent: 独立 subagent（task ses_06df0ad4fffeEZRDHNVgEdf7b6，2026-07-24）
- Evidence: 独立复跑 typecheck+build（均 exit 0），实测首屏 entry 117.17KB gz + landing-route 共享 80.82KB gz = 197.99KB gz；grep 确认 dist 中 Calendar/DatePicker/Transfer 等未用组件仅剩零星字符串；静态交叉核对全部 34 个 `<n-*>` 标签均被 resolver 或显式 import 覆盖（含 RunDetail/Modal 等未运行时 exercise 的路由）→ 未运行路由的冒烟缺口判为可接受残余（组件解析为编译期，绿构建即证明）。
- Verdict：初次 `closure rejected`（唯一 must-fix：`components.d.ts` 未入 git 且原 plan 声称"入 git"不实）→ 已修正：dts 改生成于 `src/`、加入 `.gitignore`、更正 plan 措辞；rebuild 全绿（entry hash 不变，确定性）。技术项全部独立通过。

Follow-up:

- 无阻塞项。首屏进一步优化（换 UI 库/Modal 懒加载）见 Deferred。
