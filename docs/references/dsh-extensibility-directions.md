# 给 DeepSeek Harness 的架构建议：以可逆计算重构声明式组合

本文是面向 DSH 团队的架构建议，不是兼容迁移或具体实现计划。建议将 DSH 的 plugin composition 从“顶层 entry array + 专用 patch 函数”提升为受元模型约束的结构模型；由通用 Loader 在 Cordis runtime 之前完成 config、Delta、feature 和验证，再将有效模型交给 Cordis 激活为 fibers。

目标是让 DSH 获得 Nop 可逆计算中的基础能力：**base 不动，Delta 独立存在；每个声明式模型文件经一次模型 Loader 注册后，都可复用同一套分层定制、来源追踪和验证机制。**

```text
Config sources
  -> ConfigProvider                         # 第一阶段：配置变量合成
  -> Structural Model Loader                # 第二阶段：模型 Delta 合成
  -> Cordis Loader / fiber tree             # 第三阶段：运行时结构合成
```

这不替代 Cordis。Cordis 继续管理 `apply(ctx, config)`、inject、fiber、effect、disposer、reconciliation 和 runtime HMR；新增结构层负责“最终应注册什么”。

## 1. DSH 当前设计的本质和边界

```text
bundle patch + profile patch + home patch + CLI patch
  -> applyEntryPatches()
  -> EntryOptions[]
  -> cordis:include
  -> Cordis Loader
  -> plugin apply(ctx, config)
  -> runtime contributions
```

`applyEntryPatches()` 按 entry `id` 找目标，再对 patch 顶层字段赋值。`config` 也是顶层字段，故 patch 一个 config 子字段会替换整个 config object。当前 `cordis:include` 与 `agent.cordis.yml` 的根也是 entry array。

这足以描述“启动哪些 plugin”，却不是长期的结构模型：

- config 字段没有可继承坐标，客户 patch 必须复制 base config。
- entry array 无处表达 `x:schema`、`x:extends`、source provenance 或模型 policy。
- profile、preset、settings、environment、CLI 各自解释来源，不能统一解释一个值/节点为何存在。
- `--dump-config` 最多说明 entry 行被哪个 patch layer 改过，不能解释嵌套 config、feature、删除或 runtime fiber 的来源。

## 2. 可逆计算给出的认识框架

### 2.1 `apply(ctx, config)` 是 Generator 与 Applier 的融合

`apply(ctx, config)` 可直观视为 `newCtx = apply(ctx, config)`，但它不替换 JavaScript `ctx`；它修改 Cordis 托管的运行时结构空间：service binding、event listener、registry entries、fiber tree、effect/disposer ownership。

```text
ΔP = G(ctx, config, runtimeInputs)
Σ' = Σ ⊕ ΔP
dispose(P) removes P-owned runtime contributions
```

当前 `apply()` 将“生成贡献”和“立即登记到 runtime fiber”融为一步。fiber dispose 可撤走自己登记的 listener、registry entry、service binding 和受管资源清理；它不回滚持久化数据、外部 I/O、模型调用、时间、随机数或失败 disposer。

### 2.2 Nop 将结构 Generator 与 runtime 消费分开

```text
App = Delta x-extends Generator<DSL>
```

Nop Loader 不把“base、配置、插件定义”拆成几类对象后再拼装。base model 本身就是完整结构；后续 Delta 在同一坐标系上整体叠加，得到重新编排后的有效模型。IoC、ORM、workflow、page 等 runtime 只消费这个普通有效模型。DSH 的自然演进是：

```text
EffectiveCompositionModel = BaseComposition x-extends DeltaComposition
Runtime = Activate(EffectiveCompositionModel)
        -> Cordis EntryOptions[]
        -> fibers / services / events / effects
```

可声明的 entry、config、group、tool catalog、policy、skill catalog、workflow 前移到模型层。`apply()` 内部的算法、I/O、闭包和不可声明 runtime 决策仍由 Cordis plugin 承担。

