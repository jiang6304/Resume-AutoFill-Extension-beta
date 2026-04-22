# 简历自动填写助手

> 智能解析简历并自动填写招聘网站表单的浏览器扩展工具

## 项目简介

本工具帮助求职者自动解析简历文件，并通过 AI 智能匹配，将简历信息自动填写到各大招聘网站的表单中，大幅提升投递效率。

### 核心特性

- **多格式支持**：支持 DOCX、TXT、XLSX、PDF 格式简历上传
- **AI 智能解析**：自动识别简历结构，提取 28 种基本信息 + 16 种多条目类型
- **智能字段映射**：LLM 语义匹配，准确填写各类表单字段
- **多框架兼容**：支持 Ant Design、Element UI、Vant、iView 等前端框架
- **本地数据存储**：所有简历数据保存在本地，不上传云服务器

---

## 隐私与安全

⚠️ **重要说明**：为了保护您的个人隐私，本工具采用本地化存储方案：

- ✅ 所有简历数据仅保存在您的本地电脑（`~/.resume-filler/cache/`）
- ✅ 简历信息不会上传到任何云服务器
- ✅ LLM API 调用仅用于字段语义映射，不存储简历内容
- ✅ 您可以随时删除本地缓存数据

---

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 16+
- Chrome / Edge 浏览器

### 1. 配置后端

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

# 启动服务
python server.py
```

### 2. 构建插件

```bash
cd frontend
npm install
npm run build
```

### 3. 安装插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `frontend/dist` 目录

---

## 环境变量配置

在 `backend/.env` 文件中配置：

```env
# 必需 - 文本模型（用于简历解析和字段映射）
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://your-api-url.com/v1
LLM_MODEL=GLM-5

# 可选 - 视觉模型（用于图片识别）
VISION_API_KEY=your_vision_api_key
VISION_BASE_URL=https://your-vision-url.com/v1
VISION_MODEL=Kimi-K2.5
```

### 示例配置

| 平台 | BASE_URL | MODEL |
|------|----------|-------|
| 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-pro-32k` |
| GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |

---

## 项目结构

```
resume-filler/
├── backend/                 # Python 后端服务
│   ├── server.py           # 主入口 (端口 8001)
│   ├── requirements.txt    # Python 依赖
│   ├── .env.example        # 环境变量模板
│   ├── routers/            # API 路由
│   ├── services/           # 业务逻辑
│   │   ├── parser.py       # 文件解析
│   │   ├── llm.py          # LLM 服务
│   │   └── vision_service.py
│   ├── models/             # 数据模型
│   └── utils/              # 工具函数
│
├── frontend/               # 浏览器插件
│   ├── public/
│   │   ├── manifest.json   # 扩展配置
│   │   ├── popup/          # 弹窗界面
│   │   ├── content/        # 内容脚本
│   │   ├── background/     # 后台脚本
│   │   └── web/            # 管理页面
│   └── vite.config.js
│
└── README.md
```

---

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/resume/upload` | POST | 上传并解析简历 |
| `/api/resume/load` | GET | 加载当前简历 |
| `/api/resume/versions` | GET | 获取版本列表 |
| `/api/resume/version` | POST | 创建新版本 |
| `/api/resume/mapping` | POST | 字段语义映射 |

---

## 支持的字段

### 基本信息（28 个）

姓名、性别、出生日期、身份证号、政治面貌、婚姻状况、民族、籍贯、手机号、邮箱、现居地址、学历、工作年限、求职意向、微信号、QQ、户籍、生源地、身高、体重、健康状况、特长、紧急联系人、紧急联系电话、国家/地区、通信地址

### 多条目类型（16 种）

教育经历、工作经历、实习经历、项目经历、在校经历、获奖情况、外语能力、计算机技能、资格证书、家庭情况、论文期刊、专利、竞赛、作品集

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.10+, FastAPI, uvicorn |
| 前端 | Vue 3, Vite, Chrome Extension Manifest V3 |
| AI | OpenAI SDK 兼容的 LLM API |
| 文件解析 | python-docx, openpyxl, pypdf |

---

## 许可证

MIT License

---

## 注意事项

1. 本工具仅供个人求职使用
2. 请勿将 API Key 上传到公开仓库
3. `chrome://` 等特殊页面无法使用（浏览器安全限制）
4. 建议定期清理本地缓存数据
