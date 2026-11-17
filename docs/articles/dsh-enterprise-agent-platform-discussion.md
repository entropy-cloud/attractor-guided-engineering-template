# A Reversible Computation Lens on DeepSeek Harness: Unifying Configuration,Composition,and Runtime Reversibility

> 发布草稿（目标：https://github.com/deepseek-ai/deepseek-harness/discussions）

## 太长不看

1. DeepSeek Harness（DSH）作为通用Agent平台的自然发行物是 **核心 + 基础插件集 + 基础配置** 组成的稳定整体，客户在不修改整体的前提下，可以靠 **差量配置 + 新增插件** 完成定制。它的 profile/bundle/patch、preset 与 `dsh plugin add` 已经是这个方向。
2. 只要承诺“base 不动、只叠加增量”，就会遇到可逆计算（Reversible Computation）的核心图景：`Y = X + ( −C + D )`。Delta 要能独立存放、独立组合、独立解释，前提是它作用在一个**稳定的结构坐标系**上。
3. 这套图景在 DSH 里已有迹可循。整个程序结构空间可以递归地分成三层——**配置空间（配置变量/settings）→ 静态结构空间（组合模型 entry tree）→ 运行时结构空间（Cordis ctx/fiber）**。每一层在 DSH 里都已经有真实的坐标与真实的结合运算，只是分散在不同机制里、没有用同一套理论语言明确表达来。
4. 用这套语言看，DSH 在**运行时结构空间**（Cordis 的 fiber/effect/disposer 可逆生命周期）做得相当完整；相对更值得讨论的，是**静态结构空间**目前的合并粒度以**整条 entry 行**为单位（`applyEntryPatches` 浅替换、无字段级深合并、无结构级条件），以及**配置空间**的来源统一与追踪。补这两块的“最小增量”不需要推翻任何现有机制。
5. 一个可行的中间档是给组合层补“**结构层条件 + 字段级合并**”：让任意组合节点可以依据配置空间里的变量决定自己是否存在（一种类似 Spring Boot `@Conditional`、Nop `feature:on` 的受控裁剪），而不是只有 entry 级的 `disabled`。不需要图灵完备的生成器。


## 1. 平台化的自然形态与历史参照

DSH 的高可扩展性，使它有潜力成为企业级 Agent 应用平台的基础，而企业级应用平台最朴素的可扩展目标是：

```text
平台整体（核心 + 基础插件 + 基础配置）→ 随版本演进，尽量不被客户改动
客户定制（差量配置 + 增量插件）       → 叠加在整体之上，尽量不直接修改Base
```

DSH 的组合机制已经是朝这个方向设计的：

- **profile**：`$DSH_HOME/profiles/<name>`，`package.json` 里 `dsh.profile.bundles` 声明有序 bundle 层，profile 再叠自己的 `cordis.patch.yml`（`packages/boot/app-boot/src/profile.ts`、`docs/architecture.zh.md`）；
- **bundle**：一个 npm 包用 `dsh.bundle.patch` 指向自己的 `cordis.patch.yml`，作为 profile 的一层（`packages/boot/app-boot/README.zh.md`）；
- **叠加顺序**：bundle 层 → profile 用户 patch → `$DSH_HOME/cordis.patch.yml` → `--patch` overlay（`apps/cli/src/profile-boot.ts`）；
- **agent 侧**：agent preset（`agent.cordis.yml`）作为常驻 scope 的 entry 树，需要改动时用 `ctx.agentPresets.copy()` 取副本；
- **加插件**：`dsh plugin --profile <name> add <pkg>`，自动 reconcile 进 `dsh.profile.bundles`（`apps/cli/src/plugin.ts`）。

观察其他复杂平台系统，可以看到一种反复出现的演化压力：当配置面和业务组合复杂度上升到一定程度后，纯静态声明容易退化成复制粘贴，纯代码生成又难以审计，于是很多系统会收敛到“声明式组装文件 + 受限动态组合性”的中间档。

