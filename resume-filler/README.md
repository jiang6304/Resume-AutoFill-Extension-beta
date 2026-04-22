# 简历自动填写助手

智能解析简历并自动填写招聘网站表单的浏览器扩展工具。

## 功能特性

### 简历解析 ✅
- 支持 DOCX、TXT、XLSX、PDF 格式简历上传
- AI 智能解析简历结构（支持 16 种多条目类型）
- 支持手动编辑简历信息（12 个分类表单）
- 本地缓存简历数据，历史版本管理（最多 5 个）

### 表单识别与填写 ✅
- 识别 input、select、textarea、radio、checkbox 表单元素
- 支持 Ant Design、Element UI、Vant、iView 等前端框架
- LLM 语义匹配字段
- 不覆盖已填写内容
- 支持暂停/继续功能

### 前端交互 ✅
- 浮动弹窗（可拖拽、Shadow DOM 隔离样式）
- 特殊页面支持（chrome:// 等使用原生 popup）
- 实时进度显示
- 扩展更新自动通知

---

## 快速开始

### 1. 配置 Python 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
copy .env.example .env
# 编辑 .env 文件，填入您的 LLM API 配置

# 启动后端服务
python server.py
```

### 2. 构建前端插件

```bash
cd frontend
npm install
npm run build
```

### 3. 安装浏览器插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `frontend/dist` 目录

---

## 环境变量配置

在 `backend/.env` 文件中配置以下环境变量：

```env
# 文本模型配置（必需）
LLM_API_KEY=your_llm_api_key_here
LLM_BASE_URL=https://your-llm-api-url.com/v1
LLM_MODEL=GLM-5

# 视觉模型配置（可选）
VISION_API_KEY=your_vision_api_key_here
VISION_BASE_URL=https://your-vision-api-url.com/v1
VISION_MODEL=Kimi-K2.5
```

### 示例配置

**豆包 API：**
```env
LLM_API_KEY=your_doubao_api_key
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_MODEL=doubao-pro-32k
```

**GLM API：**
```env
LLM_API_KEY=your_glm_api_key
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4
```

---

## 项目结构

```
resume-filler/
├── backend/                 # Python 后端服务
│   ├── server.py           # 主服务入口 (端口 8001)
│   ├── requirements.txt    # Python 依赖
│   ├── .env.example        # 环境变量模板
│   ├── routers/            # API 路由层
│   ├── services/           # 业务逻辑层
│   │   ├── parser.py       # 文件解析
│   │   ├── llm.py          # LLM 调用服务
│   │   ├── multi_model_service.py  # 多模型服务
│   │   └── vision_service.py       # 视觉模型服务
│   ├── models/             # 数据模型层
│   └── utils/              # 工具层
│
├── frontend/               # 浏览器插件前端
│   ├── public/             # 静态资源
│   │   ├── manifest.json   # Chrome Extension 配置
│   │   ├── popup/          # 插件弹窗界面
│   │   ├── content/        # 内容脚本（注入网页）
│   │   ├── background/     # 后台 Service Worker
│   │   ├── web/            # 简历管理网页
│   │   └── icons/          # 图标资源
│   ├── dist/               # 构建输出（加载到 Chrome）
│   └── vite.config.js      # Vite 构建配置
│
├── README.md               # 本文档
└── CLAUDE.md               # AI 辅助开发指南
```

---

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/resume/upload` | POST | 上传并解析简历 |
| `/api/resume/load` | GET | 加载当前简历 |
| `/api/resume/version` | POST | 创建新版本 |
| `/api/resume/version/{id}` | GET/PUT/DELETE | 版本管理 |
| `/api/resume/versions` | GET | 获取版本历史列表 |
| `/api/resume/mapping` | POST | 字段语义映射 |

---

## 数据模型

### 基本信息（28 个字段）

name, gender, birth_date, id_number, political_status, marital_status, ethnicity, native_place, phone, email, current_address, education, work_years, job_intention, wechat, qq, household_registration, student_source, height, weight, health_status, specialty, emergency_contact_name, emergency_contact_phone, country, mailing_address

### 多条目数组（16 种类型）

education_history, work_history, internship_history, project_history, school_activities, awards_history, language_skills, computer_skills, certificates_history, family_info, papers, patents, competitions, portfolio

---

## 注意事项

1. **数据安全**：所有简历数据仅保存在本地，不会上传到任何服务器
2. **API Key 安全**：请勿将 API Key 硬编码到代码中，始终使用环境变量
3. **特殊页面限制**：chrome:// 等特殊页面无法填写表单（浏览器安全限制）

---

## 技术栈

- **后端**: Python 3.10+, FastAPI, uvicorn, python-docx, openpyxl, httpx
- **前端**: Vue 3, Vite, Chrome Extension Manifest V3
- **AI**: 支持 OpenAI SDK 兼容的 LLM API（豆包、GLM、Kimi 等）

## License

MIT
