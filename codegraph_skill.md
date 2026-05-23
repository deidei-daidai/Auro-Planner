# 🧭 CodeGraph AI Agent Skill - 智能语义代码图谱检索与修改指南

> [!IMPORTANT]
> ### 🎯 Skill 核心使命
> 本 Skill 旨在规范 AI 编码助手（如 Antigravity）在 **检索文件** 与 **修改代码** 时的行为。
> 通过深度集成本地优先的 [CodeGraph](https://github.com/colbymchenry/codegraph) 知识图谱，摒弃传统的全量文本搜索（如 raw grep），在处理任务时获得精准的上下文及依赖图谱，从而提升探索效率、极速降低 Token 消耗并确保修改的安全可靠！

---

## 🛠️ CodeGraph 命令与工作流规范

在每次**检索文件**、**修改代码**以及**验证变更**时，AI 助手必须严格按照以下三大阶段执行：

### 1. 🔍 探索与检索阶段 (Retrieval Phase)
*禁止直接盲目搜索全局文本！* 在寻找相关函数、变量、组件或路由时，应首选 CodeGraph 提供的语义搜索能力：
- **符号精准检索**：
  若已知某个符号（如 `prisma`、`useTravelStore`、`api/plans`），在对应的子项目文件夹下运行：
  ```bash
  npx @colbymchenry/codegraph query <symbol_name>
  ```
- **任务上下文构建**：
  当面对复杂需求（如“修改保存旅行计划接口”）时，可让 CodeGraph 自动搜寻并拼装相关联的代码节点：
  ```bash
  npx @colbymchenry/codegraph context "<task_description>"
  ```
- **查看结构大纲**：
  列出索引包含的文件结构：
  ```bash
  npx @colbymchenry/codegraph files
  ```

---

### 2. 📝 代码修改阶段 (Modification Phase)
在修改代码之前，必须评估修改的物理影响范围，防止发生连锁破坏：
- **评估受影响文件**：
  使用 `affected` 命令查找修改当前文件后，有哪些其他文件或测试会受到波及：
  ```bash
  npx @colbymchenry/codegraph affected <file_path>
  ```
- **同步图谱索引**：
  每次完成一阶段的代码修改后，**必须**运行以下命令来将最新的代码关系同步入库：
  ```bash
  npx @colbymchenry/codegraph sync
  ```

---

### 3. 🛡️ 状态与监控阶段 (Monitoring Phase)
- **检查图谱健康度**：
  若发现搜索结果不匹配，应及时检查索引状态或文件覆盖率：
  ```bash
  npx @colbymchenry/codegraph status
  ```
- **解锁数据库**：
  若因进程意外中断导致数据库锁定，可执行：
  ```bash
  npx @colbymchenry/codegraph unlock
  ```

---

## 📌 当前项目已初始化节点

截至目前，本项目已在以下两个核心目录成功初始化并建立了索引：
- **`网页端/`**：包含 Next.js 后台应用，已成功索引 **15 个关键文件**（包含 63 个节点，79 条依赖边，涵盖 Prisma 初始化、Zustand 状态管理等核心逻辑）。
- **`插件/`**：包含 Chrome 刮取扩展，已成功索引关键脚本（后台通信与刮取逻辑）。

---

> [!TIP]
> ### 💡 AI 助手日常自省规则
> 1. **检索时先 Query**：每当用户要求“查找某个逻辑”、“看看某个文件”时，第一步先运行 `codegraph query` 定位。
> 2. **修改前测 Impact**：修改关键 of API 或 Store 状态前，利用 `codegraph affected` 评估。
> 3. **完成修改必 Sync**：修改提交或验证前，运行 `codegraph sync` 以保持图谱时刻最新。