- **Spring 早期**：配置完全静态指定，几乎每个应用都把同一套结构复制一遍。
- **Spring Boot**：引入“由配置变量驱动的动态裁剪”（`@Conditional` 一族），同一套定义在不同变量取值下被裁成不同形态，**配置层因此稳定下来**。它不是图灵完备的生成，只补了一个很受控的档位。
- **Kubernetes**：配置复杂到一定程度后，从 Helm 的完整模板生成，走向 Kustomize 的 base+overlay 补丁——也只引入“很小、可控”的动态性，换取可预测、可审计。

这里的一个共同趋势是：**当一个配置面的复杂度超过一定程度之后，可以在“整份重写”和“图灵完备生成”之间补一个中间档——由少量配置变量驱动的、受限的动态裁剪。** 如果希望 base 尽量被共享、避免客户默认复制后修改，就值得继续补强这一档。

## 2. 理论准备：粗粒度的整体复用为什么必然引出可逆计算理论

（广义）可逆计算关心的一个基本问题问题是：两个形态存在重叠的结构，能否不靠“复制粘贴再改”，而靠“一个共享的 base + 一段差异”来表达。

```text
X = A + B + C
Y = A + B + D
Y = X + ( −C + D ) = X + Delta
```

只要在完全不分解并重组X的情况下复用它，把Y表达为X加差量变化这一形式，这里的差量就必然是负元素（去掉C）和正元素（增加D）的混合体。

这不是哪个框架的偏好，而是结构整体复用所必然导致的数学后果：**粒度越大越难找到一模一样的可复用部分，粗粒度复用必然涉及到减的操作**

在不同的平台中，实际会选择不同的Delta表达形式和Delta运算规则，而一个平台在理论层面能达到的可扩展能力就依赖于这些规则的设计。一个良好的支持Delta运算的系统在理论上应当满足如下三条基本要求：

1. **Delta 必须能独立存在**——单独存放、单独组合、单独解释。（理论上还要能回撤；DSH 当前在运行时层已可回撤，结构层则需要细化。）
2. **Delta 独立存在的前提是稳定坐标**——每个可被增删改的元素，要有一个不随上游升级漂移的坐标（例如服务名和entry `id`，而不是数组下标）。
3. **每个坐标点上必须定义结合运算**（按 key 并、整行替换、按声明 key 合并、条件存在、删除……），并问清它是否可逆、是否满足结合律。

于是，不同支持定制的技术路线在“定制能力”上的差异，会自然的收敛到极少数几个维度：

| 维度 | 问题 |
| --- | --- |
| 结构坐标系如何选 | 用路径 key、条目 id，还是注册表键当 identity？ |
| 坐标粒度 | 细到整个文件、一条 entry，还是一个字段？ |
| 坐标系是否稳定 | 平台升级会不会漂移坐标、打破客户已写的 Delta？ |
| 是否允许自定义扩展 | 客户能否声明新的坐标点、新的结构类型？ |
| 坐标点上的结合运算 | 替换/合并/条件存在/删除；是否可逆、可组合、可解释？ |

结论：**谁把自己的结构坐标系与结合运算讲清楚了，谁就能把“平台定制”从“拷贝修改”升级成“组合叠加”。**

## 3. 三层结构空间：程序形态的递归分解

根据上一节的讨论，可组合性的本质是定义在一个结构空间上的 Delta 合并运算。接口组合、配置合成、组合模型 patch、运行时注册，都可以纳入这个模型；区别只在于结构空间如何选坐标、坐标点上定义什么合并规则。这就引出一个问题：DSH 里这种支持 Delta 运算的结构空间有哪些？

DSH 关于可组合性的讨论和实现，主要集中在运行时（Cordis fiber/effect/disposer）。但很多可配置、可组合的内容，并不必然要在运行时执行 if/else 动态判断——比如装哪个插件、用哪份 preset，答案在装载前就已确定，更适合在更早阶段裁剪掉。

仔细分析“程序结构从何而来”，可以看到程序结构并不是一次性构造得到的，而是可以分成递归构造的三个阶段：

```text
配置空间（配置变量 / settings）
    ↓ 生成 / 裁剪
静态结构空间（组合模型 / entry tree）
    ↓ 激活 / 撤销
运行时结构空间（Cordis ctx / fiber）
```

