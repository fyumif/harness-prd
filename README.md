# Harness PRD

> 基于 AI 对话的 PRD 生成器：填写产品意图表单、与 AI 澄清需求，一键产出 **PRD、OpenAPI 接口文档、AI 提示词套件**三份文档并下载。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## 📸 项目演示

> 截图占位，建议放置以下三张图片：

| 步骤 | 说明 |
| --- | --- |
| ① 填写表单 | 根据后端配置动态渲染的产品意图表单 |
| ② AI 对话 | SSE 流式输出的需求澄清对话 |
| ③ 文档生成与下载 | 三份文档的在线预览、局部改写与下载 |

```text
docs/screenshot-form.png
docs/screenshot-chat.png
docs/screenshot-docs.png
```

## ✨ 核心功能

完整工作流：**填表 → 对话 → 生成三份文档 → 下载**

1. **产品意图表单**：表单字段由后端 `questions_config.json` 配置驱动，前端动态渲染，支持「一句话直填」快速创建项目。
2. **AI 需求澄清**：基于表单上下文进行多轮对话，回复通过 SSE 逐字流式输出。
3. **三份文档一键生成**（均为流式生成、Markdown 实时预览）：
   - 📄 **PRD**：综合表单与澄清对话生成产品需求文档；
   - 🔌 **OpenAPI 3.0 接口文档**：以 PRD 为输入自动产出；
   - 🪄 **AI 提示词套件**：以 PRD 为输入产出可直接使用的提示词集合。
4. **文档局部改写**：选中文档、给出修改指令，流式返回改写结果，可选择是否替换原文。
5. **下载导出**：三份文档均可一键下载为本地文件。
6. **会话恢复**：表单草稿与完整会话快照保存在浏览器 localStorage，刷新/误关页面不丢失。

## 🧱 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python、FastAPI、Pydantic Settings |
| LLM 编排 | LangChain（langchain-core / langchain-openai），兼容 OpenAI 协议，默认接入火山方舟豆包模型 |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS |
| 流式通信 | SSE（Server-Sent Events） |
| 数据存储 | 后端内存存储（MVP 阶段，后续迁移 SQLite）、浏览器 localStorage |

## 🚀 快速开始

### 1. 启动后端

```bash
cd backend

# 创建并激活虚拟环境
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env       # Windows: copy .env.example .env
# 编辑 .env，填入 ARK_API_KEY

# 启动服务（默认 http://localhost:8000）
python main.py
# 或开发热更新：
uvicorn main:app --reload
```

接口文档（启动后访问）：`http://localhost:8000/docs`，统一前缀 `/api/v1`。

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 `http://localhost:5173` 即可使用。

### 3. 环境变量说明

在 `backend/.env` 中配置（参见 `.env.example`）：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `ARK_API_KEY` | 火山方舟 API Key，**必填**，未配置时对话/生成接口返回 503 | 空 |
| `ARK_BASE_URL` | OpenAI 兼容接口地址 | `https://ark.cn-beijing.volces.com/api/v3` |
| `DEFAULT_LLM_MODEL` | 默认模型 | `doubao-seed-2.1-turbo` |
| `CORS_ORIGINS` | 允许的跨域来源，多个用英文逗号分隔 | `http://localhost:5173` |
| `HOST` / `PORT` | 服务监听地址与端口 | `0.0.0.0` / `8000` |

## 📁 项目结构

```text
harness-prd/
├── backend/                  # FastAPI 后端
│   ├── api/
│   │   ├── routes/           # 路由层
│   │   │   ├── projects.py       # 项目创建 / 表单更新
│   │   │   ├── conversation.py   # 表单配置 + SSE 流式对话
│   │   │   ├── documents.py      # 三份文档的流式生成与局部改写
│   │   │   ├── config.py         # 模型配置读取
│   │   │   └── system.py         # 系统状态
│   │   └── schemas.py        # Pydantic 请求 / 响应模型
│   ├── core/
│   │   ├── config.py             # 环境变量配置（单例）
│   │   └── questions_config.json # 产品意图表单字段配置
│   ├── services/
│   │   ├── chat.py               # 对话消息构建与 LLM 流式调用
│   │   ├── document_service.py   # 文档生成与改写的核心逻辑
│   │   ├── llm_factory.py        # LLM 实例工厂（OpenAI 兼容协议）
│   │   ├── prompts.py            # PRD / 接口文档 / 提示词套件的模板
│   │   └── store.py              # 项目 / 对话 / 文档的内存存储（后续迁移 SQLite）
│   ├── main.py               # 应用入口
│   ├── .env.example
│   └── requirements.txt
├── frontend/                 # React + Vite 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── FormStep.tsx          # 步骤一：产品意图表单
│   │   │   ├── ConversationStep.tsx  # 步骤二：AI 澄清对话
│   │   │   └── DocumentReview.tsx    # 步骤三：文档预览 / 改写 / 下载
│   │   ├── services/
│   │   │   └── api.ts                # HTTP 与 SSE 接口封装
│   │   ├── types/
│   │   │   └── index.ts              # 类型定义与步骤枚举
│   │   ├── utils/
│   │   │   └── download.ts           # 文件下载
│   │   ├── App.tsx                   # 三步流程与会话状态编排
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── 功能清单.md                # 功能范围与里程碑规划
└── LICENSE                    # MIT 许可证
```

## 🧠 核心设计

### 1. SSE 流式输出

对话与全部文档生成接口统一采用 `text/event-stream`，协议保持一致：

```text
data: {"content": "逐字增量内容..."}

data: [DONE]

event: error
data: {"detail": "模型调用失败：..."}
```

- 使用 LangChain 的 `astream` 逐块产出，前端边接收边渲染 Markdown；
- **建流前完成前置校验**——`StreamingResponse` 一旦返回 200 就无法修改状态码，因此 API Key 缺失 / 项目不存在 / PRD 未生成分别映射为 `503 / 404 / 409`；
- 响应头携带 `X-Accel-Buffering: no`，禁用反向代理缓冲，保证逐字到达；
- 模型超时、限流等运行时错误通过 `event: error` 下发，不会无提示断流。

### 2. 会话持久化

- **前端**：表单草稿（`harness_prd_form_draft`）与完整会话快照（`harness_prd_session`，含三步视图状态、消息、三份文档内容）存入 localStorage，刷新页面可恢复；
- **后端**：所有路由与服务只通过 `services/store.py` 读写数据，存储访问已收口，当前为进程内内存实现，后续替换为 SQLite 时仅需修改该模块，不影响上层逻辑。

### 3. 文档生成依赖链

三份文档存在明确的依赖关系，前置条件不满足时直接拒绝生成：

```text
产品意图表单 + 需求澄清对话
              │
              ▼
            PRD
              │
       ┌──────┴──────┐
       ▼             ▼
 OpenAPI 接口文档  AI 提示词套件

   任意文档 ──► 局部改写（optimize-stream，不落库，由前端决定是否替换）
```

- PRD 由「表单 + 对话记录」拼成需求规格后生成；
- 接口文档与提示词套件均**只以 PRD 为输入**，未生成 PRD 时返回 `409 Conflict`；
- 文档流式生成完成后自动落库；局部改写不自动落库，避免误覆盖。

## 📄 License

[MIT](./LICENSE)
