# 问题解决总结

本文档记录开发过程中遇到的问题及解决方法。

---

## 问题 1：保存简历后历史版本列表没有新版本

### 现象
- 点击"保存简历"按钮后显示成功
- 但历史版本列表中没有新保存的版本
- API `/api/resume/save` 返回 `{"success":true,"message":"保存成功"}`，没有 `version_id`

### 根本原因
**uvicorn 的 reload 机制在 Windows 上不可靠**

1. uvicorn 使用 `reload=True` 时会创建父子进程结构：
   - 父进程：监控文件变化
   - 子进程：实际处理 HTTP 请求

2. 修改代码后，reload 有时不能正确重新加载 Python 模块：
   - Python 缓存 `.pyc` 文件没有被清除
   - 子进程仍然加载旧的字节码

3. 导致代码文件已修改，但运行的是旧代码

### 解决方法

1. **禁用 reload**：在 `server.py` 中设置 `reload=False`
2. **启动前清理缓存**：在 `start.bat` 中添加清理 `__pycache__` 的逻辑
3. **启动前清理端口**：在 `start.bat` 中添加清理端口占用进程的逻辑

### 修改的文件
- `backend/server.py` - 禁用 reload
- `backend/start.bat` - 添加缓存和端口清理

---

## 问题 2：进程管理混乱，端口被占用

### 现象
- 启动服务器时报端口被占用
- 手动关闭窗口后进程仍在运行
- 多次启动产生多个孤儿进程

### 根本原因
1. uvicorn reload 模式的父子进程结构复杂
2. 只杀掉其中一个进程会导致孤儿进程继续运行
3. Windows 下 Ctrl+C 有时不能正确终止所有进程

### 解决方法

1. **创建 `stop.bat`**：专门用于停止服务的脚本
   - 查找占用端口 8001 的进程并终止
   - 查找命令行包含 `server.py` 的进程并终止

2. **修改 `start.bat`**：启动前自动清理端口
   ```batch
   for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
       taskkill /F /PID %%a >nul 2>&1
   )
   ```

### 新增文件
- `backend/stop.bat` - 停止服务脚本

---

## 问题 3：Python 模块找不到 (ModuleNotFoundError)

### 现象
```
ModuleNotFoundError: No module named 'dotenv'
```

### 原因
依赖包没有安装

### 解决方法
```bash
pip install -r requirements.txt
```

---

## 问题 4：上传简历后数据不同步

### 现象
- 在 popup 上传简历后，点击"编辑信息"看不到数据
- 历史版本列表中没有刚上传的简历

### 根本原因
- `popup/index.js` 上传简历后只保存到 `chrome.storage.local`
- 没有调用后端 `/api/resume/save` API
- `web/index.js` 优先从后端 API 加载数据，导致数据不一致

### 解决方法
修改 `popup/index.js`，上传简历成功后同时保存到后端：

```javascript
// 上传成功后
chrome.storage.local.set({ resumeData: responseData.data });

// 同时保存到后端
const saveResponse = await fetch(`${API_BASE}/api/resume/save`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(responseData.data)
});
```

### 修改的文件
- `frontend/public/popup/index.js`

---

## 问题 5：版本列表交互不一致

### 现象
- popup 的版本列表显示"修改"按钮
- web 的版本列表显示"加载"按钮
- 用户对同一功能有不同理解

### 根本原因
两处代码独立开发，按钮命名不一致

### 解决方法
统一为"加载"和"删除"按钮：
- popup 版本列表：`修改` → `加载`
- 点击后先加载数据到 chrome storage，再跳转到编辑页面

### 修改的文件
- `frontend/public/popup/index.js`

---

## 问题 6：暂停/继续功能不完整

### 现象
- 点击暂停后，再点击继续，不会从暂停位置继续填写
- 表单填写是一次性完成的，无法暂停

### 根本原因
- `fillForms()` 函数使用 `forEach`，无法暂停
- 暂停只设置了状态，但没有等待恢复的逻辑

### 解决方法
改用 `for...of` 循环 + `while` 等待暂停恢复：

```javascript
async function fillForms(mapping) {
  for (let i = fillingState.currentIndex; i < fillingState.formElements.length; i++) {
    // 检查是否暂停
    while (fillingState.isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // 填写逻辑...
    fillingState.currentIndex = i + 1;
  }
}
```