前一阶段生成下一阶段的结构；在每个阶段，都可以定义某种可逆组合。写成一般形式：

```text
目标结构 = 变换(源结构) + Delta
```

其中“变换”是这一阶段的生成/裁剪或激活规则，Delta 是在该阶段定义的组合操作。逐阶段代入，就是：

```text
组合模型   = 裁剪( 配置变量 + Delta_配置 ) + Delta_组合
运行时结构 = 激活( 组合模型 + Delta_组合 ) + Delta_运行时
```

关键在于层与层之间是结果耦合，不是结构耦合。以配置空间为例：它本身是一个 Map 空间，配置怎么拆、怎么合、谁覆盖谁，完全是这一层内部的事；下一层只读到一个已合成的配置快照，不需要知道它是几份配置、按什么规则合出来的。上层内部的拆分方式变化，只要最终快照不变，下层完全不用改。

每一阶段都是如此：各自有独立的结构坐标系和 Delta 合并规则，只对下一层暴露合成结果，不暴露内部构造。因此各阶段的 Delta 可以分别演化——平台升级 base 时客户的 Delta 仍然成立，客户改 Delta 时也不需要触碰其他层。前提是每层的结构坐标系稳定、变换规则明确。

下面把这三个阶段分别对应到 DSH 的真实机制。

### 第一层：配置空间（配置变量 / settings）

理论上这是一张平面坐标的 Map：坐标是 key，值可以是嵌套对象。K8s 的 `ConfigMap`、分布式配置中心管理的都是这一层。**这一层可以定义明确的Delta 合并规则**：分布式配置中心会覆盖进程缺省启动配置里的同名 key，通过命令行参数指定的配置项也可以覆盖程序内置的配置文件中定义的配置项，这种根据优先级确定的覆盖叠加就是一次合成。

DSH 里这一层的真实分布：

- **启动环境**由 `@deepseek-ai/dsh-launch-environment` 在 Cordis 启动前冻结成 `LaunchEnvironmentSnapshot`，一次性注入（`apps/cli/src/profile-boot.ts`）。值得注意：这个快照**本身已经是带有源坐标的数据模型**——每个 `LaunchEnvironmentEntry` 携带 `value`、`source`（`process`/`project-env`/`user-env`）与 `path`，并按来源优先级解析；
- **用户设置**由 `ctx.settings`（`SettingsProvider`）+ `SettingsScope<T>` + `SettingsNamespace` 管理：schema 默认 → 组合 base → 用户分节三层解析，写入带 revision 乐观锁，`update()` 会把稀疏字段深合并进用户分节（`docs/subsystems/settings.zh.md`、`packages/settings/settings/README.zh.md`）；
- **CLI**：启动器只解析 `--profile`/`--patch`/`--dump-config`/`--dump-default-config` 等少量 flag，其余参数以只读快照 `ctx.cmdlineArgs` 透传，由各应用插件自行解释（`apps/cli/src/args.ts`、`packages/boot/cmdline`）。CLI 值通常经 `!!js` 插值去覆盖 entry config 的字面值，并不参与 settings 的解析。

DSH 在若干份文档里分别记载了各区域的优先级规则：

- 环境：继承的 shell 环境 > 调用目录 `.env` > `$DSH_HOME/.env`；
- settings：schema 默认 → 组合 base → 用户分节；
- patch 层：bundle → profile patch → home patch → `--patch` overlay。

其中特别值得注意的是 **settings 的用户分节位于 entry config base（composition）之上**——这本身就已经构成一次“配置层的 Delta 层叠”：settings 用户层盖在 entry 的 config base 之上。

需要同时指出的两点现状（也是后面第 5 节的引子）：

- 这些规则分布在**几份分离机制**上，缺少一个**跨来源的统一坐标视图**：settings 解析值本身不记录每个字段来自哪一层，CLI/settings/entry/环境之间也没有统一的来源追踪；
- 凭据类配置刻意走另一条**更窄且独立**的安全顺序（继承环境 > `$DSH_HOME/.credentials.yaml` > 调用目录 `.env` > `$DSH_HOME/.env`），不进非机密 ladder。

