# Resume Filler Backend

简历自动填写助手的Python后端服务。

## 环境配置

### 1. 创建虚拟环境（推荐）

```bash
python -m venv venv
venv\Scripts\activate  # Windows
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填入您的LLM API配置：

```bash
copy .env.example .env
```

编辑 `.env` 文件：
```
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=your_base_url_here
```

### 4. 启动服务

```bash
python server.py
```

服务将在 `http://localhost:8001` 启动。

## API端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/resume/upload` | POST | 上传并解析简历（DOCX/TXT/XLSX） |
| `/api/resume/save` | POST | 保存当前简历数据 |
| `/api/resume/load` | GET | 加载当前已保存的简历 |
| `/api/resume/version` | POST | 保存为新版本（历史记录） |
| `/api/resume/versions` | GET | 获取版本历史列表 |
| `/api/resume/version/{version_id}` | GET | 加载指定版本的简历数据 |
| `/api/resume/version/{version_id}` | DELETE | 删除指定版本 |
| `/api/resume/mapping` | POST | 简历字段与表单字段的语义映射 |
| `/api/resume/current` | DELETE | 删除当前简历数据 |

## 项目结构

```
backend/
├── server.py          # 主服务入口
├── requirements.txt   # Python依赖
├── .env.example       # 环境变量模板
├── .env               # 环境变量配置（不提交到版本控制）
├── routers/           # API路由
│   └── resume.py      # 简历相关API路由
├── services/          # 业务逻辑
│   ├── parser.py      # 文件解析服务（DOCX/TXT/XLSX）
│   └── llm.py         # LLM调用服务（简历解析、字段映射）
├── models/            # 数据模型
│   └── resume.py      # 简历Pydantic模型定义
└── utils/             # 工具函数
    └── cache.py       # 缓存管理（本地文件缓存、版本管理）
```

## 数据存储

简历数据存储在用户目录下的 `.resume-filler/cache/` 文件夹中：
- `current_resume.json` - 当前简历数据
- `versions/` - 历史版本目录（最多保留5个版本）

## 更新日志

### 2024-04-01
- 新增历史简历版本管理功能
  - 添加 `GET /api/resume/versions` 获取版本列表
  - 添加 `GET /api/resume/version/{version_id}` 加载指定版本
  - 添加 `DELETE /api/resume/version/{version_id}` 删除指定版本
- 前端弹窗新增"选择历史版本"功能
  - 版本列表弹窗展示（姓名、求职意向、保存时间）
  - 点击"修改"跳转到编辑页面加载该版本
  - 支持删除不需要的版本
- 简历管理页面支持URL参数加载指定版本 `?version=版本ID`
