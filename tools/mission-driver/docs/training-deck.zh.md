# Mission-Driver

培训讲义

> 配套手册：`docs/user-manual.zh.md`

---

# 是什么

AI 开发循环引擎

- 给它 mission 配置 + 需求文档
- 全自动跑 AI agent 子进程
- 直到任务完成

---

# 何时用

✅ **用**

- 任务 > 1 小时
- 有验收标准
- 多步骤需同步

❌ **不用**

- 几分钟小改
- 重命名文件
- "看着改"

---

# 核心循环

```
CHECK (健康检查)
  ↓
REVIEW_PLANS (评审)
  ↓
EXEC_PLANS (执行)
  ↓
DRAFT_PLANS (起草)
  ↓ nothing
DEEP_AUDIT (审计)
  ↓ complete
(回 REVIEW_PLANS)
```

---

# 5 个阶段

```
A 需求文档 → B 生成配置 → C 执行
                              ↓
              E 复盘 ← D 监控
```

---

# A 需求文档

3 选 1：

- **FSD** — 新功能（`docs/design/`）
- **Bug 列表** — 修复（`docs/bugs/`）
- **优化清单** — tech debt

越具体，跑得越准。

---

# B 生成配置

```bash
./tools/mission-driver.sh draft "<目标>" \
  --target-file <需求文档>
```

两阶段：
1. **brief** — 问清范围
2. **draft** — 生成配置

---

# B 关键字段

| 字段 | 必填 |
|------|------|
| `name` | ✅ |
| `roadmapPath` | ✅ |
| `commands.test` | ✅ |
| `moduleDir` | 推荐 |

校验：
```bash
node tools/mission-driver/src/mission-check.mjs ...
```

---

# C 启动

```bash
./tools/mission-driver.sh run <name>
```

启动后：
- 自动开 Monitor（:9300）
- 从 CHECK 起步
- 日志在 `_tmp/<时间戳>/`

---

# C 常用 flag

| Flag | 作用 |
|------|------|
| `--step <S>` | 单步调试 |
| `--from-step <S>` | 续跑 |
| `--dry-run` | mock 模式 |
| `--no-monitor` | CI 用 |

---

# 单步 vs 续跑

| | `--step` | `--from-step` |
|---|---|---|
| 用途 | 调试 | 续跑 |
| 跑完 | 停 | 继续循环 |
| 互斥 | 是 | 是 |

---

# D Monitor

浏览器开 `localhost:9300`

- Timeline：每个 step 耗时
- Log viewer：agent 输出
- 资源曲线 / 审计进度

---

# 状态流转

```
CHECK → REVIEW → EXEC → DRAFT
                    ↑      │
                    │      ↓ nothing
                    └── AUDIT
                         ↑ complete
                         (回 REVIEW)
```

---

# Plan 生命周期

```
draft → active → completed
```

- `draft` — 刚起草
- `active` — 评审通过
- `completed` — 执行完成

---

# 常见配方

```bash
# Bug 修复
./tools/mission-driver.sh draft "修 bug #N" \
  --target-file docs/bugs/N.md

# 续跑
./tools/mission-driver.sh run <name> \
  --from-step EXEC_PLANS
```

---

# 常见坑

- ❌ 嵌套启动 mission
- ❌ 运行时手改 plan
- ❌ 跳过 mission-check
- ❌ placeholder 命令没换

---

# 关键约束

- 改 roadmap **先停 mission**
- baseline 必须先绿
- 新终端启动，勿嵌套
- `--step` 与 `--from-step` 互斥

---

# Takeaways

1. **>1h + 验收标准 → 用**
2. **5 步循环**：CHECK→REVIEW→EXEC→DRAFT→AUDIT
3. **Plan 三态**：draft→active→completed
4. **--step 调试 / --from-step 续跑**

---

# 谢谢

> 手册：`docs/user-manual.zh.md`
> Skill：`.opencode/skills/mission-driver/`

问答时间