### 第二层：静态结构空间（组合模型 / entry tree）

理论形态：K8s 对象 DSL、Spring beans 配置、Cordis 的 `cordis.yml`/patch 文件都在这一层。理想上它满足

```text
ModelDSL = Generator(配置变量)
```

即同一份模型依据变量取值被裁剪/补全成不同形态。Nop 平台的 `feature:on="xxx and yyy"` 是一种比较彻底的做法：**任意 DSL 节点**都可以声明一个存在条件，条件读取配置合成快照；不满足时该节点不贡献，满足时才存在。

DSH 里这一层的真实载体与坐标：

- 坐标对象是 **`Entry` / `EntryOptions`**（`id`、`name`、`config`、`group`、`disabled`、`inject`…，`isolate`/`intercept` 由声明合并另行加入），一棵 **`EntryTree`** 由 `cordis-plugin-loader` 维护；entry `id` 在整棵树的 store 上唯一，嵌套子树以父 id 为前缀命名空间化（`vendor/loader/src/config/entry.ts`、`tree.ts`）；
- entry-list 的 YAML 家族（`cordis.yml` / `cordis.patch.yml` / `agent.cordis.yml`）本身是一种**组合方言**——可以公允地说，**这才是 DSH 真正可称为声明式 DSL 的部分**（`vendor/include` 导出的 `entryListSchema`）；
- 合并由 `cordis-plugin-include` 的 **`applyEntryPatches()`** 完成：按 `id` 定位 patch，然后做**顶层浅替换**（`target[key] = value`，替换整条 entry 行含整个 `config`），`insert` 可插入新行（要求目标是 group），匹配不到的行告警跳过（`vendor/include/src/index.ts`）。

当前这一层坐标点上的结合运算，几个如实陈述的现状：

- **没有字段级深合并**。DSH 自己的文档写得很清楚：“按 id 定位的 patch 会替换整个 config（未改字段也要重述）”“不做深度合并”“不存在深度合并层”（`packages/boot/app-boot/README.zh.md`、`packages/bundle/base/README.zh.md`）。有意思的是，**字段级合并语义在 settings 侧已经存在**（`scope.update()` 深合并稀疏补丁），缺的只是把它用到组合层 entry config 的 patch 上；
- **没有结构负元素**。想表达“继承它但最终不以原样生效”，除 entry 级 `disabled` 外没有结构层的表达；
- **条件/动态目前有两处受控的求值点**：entry 级的 `disabled`（可带 `!!js` 表达式，每次挂载/重挂决策时按 loader 上下文求值，且沿祖先链生效），以及 config 值里的 `!!js`（条目激活时按插件上下文插值，`docs/cordis-primer.zh.md`）。它们读取的输入与配置空间（settings/环境）的关系是隐式的，没有统一坐标。

也就是说：第二层有坐标系（entry `id`）、有结合运算（浅替换 + 插入），但**粒度以整条 entry 行为单位、条件以整条 entry 为作用对象**。

### 第三层：运行时结构空间（Cordis ctx / fiber）

理论形态：运行时动态创建的 agent/fiber 会在这层之上产生新的 Delta：

```text
Fiber = Generator(ModelDSL)
```

DSH 的真实情况：plugin 就是 Cordis 插件，`ctx`/`Service`/事件/fiber/effect/disposer 都由被 vendor 改名为 `@deepseek-ai/cordis` 的框架提供。`apply(ctx, config)` 中的 `config` 是**经 schemastery `Config` schema 校验后的普通数据对象（不是 DSL）**；插件把它当作“装什么”的输入，直接在 `ctx` 上登记 service/tool/skill/settings namespace/command 等，**每个登记配一个 disposer**——fiber 卸载 / HMR 时逆序执行（`docs/cordis-api/registry.zh.md`、`docs/cordis-api/fiber.zh.md`）。注意层次差异：真正的声明式 DSL 在第二层（entry-list 组合方言），而每条 entry 携带的 `config` 只是被校验的普通数据对象。