### 2.3 从稳定坐标推导全部设计要点

Delta 要能独立存放、独立组合、独立撤回，前提是作用于稳定坐标：

```text
Delta 独立存在
  -> 稳定坐标
  -> 元模型定义结构、类型、identity 与 merge algebra
  -> ConfigProvider 定义 feature/value 的输入坐标
  -> feature + Delta 在完整模型上叠加并重新编排 effective model
  -> SourceLocation/provenance 解释有效坐标来源
  -> runtime 只消费 effective model
  -> fiber/effect 管理 runtime contribution 生命周期
```

| 自然结论 | 原因 |
| --- | --- |
| 根使用 `x:schema`，而非 `version` | `version` 不定义节点、类型、default、list key、operator、validation；`x:schema` 使元模型成为唯一权威。 |
| entry 用 `id` 而非 module `name` 定位 | `id` 是稳定 composition 坐标；`name` 是可改名/重新解析的 artifact specifier。 |
| object 按 key 合并 | map key 是稳定坐标；未覆盖字段自动继承 base。 |
| ordinary array 默认 replace | 下标会漂移；猜 `id/name` 会把业务字段误当 identity；只有 schema 声明 key/ordering 才可 keyed merge。 |
| `null` 不等于 remove | 区分设空、删除 inherited node、回退 schema default。 |
| `name` 修改使用 `x:override: replace` | artifact 可能完全不同，应对应旧 fiber dispose 与新 fiber mount。 |
| feature/Delta 由 Loader 处理 | runtime 只消费最终模型，不重新解释客户选择。 |
| 三阶段有 provenance/dump | 否则不能独立审计 Delta 或诊断升级结果。 |

## 3. 目标：三阶段结构合成

### 3.1 第一阶段：ConfigProvider

`nop-config` 表明 config 不是零散 environment string，而是独立结构模型：多个 source 按优先级合成；每个值携带 `ValueWithLocation`；`config.vars.yaml` 定义变量类型、default、说明和 `SourceLocation`；`ConfigReference` 支持 `${...}`、动态更新和订阅。

DSH 应建立同构的第一阶段：

```text
config sources
  -> config-vars model / schema
  -> typed ConfigProvider
  -> ConfigReference<T>
  -> frozen ConfigEnvironmentSnapshot for one model compilation
```

统一 dotted coordinate、source precedence、schema、SourceLocation、owner、permission、secret policy、dynamic reference 和 change notification：

```text
dsh.env
```

`ctx.settings` 的 user storage、revision、watch、redaction、schema default/base/user layering 和 live/restart 生命周期不应丢失；它应成为 ConfigProvider 的 typed source，而不是永久与 environment/profile/CLI 平行的另一套命名空间。

| 配置域 | owner | 可写 source |
| --- | --- | --- |
| launch/bootstrap | host/boot | defaults、deployment config、OS/.env、CLI |
| composition selector | profile/preset mount owner | trusted profile/preset config、launch overlay |
| plugin setting | plugin schema owner | composition base、用户持久化 settings |
| security capability | credential/host provider | trusted host source only |

普通用户配置不能伪造 credential capability；secret 实值不进入 feature、dump、provenance 或 compilation snapshot。

### 3.2 第二阶段：Structural Model Loader

每种声明式模型文件由 `x:schema` 指向元模型：

```yaml
x:schema: /dsh/schema/composition/composition.xdef
x:extends: base-agent.composition.yml
entries:
  - id: web
    name: '@deepseek-ai/dsh-web'
    config:
      searchProvider: deepseek
      fetchProvider: deepseek
```

元模型定义：

```text
allowed nodes/fields
field types, required/default
collection identity and ordering
legal x:extends/x:override/feature positions
Delta merge algebra
effective-model validation
```

Loader 不把配置与 plugin 拆开重组。每一份 base composition 或 Delta composition 都是同一个 schema 下的完整或部分模型；Loader 只按 stable coordinate 将当前 resource 的结构贡献整体叠加到 parent effective model，从而重新编排 effective model：

