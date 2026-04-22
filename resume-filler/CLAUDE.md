# Claude Code 开发指南

> 本文件帮助 Claude 和其他 AI 助手快速理解项目结构、编码规范和开发流程。

## 项目概述

**简历自动填写助手** - 智能解析简历并自动填写招聘网站表单的浏览器扩展工具。

用户上传简历文件（DOCX/TXT/XLSX/PDF），通过 LLM 智能解析简历结构，然后在招聘网站上一键自动填写表单。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Python 3.10+, FastAPI, uvicorn |
| 前端框架 | Vue 3, Vite |
| 浏览器扩展 | Chrome Extension Manifest V3 |
| AI 服务 | OpenAI SDK 兼容的 LLM API（豆包、GLM 等） |
| 文件解析 | python-docx (DOCX), openpyxl (XLSX), pypdf (PDF) |
| HTTP 客户端 | httpx (支持超时、重试) |
| 数据存储 | 本地文件缓存 |

## 项目结构

```
resume-filler/
├── backend/                  # Python 后端服务
│   ├── server.py            # 主服务入口 (端口 8001)
│   ├── requirements.txt     # Python 依赖
│   ├── pyproject.toml       # 项目元数据和工具配置
│   ├── routers/             # API 路由层
│   │   └── resume.py        # 简历相关 API
│   ├── services/            # 业务逻辑层
│   │   ├── parser.py        # 文件解析（DOCX/TXT/XLSX/PDF）
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
├── CLAUDE.md                # 本文件
├── .editorconfig            # 编辑器统一配置
└── README.md                # 项目文档
```

## 编码规范

### Python (后端)

- **命名规范**: snake_case (变量/函数), PascalCase (类)
- **类型注解**: 使用 typing 模块，函数参数和返回值添加类型注解
- **文档字符串**: 模块、类、公共函数添加 docstring
- **代码风格**: 遵循 PEP 8，行长度 100 字符

```python
def load_version(self, version_id: str) -> Optional[Dict[str, Any]]:
    """
    加载指定版本的简历数据。

    Args:
        version_id: 版本ID

    Returns:
        简历数据字典，如果不存在返回 None
    """
```

### JavaScript (前端)

- **命名规范**: camelCase (变量/函数), PascalCase (类/组件)
- **字符串**: 使用单引号
- **分号**: 语句末尾加分号
- **缩进**: 2 空格

```javascript
async function loadResume() {
  const response = await fetch(`${API_BASE}/api/resume/load`);
  // ...
}
```

---

## ⚠️ 开发修改规则（必须遵守）

### 规则1：全局问题排查

> **在某个文件中发现问题时，必须在整个项目内搜索是否存在相同问题，一并处理。**

**执行步骤**：

1. **发现问题**：在文件 A 中发现问题 X
2. **全局搜索**：使用 `Grep` 在整个项目中搜索问题 X 的模式
3. **列出所有位置**：确认所有存在相同问题的文件和位置
4. **批量修复**：一次性修复所有位置，避免遗漏

**示例**：
```
问题：在 index.js 中发现 onclick 内联事件违反 CSP
行动：
1. grep -r "onclick=" frontend/public/
2. 发现 popup/index.js、web/index.js、content/index.js 都有 onclick
3. 全部修改为 addEventListener 事件委托方式
```

### 规则2：影响范围评估

> **修改某一处前，必须评估对其他部分的影响。如有影响，需弹窗询问并给出建议。**

**执行步骤**：

1. **理解修改**：明确要修改的内容和目的
2. **搜索依赖**：搜索项目中是否有其他代码依赖该部分
3. **评估影响**：
   - 该变量/函数/数据结构是否被其他文件引用？
   - 修改后是否会导致其他功能失效？
   - 数据格式变化是否影响前后端交互？
4. **有影响时**：使用 `AskUserQuestion` 弹窗询问用户，说明：
   - 修改内容
   - 影响范围
   - 建议的处理方案
   - 可选的替代方案