这一层是 DSH 最完整的地方：service 名、事件名、tool/skill 键、settings namespace 各自是**坐标点**，每个坐标点上的结合运算按注册表类型定义（有的同层重复即 throw、有的按优先级覆盖、有的跨 scope 层 shadow），并且靠 fiber/effect/disposer 实现了**真正可逆的运行时结构管理**。相比很多把运行时结构写死、只能整体卸载重挂的系统，这是 DSH/Cordis 的突出优势。

### 三层如何衔接（递归性）

- 配置空间的坐标是平面的，但值可以是嵌套结构；
- 静态结构空间把配置变量当作生成/裁剪的输入；
- 运行时结构空间把静态模型当作“待挂载清单”来激活。

DSH 里其实已经能清楚看到这条链：组合层决定“注册什么”（哪条 entry、带什么 config），Cordis 层决定“如何激活/更新/卸载”。由此得到一个**认识论判据**：静态（装载前）就能确定的定制，放进第二层表达最便宜；只有运行期才知道的内容（这个 agent 是谁、它在哪个 scope、用哪份 preset）才必须落到第三层。这条“内容何时可知”的分界线，决定了你的 Delta 该写在哪个结构层。

## 4. 在每一层分别建立领域坐标系：DSH 现状对照表

把上面三层各自“坐标系 + 坐标点运算”的现状汇总成一张表，是本文想重点呈现的东西：

| 层面 | 领域坐标系（对象 → identity） | 坐标粒度 | 坐标点上的结合运算（现状） | 稳定坐标？ | 自定义扩展 | 动态/生成能力（现状） | 可逆管理 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 一、配置空间 | 平面 key → value（settings namespace、env key、`ctx.cmdlineArgs` 参数数组） | 键 | 各区域优先级规则（可读作 ladder）合成；settings 内部 schema 默认 → base → 用户分节分层，`update()` 字段级深合并 | 各区域规则分别有文档记载，无跨来源统一视图 | settings 可注册新 namespace | settings 热重载 + 变更事件；环境快照带 source/path；凭据走独立安全顺序 | 有限（有 ladder/owner 与 revision，settings 解析值不记录每字段来源） |
| 二、静态结构空间 | entry tree → entry `id`（整树唯一，子树按父 id 前缀） | 整条 entry 行 | `applyEntryPatches` 浅替换整行 / `insert` 新行；**无字段级深合并** | entry `id` 相对稳定 | 新增 entry/bundle/patch 层易；改 base 深部字段要整行重述 | `disabled` + `!!js`（entry 级求值点）；preset 副本化 | 有限（无结构负元素、无字段级 delta） |
| 三、运行时结构空间 | Cordis ctx → service/事件/tool/skill/settings namespace 键 | 单个注册条目 | 注册即应用 + disposer 撤销；同层 throw / 优先级覆盖 / 跨 scope shadow | 注册键稳定、随声明 | 插件登记即扩展 | 运行期热装/卸载/HMR；extensions 子系统可运行时定义 Cordis 插件 | 完整（fiber/effect/disposer 可逆生命周期） |

这张表想说明三件事：

1. **DSH 的三层已经各有真实坐标与真实结合运算**，并非从零开始建“可逆计算”；
2. 三层当前的**完整度是不对称的**：第三层的可逆管理最完整，第一、二层的合并语义相对最有限——而这恰恰是先写配置、再决定装哪些插件的客户最先碰到的两层；
3. 表格里的“现状”列，多数来自 DSH 自己的源码与文档，说明这些边界是**已知且被如实记录的取舍**，不是隐藏缺陷。

## 5. settings 与命令行参数的统一：要不要“一个可追踪的配置坐标空间”

前面已经能看到各区域优先级有文档记载，但还缺一个视角：**这个值/这个节点为什么存在？** 当一个配置面要支撑企业级部署时，来源追踪会越来越重要——某个值来自 settings 用户文档、还是 bundle 里的默认 config、还是部署环境的 `.env`？某个 config 字段被哪个 patch 层改写、平台升级后客户的 Delta 是否仍然成立？

DSH 其实已经有相当多基础：