### 修改的文件
- `frontend/public/content/index.js`

---

## 问题 7：姓名解析错误，将家庭成员姓名解析成本人姓名

### 现象
- 上传简历后，`name` 字段被错误地填写为母亲/父亲姓名
- 本人姓名被覆盖

### 根本原因
LLM prompt 中关于姓名的识别规则不够明确：
1. 规则位置靠后，容易被 LLM 忽略
2. 缺少具体的判断步骤和示例
3. 没有强调规则的优先级

### 解决方法
在 `_build_extraction_prompt` 方法开头添加最高优先级规则：

```python
⚠️⚠️⚠️ 【最高优先级规则 - 必须首先遵守】 ⚠️⚠️⚠️

【姓名(name)字段识别 - 最重要！】
1. name 字段【只能】填写简历主人本人的姓名，这是最重要的一条规则！
2. 如何识别本人姓名：
   - 通常出现在简历最开头或"基本信息"区域
   - 通常紧跟在"姓名："或"姓名"标签后面
   - 是简历中第一个出现的、没有任何关系前缀的姓名
3. 【绝对禁止填入 name 字段的情况】：
   ❌ "父亲：张三" 中的"张三" → 这是父亲姓名，填入 family_info
   ❌ "母亲：李四" 中的"李四" → 这是母亲姓名，填入 family_info
   ❌ "紧急联系人：赵六" 中的"赵六" → 填入 emergency_contact_name
4. 判断步骤（必须按顺序执行）：
   步骤1：找到简历中出现的所有姓名
   步骤2：检查每个姓名是否有关系前缀（父亲、母亲、配偶、联系人等）
   步骤3：排除所有有关系前缀的姓名
   步骤4：剩余的第一个姓名才是本人姓名
5. 示例：
   简历内容："姓名：张三\n性别：男\n...\n父亲：张四\n母亲：李五"
   正确结果：name = "张三"（本人），family_info = [{"name":"张四","relation":"父亲"}, ...]
   错误结果：name = "张四" 或 name = "李五"（这是严重错误！）

【电话(phone)字段识别】
1. phone 字段【只能】填写本人手机号
2. 【绝对禁止填入 phone 字段的情况】：
   ❌ "备用电话"、"家庭电话" → 填入 emergency_contact_phone
   ❌ "父亲电话"、"母亲电话" → 填入 family_info 中对应成员的 phone 字段
```

### 关键改进点
1. 将规则放在 prompt 最开头，提升优先级
2. 使用 ⚠️ 和 ❌ 符号强调重要性
3. 添加明确的判断步骤（步骤1-4）
4. 提供具体的正确/错误示例

### 修改的文件
- `backend/services/llm.py` - 重构姓名识别规则，提升优先级

---

## 问题 8：LLM 返回 JSON 被截断

### 现象
- 简历解析返回的 JSON 不完整
- 后端日志显示 `[WARN] JSON严重截断，尝试逐字段提取...`

### 根本原因
1. LLM API 返回的 token 数量超出限制
2. JSON 内容过长，包含大量字段

### 当前处理
后端 `_try_parse_json` 方法会尝试修复截断的 JSON：
- 补全缺失的括号
- 逐字段提取已完成的键值对

### 优化建议
1. 简化 prompt，减少不必要的字段描述
2. 使用更大的 `max_tokens` 参数（当前为 16000）
3. 考虑分批提取大量数据字段

---

## 经验总结

### 开发环境最佳实践

1. **Windows 下避免使用 uvicorn reload**
   - reload 在 Windows 上文件监控不稳定
   - 手动重启更可靠（配合 start.bat 自动清理）

2. **启动脚本应该包含清理逻辑**
   - 清理端口占用
   - 清理 Python 缓存

3. **提供专门的停止脚本**
   - 确保所有相关进程都被终止

4. **数据存储与代码分离**
   - 用户数据存储在 `~/.resume-filler/cache/`
   - 清理缓存和进程不会影响用户数据

5. **前后端数据同步**
   - 上传/保存操作应同时更新本地存储和后端
   - 避免数据不一致

6. **LLM Prompt 设计**
   - 重要规则放在 prompt 开头
   - 使用符号（⚠️❌）强调关键点
   - 提供具体的判断步骤和示例
   - 明确禁止的情况

---

*最后更新: 2026-04-02*