**示例**：
```
修改：collectFormData 函数添加 version_id 字段
检查：
1. fillForm 是否需要同步处理 version_id？→ 是，需要添加隐藏字段
2. 后端 API 是否需要 version_id？→ 是，/api/resume/save 必须有 version_id
3. 加载历史版本时是否需要保存 version_id？→ 是

结论：需要同时修改 fillForm、loadResume、loadVersion 等函数
```

## 开发流程

### 后端启动

```bash
cd backend

# 首次设置
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
copy .env.example .env  # 编辑填入 API Key

# 启动服务
python server.py  # 或 start.bat
```

服务地址: http://127.0.0.1:8001

### 前端构建

```bash
cd frontend

# 首次设置
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

构建输出到 `frontend/dist/`，在 Chrome 扩展页面加载此目录。

### 加载扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `frontend/dist` 目录

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/resume/upload` | POST | 上传并解析简历 |
| `/api/resume/supplement` | POST | 上传补充信息并整合到当前简历 |
| `/api/resume/load` | GET | 加载当前简历（通过引用） |
| `/api/resume/save` | POST | 保存简历（兼容旧 API） |
| `/api/resume/version` | POST | 创建新版本 |
| `/api/resume/version/{id}` | GET | 加载指定版本 |
| `/api/resume/version/{id}` | PUT | 更新指定版本 |
| `/api/resume/version/{id}` | DELETE | 删除指定版本 |
| `/api/resume/versions` | GET | 获取版本列表 |
| `/api/resume/set-current/{id}` | POST | 设置当前填写模板 |
| `/api/resume/mapping` | POST | 字段语义映射 |

## 重要约定

| 项目 | 值 |
|------|------|
| 后端端口 | 8001 |
| API 基础地址 | http://127.0.0.1:8001 |
| 数据存储目录 | ~/.resume-filler/cache/ |
| 当前简历引用 | ~/.resume-filler/cache/current_resume.json |
| 版本历史目录 | ~/.resume-filler/cache/versions/ |
| 文件缓存目录 | ~/.resume-filler/cache/file_cache/ |
| 最大版本数 | 5 |
| Chrome 扩展版本 | Manifest V3 |

## 数据模型

### 基本信息（28 个字段）

name, gender, birth_date, id_number, political_status, marital_status, ethnicity, native_place, phone, email, current_address, education, work_years, job_intention, wechat, qq, household_registration, student_source, height, weight, health_status, specialty, emergency_contact_name, emergency_contact_phone, country, mailing_address

### 多条目数组（16 种类型）

- `education_history` - 教育经历（含 college, study_mode, courses, gpa, ranking, is_overseas, minor_major, supervisor 扩展字段）
- `work_history` - 工作经历（含 work_type, department, salary, achievements, referee_name, referee_position, referee_contact, leaving_reason, subordinates 扩展字段）
- `internship_history` - 实习经历
- `project_history` - 项目经历
- `school_activities` - 在校经历（社团、学生会等）
- `awards_history` - 获奖情况
- `language_skills` - 外语能力
- `computer_skills` - 计算机技能
- `certificates_history` - 资格证书
- `family_info` - 家庭情况
- `papers` - 论文期刊
- `patents` - 专利
- `competitions` - 竞赛
- `portfolio` - 作品集

### 扩展字段

- `extra_fields` - AI 自动识别的额外字段
- `field_mapping` - 字段中英文映射表

## 数据存储架构

### 引用模式

```
~/.resume-filler/cache/
├── current_resume.json     ← 引用文件：{"version_id": "a1b2c3d4", "updated_at": "..."}
├── versions/
│   ├── a1b2c3d4.json       ← 版本A（完整简历数据）
│   ├── e5f6g7h8.json       ← 版本B
│   └── ...                 ← 最多5个
└── file_cache/
    └── abc123def456.json   ← 文件哈希缓存（相同文件秒解析）
```

### 数据同步原则

**后端是权威数据源，本地缓存是副本**

```
数据流向：
后端 API (权威) ──同步──> chrome.storage.local (副本)
     ↑                        ↓
     └── 回退（后端不可用时）──┘
```

## 前端架构

### popup/ - 原生弹窗（特殊页面使用）

**使用场景**：chrome://、edge:// 等特殊页面