- **`--dump-config` 已经做到条目级 provenance**：`renderConfigDump` 按 patch 层快照差分，给每条 entry 渲染 `# == <origin>, patched by <layer1>, <layer2>` 之类的注释（`packages/boot/app-boot/src/index.ts`、`apps/cli/src/dump-config.ts`，app-boot README 有明文记载）；
- **`config-catalog.md`** 是以部署为轴、逐包粘贴 `Config` 类型的生成文档，运行时 schemastery schema 会与粘贴内容交叉核对；
- **settings seam**（`ctx.settings.installSection`）已把 entry config 当 base、用户文档叠上去并带 revision——这已经是一层“带 owner 的 Delta”。

在此基础上可以讨论的是：把“每个来源的坐标（source + 优先级）”纳入**同一个可追踪配置坐标空间**，让 feature 条件、值插值与 dump 都能统一回答“值从哪来、被谁改写”。这接近 Nop `nop-config` 的 `ConfigProvider` 形态：多个 source 按优先级合成、每个值携带来源位置、值支持动态引用与订阅——它可以是一个**可被多个子系统复用**的“第一阶段”，而不是为每个子系统各自造一套。

注意这**不是**要把 settings 与 CLI 揉成一个扁平命名空间。CLI 参数本质上是“本次运行的显式覆盖”，其生命周期与持久化的 settings 不同；更合理的做法是让它们各自保留 schema、owner 与来源记录，作为同一套来源视图里优先级不同的 source。

## 6. 组合层的动态性：补一个“Generator 档位”，而不是图灵完备生成

先澄清一个容易误读的点：DSH **不是没有动态能力**。它是真实的：

- entry 级 `disabled` 可用 `!!js` 表达式，在每次挂载/重挂决策时按 loader 上下文求值；
- config 值可含 `!!js`，在条目激活时按插件上下文插值；
- profile 的 `cordis.patch.yml` 支持热重载（对 `patchReload: live` 的 profile 安装 `watchUserPatches`），settings 支持热重载与变更事件；
- extensions 子系统（`packages/extensions/cordis-host-runner`，`ctx.dynamicCordisRunner`）允许在运行时定义并运行 Cordis 插件——这已经是代码级、图灵完备意义上的动态。

因此要讨论的问题不是“有没有动态”，而是：**声明式组合面（第二层）的动态能力目前只有 entry 级的 `disabled` 与 config 级 `!!js` 两个受限的动态入口；随着配置复杂化，这两处入口是否够用？**

一个可以讨论的中间档（对应本文开头说的“Spring Boot 档位”）是给组合层补**结构层条件**：

```text
任意组合节点（entry、entry 内某字段、group child……）可以声明一个存在条件，
条件读取配置空间的合成快照（settings/环境，而非运行时 I/O 或 secret 实值）；
条件满足 → 该节点贡献；不满足 → 该节点不贡献。
```

它与 DSH 现有的 `disabled` **不冲突，且可分辩**——差别主要在**输入来源与可解释性**，而不只是“运行期 vs 装载前”的二分：

- `disabled`（含 `!!js`）在**加载/更新期**求值，求值上下文是 loader 上下文，可访问运行中的 ctx 与服务；它决定一条已存在于组合模型里的 entry 是否在当前 runtime 挂载，并可沿祖先链影响子树——语义上更接近“运行时启停”；
- 结构层条件（类似 Nop `feature:on`）决定该节点**是否被结构地合成出来**，只读配置空间快照，因而可以在激活前求值、可以被 dump、可以被审计。

两者拆开之后，还能顺便回答一个现在略显模糊的问题：条件该读哪一层变量？结构层条件应只读配置空间的快照；只有“运行时启停”语义才允许接触运行中的 `ctx`。

另外值得观察的“另一条工程路线”：有些新架构的重构（例如我关注到的某 Agent 平台 P 的设计）把配置空间作为中心，但**去掉了描述式装配**，改为用装配函数向配置空间增删元素。这与 DSH 的描述式 patch 是“Delta 的两种生产方式”：声明式 patch 可审计但表达力受限，装配函数表达力强但可序列化/可审计性弱。两者并不互斥——坐标空间仍居中，只是“谁生产 Delta”不同。这个话题很适合展开讨论。