```text
resolve resource path and x:extends graph
  -> parse current resource
  -> feature:on/off prunes current-resource contributions
  -> overlay current Delta on parent effective model
  -> resolve schema-authorized value references
  -> validate and freeze EffectiveModel
  -> retain SourceLocation, Delta chain, operator and dependencies
```

任何模型 type 只要注册 `x:schema`/parser dialect、stable coordinate、collection identity、merge/directive policy、validator、runtime adapter/consumer，即可复用这套 Loader 基础设施。它自动获得 path-based base/Delta composition、feature、value resolution、validation、provenance、dump 和 dependency tracking；仍不会自动合并 TypeScript closure、二进制、普通文本或无结构坐标的 array。

### 3.3 第三阶段：Cordis runtime structure

```text
EffectiveCompositionModel
  -> composition adapter
  -> EntryOptions[] candidate
  -> cordis:include / Cordis Loader
  -> mount / update / dispose fibers
```

| Structural Loader | Cordis runtime |
| --- | --- |
| entry/config/group 是否存在 | fiber 是否可激活、何时激活 |
| base/Delta/feature/value/schema | service inject、event、registry、effect |
| SourceLocation、provenance、model digest | fiber owner、dispose、reconciliation |
| compile failure 不触碰 runtime | activation failure 尽力恢复 fiber-owned structure |

Cordis rollback 不代表外部副作用逆转：plugin 已写入的持久化数据、网络/文件/模型调用、非受管状态或失败 disposer 不会自动恢复。

## 4. 固定的 Delta 语义

### 4.1 `x:extends`、`x:override` 和 identity

`x:extends` path 相对当前 resource 解析。多个 parent 从左到右组装，后 parent 覆盖前 parent，当前 document 最后覆盖。循环、缺 parent、schema 不兼容、重复 identity、删除不存在节点均在 activation 前报出 source path 和完整结构坐标。

| 坐标域 | identity | 规则 |
| --- | --- | --- |
| model root | `x:schema` | parent/child schema 必须兼容 |
| composition `entries` | sibling-unique `id` | 同 id 递归合并；新 id 新增 |
| Cordis group child | sibling-unique `id` | 同 entries |
| ordinary config object | key path | 递归合并 |
| ordinary config array | field path | replace |
| schema-declared keyed array | schema key + ordering | keyed Delta merge |
| scalar/type change | field path | Delta 覆盖 base |

```yaml
entries:
  - id: tool-web
    x:override: remove
  - id: web
    config:
      searchProvider:
        x:override: replace
        value: exa
```

`remove` 是显式负 Delta：从 inherited model 删除坐标；高层 Delta 可重定义同 identity 使其重现。`replace` 丢弃 base 子树。control marker 在 effective model 中清除，普通 `null` 由领域 schema 解释。

### 4.2 `feature:on/off` 与 `disabled: !!js` 是两条线

```text
feature:on/off       = 当前 resource 是否贡献当前 node
x:override: remove   = 当前 Delta 是否删除 inherited node
disabled: !!js       = Cordis 是否在当前 runtime mount surviving entry
```

feature 只裁剪当前 resource 的 map property、list item、group child 或 entry；条件不满足时该 resource 不贡献该 node，不隐式删除 parent node。删除 inherited node 只用 `x:override: remove`。

feature 读取 ConfigProvider 的 compilation snapshot，不读 `ctx` service、network/filesystem I/O、clock、random、未记录 process state 或 secret actual value。不同 composition consumer 可以向 Loader 提供不同 scope 的 snapshot；这不会改变 Delta 的结构语义。

`disabled: !!js` 保持 Cordis runtime 语义：它作用于完整 surviving entry，且可沿 entry tree ancestor 影响 descendant mount。dump 必须区别：

