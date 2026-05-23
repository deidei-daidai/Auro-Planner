# 🧭 AuroMap Planner (旅行规划足迹地图系统) - 安装与配置指南

> [!IMPORTANT]
> ### 🔑 本地备忘：您的真实 API 密钥 (仅保存在本地，切勿 commit/push 到 GitHub！)
> 为了方便您在下一台电脑快速复制配置，以下是您当前使用的真实 API Key。复制后放入 `.env.local` 即可：
> - **DeepSeek API Key**: `sk-fab038edf47e4c288a7acd34d86c6a49`
> - **Google Maps API Key**: `AIzaSyDlK1jZIW_ghgw2Db-Htmu53kH0Js20oOc`

AuroMap Planner 是一款高阶旅行规划与足迹可视化系统。系统由两个核心部分组成：
1. **Chrome 浏览器插件 (插件/)**：用于从旅行网站、AI 聊天对话框中一键刮取结构化或段落式的旅行路线规划。
2. **网页端后台应用 (网页端/)**：基于 Next.js App Router、Tailwind CSS/Vanilla CSS 与 SQLite (Prisma) 打造的豪华中枢系统。支持旅行轨迹的 Macro（宏观路线）、Daily（每日行程）、Micro（3D 景内微观步行）三维深度渲染，并自动匹配双语地名定位与三种出行交通模式。

为了方便您在下一台电脑上快速导入并运行本项目，请参考以下详尽的安装与 API 配置指南。

---

## ⚙️ 前置运行环境要求

在运行项目前，请确保您的电脑已安装以下基础环境：
- **Node.js**：建议安装 `v18.x` 或以上 LTS 版本（自带 `npm` 包管理工具）。
- **Git**：用于版本管理（当前项目已关联至 GitHub 仓库）。
- **Google Chrome 浏览器**：用于安装并运行数据刮取插件。

---

## 📂 项目目录结构说明

```text
设计助手/
├── 插件/                    # Chrome 扩展程序目录
│   ├── manifest.json       # 扩展清单 (MV3)
│   ├── background.js       # 后台通信脚本
│   ├── content.js          # 网页数据刮取核心逻辑
│   └── content.css         # 浮动刮取按钮样式
├── 网页端/                  # Next.js 极简暖麻风格 Web 应用
│   ├── app/                # Next.js 页面与 API Routes 接口
│   ├── prisma/             # Prisma 数据库 Schema 定义
│   ├── store/              # Zustand 状态管理
│   ├── lib/                # SQLite/Prisma 实例与 Google Maps API 封装
│   ├── package.json        # 依赖项清单与运行脚本
│   └── .env.local.example  # 环境变量（API 密钥）模版文件
├── db/                     # SQLite 数据库存储目录（自动创建并由 Git 忽略）
└── README.md               # 本安装与配置指南文档
```

---

## 🚀 网页端安装与启动步骤

### 1. 克隆与解压项目
在新电脑上拉取或下载本项目后，进入 `网页端` 目录：
```bash
cd 网页端
```

### 2. 配置文件与 API 密钥
将 `网页端` 目录下的 `.env.local.example` 复制一份并重命名为 `.env.local`：
```bash
cp .env.local.example .env.local
```
用编辑器打开 `.env.local`，填入您的真实密钥（具体申请流程见后文）：
```env
DEEPSEEK_API_KEY=您的真实DeepSeek_ApiKey
GOOGLE_MAPS_API_KEY=您的真实GoogleMaps_ApiKey
```
> [!IMPORTANT]
> **安全警示**：`.env.local` 文件已包含在 `.gitignore` 中，Git **永远不会**将其推送到 GitHub 远程仓库，这确保了您的 API 密钥安全。请妥善保管本地密钥，切勿将其泄露到公开代码库！

### 3. 创建数据库存储目录
系统使用轻量级 SQLite 数据库。请在**项目根目录**（与 `网页端`、`插件` 文件夹同级的位置）下创建一个名为 `db` 的文件夹，用于存放数据库文件：
```bash
# 返回根目录
cd ..
# 创建 db 目录
mkdir db
# 重新进入网页端
cd 网页端
```

### 4. 安装 Node.js 依赖包
在 `网页端` 目录下运行以下命令安装项目所需的全部依赖。安装完成后，系统会自动运行 Prisma client 生成器（`prisma generate`）：
```bash
npm install
```