## 7. 从这套透镜看 DSH 的演进方向

以下方向都是**增量**的，不推翻现有模型、不改变 profile/bundle/patch/plugin 的既有用法，只是把第二层与第一层的语义补完整：

1. **字段级深合并 / 最小 patch**。让按 `id` 定位的 patch 可以对 entry 的 `config` 做字段级合并（未覆盖字段继承 base），而不是整行重写。DSH 文档已承认当前无深合并层；且**字段级合并语义在 settings 侧已经存在**（`SettingsScope.update()`），缺的只是把它落到组合层 entry config 的 patch 上——这是改动最小的第一步。
2. **结构层条件 + 与配置空间联动**。把“节点是否存在”从“entry 级 `disabled` 启停判断”里再分出一层“结构级 feature”，条件输入接到配置空间合成快照上，使第二层真正成为 `ModelDSL = Generator(配置变量)`。粒度可以先到布尔条件表达式（Nop `feature:on` 的程度），不需要图灵完备。
3. **来源追踪从条目级提升到字段级**。现有 `--dump-config` 已能按行标注每条 entry 的来源文件与改写它的 patch 层；可在此基础上让 dump 进一步回答“某个 config 字段来自哪个 patch 层、被哪次合并改写”，使平台升级后客户的 Delta 是否仍然成立可被检查。
4. **负元素的谨慎表达**。若希望平台保留“禁止某项基础能力”的客户诉求，需要显式的结构负元素（如移除某条 base entry 或字段），而不是靠复制后删除；但按“加法优先”的原则，它只应是少数场景的主路径。（注：§2 提到“Delta 理论上可回撤”，现状在结构层尚无负元素，此项即补这个缺口。）
5. **config 外化的推广**。`ctx.settings.installSection` 已经演示了“插件 config 字段 ↔ settings namespace 联动、entry config 作为 settings base、用户设置热生效”的接线模式；把这套模式推广成约定，能减少大量重复的配置接线。

这些方向合起来，就是让第一、二层也获得第三层那样的“稳定坐标 + 明确结合运算 + 可解释来源”，而不只是第三层单独可逆。正如前面那张对照表所示，它们并不要求重写任何一层。

## 8. 结语与想听到的反馈

一句话总结本文的立场：**DSH 已经长在可逆计算的坐标上——profile/bundle/patch 是第二层的 Delta 层，settings 分层是配置层的 Delta 层叠，fiber/effect/disposer 是第三层的可逆管理。** 本文只是把这套结构显式地讲出来，并指出一个判断：DSH 的运行时结构空间已经做得很完整，更值得投入的可能是把静态结构空间的合并粒度（整行 → 字段）与条件能力（entry 级 → 任意节点 + 接配置空间）补上，让客户在配置复杂化时仍然能“只写差异、不改整体”。

想请 DSH 社区反馈的问题：

1. “平台整体 = 核心 + 基础插件 + 基础配置，客户只加 Delta 与增量插件”这个发行物模型，你们内部是否认可为主要形态？它目前的约束在哪？
2. 组合层的合并以“整行浅替换”为单位，据文档这是已知取舍。字段级深合并是否有计划，还是有意保持“整行即契约”的简单性？
3. 把 `disabled`/`!!js` 与“结构层 feature 条件”分开（前者 loader/更新期、读 loader 上下文；后者装载前裁剪、只读配置空间快照），并把条件输入接进配置空间统一快照，是否值得进入 roadmap？
4. settings/环境/CLI 目前是“各区域分别记载优先级 + 分离的实现机制”；走到一个“跨来源统一、可追踪的配置坐标视图（带来源与 owner）”对你们的价值大吗？成本顾虑是什么？
5. 对“声明式 patch vs 装配函数作为 Delta 生产方式”的取舍，你们怎么看？有没有两者兼顾的中间态？

---

*（草稿说明：以上为发布到 deepseek-ai/deepseek-harness Discussion 前的本地草稿；文中 DSH 事实均可按真名在仓库源码/官方文档复核，发布前建议把括号出处补为正文超链接，并按需转英文。）*