```text
feature pruned: current resource did not contribute node
Delta remove: inherited node removed from effective model
disabled: effective entry exists but is not mounted
```

### 4.3 Value resolver 与 validation

结构 value resolver 只能出现在 schema 声明的位置；它读取 ConfigProvider 并生成普通模型值，不能生成 `id`、`x:schema`、`x:extends`、`x:override` 或 feature control information。resource graph、stable coordinate 和 Delta operator 必须先于 value evaluation 固定。

```text
ConfigProvider snapshot
  -> feature prune current resource
  -> x:extends / Delta merge
  -> resolve allowed value positions
  -> validate effective model
```

`!!js` 是 Cordis runtime expression，不与结构 value resolver 混为一种语言或生命周期。其迁移/兼容不是本文核心；目标边界是“结构表达式不执行 runtime code”。

## 5. 三个 dump：每层回答不同问题

```text
dump-config-vars(ConfigProvider snapshot)
dump-model(EffectiveModel)
dump-runtime(Cordis state)
```

| Dump | 应回答的问题 |
| --- | --- |
| Config vars | 值、类型、default、source path/line、覆盖链、owner、读取权限、secret redaction、snapshot identity |
| Effective model | entry/config/group 来自哪个 resource/line？哪个 Delta/operator 改写？哪个 feature 使当前 resource 贡献/裁剪？value resolver 读了哪些变量？ |
| Runtime structure | 哪个 entry/fiber mounted？resolved config、fiber owner、inject resolution、service/registry/event/effect contribution、update/dispose/rollback 状态？ |

当前 `renderConfigDump()` 只能在 entry 行级显示 base/patch 来源，不能提供字段级 SourceLocation、Delta chain、feature decision 或 runtime state。三阶段 dump 使 configuration/model/runtime 的结果分别可解释、可审计。

## 6. 与当前 DSH 的本质差异和可解决的问题

| 当前设计 | 建议设计 | 解决的问题 |
| --- | --- | --- |
| entry array 是 source format | `x:schema` model document；entries 是 runtime adapter 输入 | composition 有 schema、extends、SourceLocation、policy 和 metadata 的位置 |
| `applyEntryPatches()` 顶层赋值 | schema-aware Delta merge | 客户只维护变化；base 无冲突新增自动继承 |
| config source 分散 | typed ConfigProvider + ConfigReference | feature/value/model 读取同一可追踪坐标空间 |
| `disabled: !!js` 承担条件选择 | source-local feature + runtime disabled | 任意节点结构裁剪与 runtime entry 启停分离 |
| dump 是 entry 行注释 | config/model/runtime 三层 dump | 可解释值、node、fiber 的来源与状态 |
| 子系统私下定义 overlay | shared structural Loader | 新模型不再重造 base/Delta/feature/validation/provenance |
| runtime 直接面对 patch 后 entries | runtime 只面对 validated effective model | Delta 错误在 activation 前失败 |

直接效果：客户仅覆盖 `web.config.searchProvider` 时，`fetchProvider`、`maxResults` 等未冲突 base 字段自动保留；同一机制适用于删除 base entry、条件 tool group 和其他声明式模型。

## 7. 平台定制默认是加法，不是 runtime 卸载

若将 DSH 作为 agent 应用的承载平台，发行物自然是：

```text
Platform = Core + BasePluginSet + CustomerPluginSet
```

客户定制的默认动作应是**增加新的 plugin、definition、provider、policy、tool 或 model Delta**，而不是删除基础包、fork 基础 plugin，或先启动基础 fiber 再 runtime unload。基础 package 可以始终作为平台发行物存在；客户只需增加更具体的完整或部分模型定义。Loader 不拆分 package、config 和 base 后重新拼装，而是在同一 composition 坐标系上将 Delta 整体叠加到 base，使有效模型重新编排。

```text
BaseComposition + CustomerDelta
  -> Structural Loader
  -> EffectiveCompositionModel (one rearranged whole)
  -> Cordis activates only the effective entry tree
```

