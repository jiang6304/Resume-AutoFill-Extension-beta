# 简历自动填写助手

智能解析简历并自动填写招聘网站表单的浏览器扩展工具。

## 功能特性

### 阶段A：简历解析与编辑 ✅ 100%

- ✅ 支持 DOCX、TXT、XLSX、PDF 格式简历上传
- ✅ AI 智能解析简历结构（支持 16 种多条目类型）
- ✅ 支持手动编辑简历信息（12 个分类表单）
- ✅ 本地缓存简历数据
- ✅ 历史简历版本管理（最多 5 个，支持查看、修改、删除）
- ✅ 文件哈希缓存（相同文件秒解析）
- ✅ 额外字段自动识别（extra_fields + field_mapping）

### 阶段B：表单识别 ✅ 100%

- ✅ 识别 input、select、textarea、radio、checkbox 表单元素
- ✅ 智能提取表单标签
- ✅ 跳过密码框和隐藏元素

### 阶段C：自动填写 ✅ 95%

- ✅ LLM 语义匹配字段
- ✅ 不覆盖已填写内容
- ✅ 支持暂停/继续功能
- ✅ 进度实时更新
- ❌ 级联下拉框（计划中）

### 前端交互特性

- ✅ 浮动弹窗（可拖拽、Shadow DOM 隔离样式）
- ✅ 特殊页面支持（chrome:// 等使用原生 popup）
- ✅ 上传进度条（真实百分比）+ 解析进度条（动画）
- ✅ 版本超限提示弹窗
- ✅ 扩展更新自动通知
- ✅ CSS 变量设计系统
- ✅ 状态指示器（脉冲动画）

---

## 项目结构

```
resume-filler/
├── backend/                  # Python 后端服务
│   ├── server.py            # 主服务入口 (端口 8001)
│   ├── requirements.txt     # Python 依赖
│   ├── .env.example         # 环境变量模板
│   ├── routers/             # API 路由层
│   │   └── resume.py        # 简历相关 API
│   ├── services/            # 业务逻辑层
│   │   ├── parser.py        # 文件解析（DOCX/TXT/XLSX）
│   │   └── llm.py           # LLM 调用服务
│   ├── models/              # 数据模型层
│   │   └── resume.py        # Pydantic 模型定义
│   └── utils/               # 工具层
│       └── cache.py         # 本地缓存管理
│
├── frontend/                 # 浏览器插件前端
│   ├── public/              # 静态资源（构建时复制到 dist）
│   │   ├── manifest.json    # Chrome Extension 配置
│   │   ├── popup/           # 插件弹窗界面（特殊页面使用）
│   │   ├── content/         # 内容脚本（注入网页，含浮动弹窗）
│   │   ├── background/      # 后台 Service Worker
│   │   ├── web/             # 简历管理网页
│   │   └── icons/           # 图标资源
│   ├── src/                 # Vue 源代码
│   ├── dist/                # 构建输出（加载到 Chrome）
│   └── vite.config.js       # Vite 构建配置
│
├── CLAUDE.md                # AI 辅助开发指南
├── .editorconfig            # 编辑器统一配置
└── README.md                # 本文档
```

---

## 快速开始

### 1. 配置 Python 后端

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境 (Windows)
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
copy .env.example .env
# 编辑 .env 文件，填入您的 LLM API 配置

# 启动后端服务
python server.py
```

后端服务将在 `http://127.0.0.1:8001` 启动。

### 2. 配置前端插件

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

### 3. 安装浏览器插件

#### Chrome / Edge
1. 打开浏览器，访问 `chrome://extensions/` (Chrome) 或 `edge://extensions/` (Edge)
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `frontend/dist` 目录

---

## 环境变量配置

在 `backend/.env` 文件中配置以下环境变量：

```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=your_base_url_here
LLM_MODEL=GLM-5
```

例如使用豆包 API：
```env
LLM_API_KEY=your_doubao_api_key
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

---

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/resume/upload` | POST | 上传并解析简历 |
| `/api/resume/load` | GET | 加载当前简历（通过引用） |
| `/api/resume/save` | POST | 保存简历（兼容旧 API） |
| `/api/resume/version` | POST | 创建新版本 |
| `/api/resume/version/{id}` | GET | 加载指定版本简历 |
| `/api/resume/version/{id}` | PUT | 更新指定版本 |
| `/api/resume/version/{id}` | DELETE | 删除指定版本 |
| `/api/resume/versions` | GET | 获取版本历史列表 |
| `/api/resume/set-current/{id}` | POST | 设置当前填写模板 |
| `/api/resume/mapping` | POST | 字段语义映射 |

---

## 数据模型

### 基本信息（28 个字段）