**功能**：
- 上传简历（版本数量检查 >= 5 提示）
- 编辑信息（跳转 web 页面）
- 历史版本管理
- 开始/暂停/继续填写
- 上传进度条 + 解析进度条
- 日志显示

**代码结构**：
- `HttpClient` - HTTP 请求封装（超时、重试）
- `StorageManager` - Chrome 存储封装
- `ModalManager` - 弹窗管理器
- `LogManager` - 日志管理器
- `ProgressManager` - 进度条管理器
- `FillController` - 填写控制器
- `VersionManager` - 版本管理器

### content/ - 内容脚本（普通页面使用）

**核心功能**：
- **浮动弹窗**：可拖拽、Shadow DOM 隔离样式
- 表单元素识别（input/select/textarea/radio/checkbox）
- LLM 字段语义映射
- 自动填写逻辑
- 暂停/继续机制
- 优先后端加载数据

**Shadow DOM 隔离**：
```javascript
floatingPopup = document.createElement('div');
shadowRoot = floatingPopup.attachShadow({ mode: 'open' });
// 样式注入到 shadowRoot，与页面样式隔离
```

### background/ - Service Worker

**功能**：
- 动态 popup 设置（`chrome.action.setPopup()`）
- 扩展图标点击处理
- Content script 自动注入
- 扩展更新通知（通知所有标签页刷新）

**特殊页面判断**：
```javascript
const SPECIAL_PAGES = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];
```

### web/ - 简历管理页面

**功能**：
- 12 个分类编辑表单
- URL 参数支持：`?version={id}`、`?view=history`
- 保存/保存为新版本
- 历史版本管理
- "按照此简历填写"按钮
- "至今"日期处理
- **上传补充信息**：支持上传额外文件补充简历中没有的信息

## LLM 服务特性

### 限流与重试

- 最小请求间隔：2 秒
- 最大重试次数：3 次
- 递增等待时间

### JSON 修复机制

1. 清理 markdown 代码块
2. 修复未转义引号
3. 修复截断 JSON（补全括号）
4. 逐字段提取（终极方案）

### 提示词优化

- 精简字段说明
- 合并相似规则
- 减少示例冗余

## 常见问题

### 端口被占用

**重要**：uvicorn 在 Windows 上使用 multiprocessing 创建子进程，必须使用 `/T` 参数杀死进程树。

```bash
# Windows - 正确方式（杀死进程树）
netstat -ano | findstr :8001
taskkill /F /PID <PID> /T

# 错误方式（只杀死主进程，子进程仍占用端口）
taskkill /F /PID <PID>

# 或使用 stop.bat（已修复此问题）
```

### 前端修改不生效

重新构建前端：`npm run build`，然后在 Chrome 扩展页面点击刷新。

### LLM 调用失败

检查 `.env` 文件中的 `LLM_API_KEY` 和 `LLM_BASE_URL` 配置。

## 安全注意事项

- `.env` 文件包含 API Key，已在 .gitignore 中，切勿提交
- 简历数据仅保存在本地，不会上传到服务器
- API Key 不要硬编码到代码中
- 使用 Shadow DOM 隔离样式，避免与页面冲突
- HTML 转义防止 XSS

## 功能完成度

| 阶段 | 完成度 | 说明 |
|------|--------|------|
| 阶段A：简历解析 | 100% ✅ | 全部实现 |
| 阶段B：表单识别 | 100% ✅ | 全部实现 |
| 阶段C：自动填写 | 95% ✅ | 级联下拉框未实现 |

### 详细完成情况

| 模块 | 完成度 |
|------|--------|
| 后端 API | 100% ✅ |
| 缓存管理（引用模式） | 100% ✅ |
| 版本管理（CRUD） | 100% ✅ |
| 文件哈希缓存 | 100% ✅ |
| popup 弹窗 | 100% ✅ |
| web 管理页面 | 100% ✅ |
| content 浮动弹窗 | 100% ✅ |
| background 脚本 | 100% ✅ |
| 补充信息上传 | 100% ✅ |
| **级联下拉框** | 0% ❌ |