例如基础模型定义默认搜索 provider：

```yaml
# base composition
entries:
  - id: web-search
    name: '@deepseek-ai/dsh-web-search-deepseek'
    config:
      provider: deepseek
```

客户 Delta 不删除基础 package，只增加自己的差异：

```yaml
# customer Delta
entries:
  - id: web-search
    config:
      provider: exa
```

基础包仍被安装、可追溯、可随产品升级；effective model 选择 `exa`，Cordis 从一开始只激活最终 entry/config。客户的动作是“增加 Delta 定义”，不是“运行时卸载 DeepSeek provider”。

### 7.1 加法式定制与 Delta 内部运算不矛盾

从客户视角，定制应尽量是加法；从 Loader 的结构代数看，仍需明确 merge/selection/replace/remove，才能表达“基础定义存在，但最终不以原样生效”。

| 客户增加的定义 | effective model 的结果 | 是否需要 runtime unload |
| --- | --- | --- |
| 更高层 config 值 | base 默认值仍可追溯，最终值为客户值 | 否 |
| 新 provider + selector | base provider 仍是候选，selector 选客户 provider | 否 |
| 同坐标 specialization/override | base node 被客户 node 结构性替换 | 否 |
| `x:override: remove` | effective model 不包含该 base node | 否 |

因此 `remove` 仍是完整 Delta algebra 所需的显式负元素，但不是平台日常定制的主路径。优先级应是：

```text
add -> specialize -> select -> override -> remove
```

只有确实要禁止一项基础能力时才使用 `remove`。这使客户层保持累加式，同时保留 base-preserving customization 所需的完整结构运算。

### 7.2 为什么不能将 runtime unload 当作定制机制

```text
不应采用：
mount base plugin -> register contributions -> unload base plugin -> mount customer plugin
```

基础 fiber 在卸载前可能已经注册 tool/provider/listener、创建资源、触发 service reconciliation、写入 session/state 或发生外部 I/O。Cordis disposer 能清理 fiber-owned 受管贡献，但不保证回滚业务数据或外部副作用。

结构层合成避免这一问题：base 与 customer 的选择在 fiber 激活前完成，Cordis 只消费 effective entry tree。runtime unload 继续是 HMR、故障恢复、显式停用和生命周期管理能力，不应成为客户层替换基础平台行为的常规定制工具。

## 8. 建议团队优先确认的设计空间

本文的核心建议是确认以下结构边界：

```text
ConfigProvider produces typed, sourced inputs
Structural Loader produces validated effective models
Cordis activates effective models as runtime fibers
```

DSH 团队应围绕以下问题设计，而不应继续将它们分散在 patch、plugin apply 和 runtime branches 中：

- `x:schema` 如何使模型定义自己的 type、identity、merge/feature/validation 规则？
- ConfigProvider 如何统一 config reference、source precedence、SourceLocation、secret/authority 和 compilation snapshot？
- 哪些内容是可声明模型，哪些必须保留为 plugin runtime code？
- effective model 如何映射到 Cordis entry/fiber update、dispose 和 best-effort rollback？
- profile、preset、policy、catalog 等不同 consumer 如何各自消费同一 effective model identity，同时保持自己的 runtime lifecycle？
- 三阶段 dump 如何让用户解释“值从哪来、节点为何存在、fiber为何激活”？

具体 format migration、现有 `!!js` compatibility、vendor Include 接线、cache implementation、CLI 名称、物理 settings storage 和 rollout 顺序可以由实现方案另行决定。它们不应反过来决定是否建立结构层，也不应改变 `x:schema`、stable coordinate、Delta algebra、feature/remove separation、SourceLocation/provenance 和 runtime adapter 这些基础原则。

DSH 已有强大的 runtime composition 基础。补上结构模型合成后，它可以同时获得 Nop 式 base-preserving Delta customization，以及 Cordis 式 dynamic fiber lifecycle/reconciliation。