| 字段 | 说明 |
|------|------|
| name | 姓名 |
| gender | 性别 |
| birth_date | 出生日期 |
| id_number | 身份证号 |
| political_status | 政治面貌 |
| marital_status | 婚姻状况 |
| ethnicity | 民族 |
| native_place | 籍贯 |
| phone | 手机号 |
| email | 邮箱 |
| current_address | 现居地址 |
| education | 学历 |
| work_years | 工作年限 |
| job_intention | 求职意向 |
| wechat | 微信号 |
| qq | QQ |
| household_registration | 户籍 |
| student_source | 生源地 |
| height | 身高 |
| weight | 体重 |
| health_status | 健康状况 |
| specialty | 特长 |
| emergency_contact_name | 紧急联系人姓名 |
| emergency_contact_phone | 紧急联系人电话 |
| country | 国家/地区 |
| mailing_address | 通信地址 |

### 多条目数组（16 种类型）

| 字段名 | 说明 |
|--------|------|
| education_history | 教育经历（含学院、GPA、导师等扩展字段） |
| work_history | 工作经历（含证明人、离职原因等扩展字段） |
| internship_history | 实习经历 |
| project_history | 项目经历 |
| school_activities | 在校经历（社团、学生会等） |
| awards_history | 获奖情况 |
| language_skills | 外语能力 |
| computer_skills | 计算机技能 |
| certificates_history | 资格证书 |
| family_info | 家庭情况 |
| papers | 论文期刊 |
| patents | 专利 |
| competitions | 竞赛 |
| portfolio | 作品集 |

### 扩展字段

- `extra_fields` - AI 自动识别的额外字段
- `field_mapping` - 字段中英文映射表

---

## 前端目录说明

### popup/ - 浏览器插件弹窗界面（特殊页面使用）

- 上传简历按钮（带版本数量检查）
- 编辑信息按钮（跳转到简历管理页面）
- 选择历史版本按钮（弹窗显示版本列表）
- 开始/暂停/继续填写控制
- 上传进度条 + 解析进度条
- 日志显示区域
- 后端服务状态检查

### content/ - 注入到网页的内容脚本

- **浮动弹窗**：可拖拽、Shadow DOM 隔离样式
- 表单元素识别（input/select/textarea/radio/checkbox）
- LLM 字段语义映射
- 自动填写逻辑（不覆盖已有内容）
- 暂停/继续机制
- 进度更新通知

### background/ - 浏览器扩展后台脚本

- 动态 popup 设置（特殊页面用原生 popup）
- 扩展图标点击处理
- Content script 自动注入
- 扩展更新通知

### web/ - 简历管理网页界面

- 12 个分类编辑表单
- 支持 URL 参数 `?version=版本ID` 加载指定历史版本
- 支持 URL 参数 `?view=history` 直接显示历史页面
- 保存简历和保存为新版本功能
- "按照此简历填写"按钮
- 当前版本标记（绿色边框 + "当前"）
- "至今"日期处理

---

## 数据存储

### 存储结构

```
~/.resume-filler/cache/
├── current_resume.json     ← 引用文件（只存 version_id）
├── versions/               ← 版本历史目录
│   ├── a1b2c3d4.json       ← 版本 A（完整简历数据）
│   ├── e5f6g7h8.json       ← 版本 B
│   └── ...                 ← 最多 5 个
└── file_cache/             ← 文件哈希缓存
    └── abc123def456.json   ← 解析结果缓存
```

### 数据同步原则

**后端是权威数据源，本地缓存是副本**

```
数据流向：
后端 API (权威) ──同步──> chrome.storage.local (副本)
     ↑                        ↓
     └── 回退（后端不可用时）──┘
```

---

## 重要约定

| 项目 | 值 |
|------|------|
| 后端端口 | 8001 |
| API 基础地址 | http://127.0.0.1:8001 |
| 数据存储目录 | ~/.resume-filler/cache/ |
| 当前简历引用 | ~/.resume-filler/cache/current_resume.json |
| 版本历史目录 | ~/.resume-filler/cache/versions/ |
| 最大版本数 | 5 |
| Chrome 扩展版本 | Manifest V3 |

---

## 注意事项

1. **数据安全**：所有简历数据仅保存在本地，不会上传到任何服务器
2. **API Key 安全**：请勿将 API Key 硬编码到代码中，始终使用环境变量
3. **隐私保护**：插件仅在用户主动操作时才读取和填写网页表单
4. **特殊页面限制**：chrome:// 等特殊页面无法填写表单（浏览器安全限制）

---

## 技术栈

- **后端**: Python 3.10+, FastAPI, uvicorn, python-docx, openpyxl, httpx
- **前端**: Vue 3, Vite, Chrome Extension Manifest V3
- **AI**: 支持 OpenAI SDK 兼容的 LLM API（豆包、GLM 等）

## License

MIT