### 5. 初始化数据库表结构
使用 Prisma 的 `db push` 功能，自动在 `db/` 目录下创建 `auro_planner.db` SQLite 数据库，并同步生成所有的旅行计划表结构：
```bash
npx prisma db push
```
*(如果数据库初始化成功，您会看到 `Your database is now in sync with your Prisma schema` 的提示。)*

### 6. 启动 Next.js 本地开发服务器
运行以下命令启动本地网页端：
```bash
npm run dev
```
打开浏览器访问：**`http://localhost:3000`**。

---

## 🔌 Chrome 浏览器插件安装步骤

通过以下步骤，将本项目的采集插件安装到您的 Chrome 浏览器中：

1. 打开 **Google Chrome** 浏览器。
2. 在地址栏输入并回车访问：**`chrome://extensions/`**（或点击浏览器右上角 “三个点 -> 扩展程序 -> 管理扩展程序”）。
3. 在扩展程序页面右上角，开启 **“开发者模式” (Developer mode)** 开关。
4. 点击页面左上角出现的 **“加载已解压的扩展程序” (Load unpacked)** 按钮。
5. 在弹出的文件夹选择框中，选中本项目根目录下的 **`插件`** 文件夹，点击“选择”。
6. **安装完成**！您可以在浏览器工具栏中将 “AuroMap Pipe” 插件图标置顶。

> [!TIP]
> **使用方法**：
> 当网页端 `localhost:3000` 启动后，在任何含有旅行计划的网页（如 DeepSeek 对话框、携程、马蜂窝等）上**选中旅行文本**，文本右上角会自动弹出 `🧭 提取到 AuroMap` 的悬浮按钮。点击即可通过后台 Pipe 自动传输并解析到您的网页端中！

---

## 🔑 核心 API 密钥申请与启用指南

### 1. DeepSeek API Key (AI 计划智能解析)
- **用途**：将任意杂乱无章的自然语言行程单、对话气泡，深度解析为严格的时空 JSON 数据结构。
- **获取方法**：
  1. 注册并登录 [DeepSeek 开放平台](https://platform.deepseek.com/)。
  2. 点击左侧菜单的 **"API Keys"** -> **"Create new API key"**。
  3. 复制生成的 `sk-...` 密钥，粘贴到 `.env.local` 中的 `DEEPSEEK_API_KEY` 变量。

### 2. Google Maps API Key (地图渲染与路径规划)
- **用途**：网页端底图渲染、双语地名搜索编码（Geocoding）、景点间的驾车/步行实际路线规划（Directions）。
- **获取与启用步骤**：
  1. 访问 [Google Cloud Console (谷歌云控制台)](https://console.cloud.google.com/)。
  2. 创建或选择一个项目。
  3. 在左侧菜单中进入 **"APIs & Services" (API 和服务) -> "Library" (库)**。
  4. **【至关重要】** 在库中搜索并**必须启用**以下三个 API 模块（漏掉任何一个都会导致地图功能报错）：
     *   ✅ **Maps JavaScript API**（用于渲染前端高阶地图）
     *   ✅ **Geocoding API**（用于双语搜索并解析景点经纬度）
     *   ✅ **Directions API**（用于计算景点间实际道路路线与耗时）
  5. 启用完毕后，进入 **"APIs & Services" -> "Credentials" (凭据)** 页面。
  6. 点击顶部 **"Create Credentials" -> "API Key"** 创建密钥。
  7. 复制生成的密钥（通常为 `AIzaSy...`），粘贴到 `.env.local` 中的 `GOOGLE_MAPS_API_KEY` 变量。
  8. *(推荐)* 为了资金安全，请在 "API Key" 编辑页面中进行**限制使用**，仅允许该 Key 调用上述 3 个 API。

---

## 🤝 故障排查 (Troubleshooting)

1. **地图上没有路线渲染，控制台报错 API 限制？**
   - 检查您的 Google Cloud 账号是否绑定了有效的结算账户（Billing Account）。Google Maps 服务需要激活 Billing 才能正常使用，每个账号每月有大量的免费额度，个人使用几乎不需要实际付费。
   - 确保 `Geocoding API` 和 `Directions API` **都已点击了 Enable 启用**。
2. **Next.js 启动时提示找不到数据库？**
   - 请确保在运行 `npx prisma db push` 前，项目根目录下已经创建了 `db` 文件夹。Prisma 无法自动创建不存在的父级目录。
3. **插件无法传递数据到网页端？**
   - 确保网页端已在 `localhost:3000` 正常运行。插件会通过本地 `chrome.runtime` 和 Tab 消息中转，网页端必须保持打开状态。
