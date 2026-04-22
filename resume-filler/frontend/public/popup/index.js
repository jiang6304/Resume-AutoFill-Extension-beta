/**
 * 简历自动填写助手 - Popup脚本
 *
 * 模块结构:
 * 1. 配置常量
 * 2. 工具函数
 * 3. HttpClient - HTTP请求封装
 * 4. StorageManager - Chrome存储封装
 * 5. ModalManager - 弹窗管理器
 * 6. LogManager - 日志管理器
 * 7. ProgressManager - 进度条管理器
 * 8. FillController - 填写控制器
 * 9. VersionManager - 版本管理器
 * 10. API服务
 * 11. 事件绑定
 * 12. 初始化
 */

// ==================== 1. 配置常量 ====================
const CONFIG = {
  API_BASE: 'http://127.0.0.1:8001',
  MAX_VERSIONS: 5,
  DEFAULT_TIMEOUT: 10000,
  MAX_RETRIES: 2
};

// ==================== 2. 工具函数 ====================

/**
 * HTML转义，防止XSS
 */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 3. HttpClient ====================

/**
 * HTTP客户端 - 支持超时和重试
 */
const HttpClient = {
  baseUrl: CONFIG.API_BASE,
  defaultTimeout: CONFIG.DEFAULT_TIMEOUT,
  maxRetries: CONFIG.MAX_RETRIES,

  /**
   * 通用请求方法
   */
  async request(options) {
    const {
      url,
      method = 'GET',
      data = null,
      timeout = this.defaultTimeout,
      retries = this.maxRetries
    } = options;

    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const config = {
          method,
          signal: controller.signal,
          headers: {}
        };

        if (data && !(data instanceof FormData)) {
          config.headers['Content-Type'] = 'application/json';
          config.body = JSON.stringify(data);
        } else if (data instanceof FormData) {
          config.body = data;
        }

        const response = await fetch(fullUrl, config);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();

      } catch (error) {
        if (attempt === retries) {
          if (error.name === 'AbortError') {
            throw new Error('请求超时');
          }
          throw error;
        }

        await delay(1000 * (attempt + 1));
        LogManager.add(`请求失败，正在重试 (${attempt + 1}/${retries})...`, 'warning');
      }
    }
  },

  /**
   * 文件上传（需要进度回调）
   */
  upload(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.ontimeout = () => reject(new Error('请求超时'));

      xhr.timeout = 30000;
      xhr.open('POST', fullUrl);
      xhr.send(formData);
    });
  },

  /**
   * POST FormData（简化版，不带进度回调）
   */
  async postFormData(url, formData) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  },

  get(url, options = {}) {
    return this.request({ url, method: 'GET', ...options });
  },

  post(url, data, options = {}) {
    return this.request({ url, method: 'POST', data, ...options });
  },

  put(url, data, options = {}) {
    return this.request({ url, method: 'PUT', data, ...options });
  },

  delete(url, options = {}) {
    return this.request({ url, method: 'DELETE', ...options });
  }
};

// ==================== 4. StorageManager ====================

/**
 * Chrome存储管理器
 */
const StorageManager = {
  get(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  },

  set(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  },

  async getResumeData() {
    try {
      const result = await this.get(['resumeData']);
      return result.resumeData || null;
    } catch (e) {
      console.error('获取简历数据失败:', e);
      return null;
    }
  },

  async saveResumeData(data) {
    try {
      await this.set({ resumeData: data });
      return true;
    } catch (e) {
      console.error('保存简历数据失败:', e);
      return false;
    }
  }
};

// ==================== 5. ModalManager ====================

/**
 * 弹窗管理器
 */
const ModalManager = {
  activeModal: null,

  /**
   * 显示弹窗
   */
  show(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // 关闭其他弹窗
    if (this.activeModal && this.activeModal !== modal) {
      this.hide(this.activeModal.id);
    }

    modal.style.display = 'flex';
    // 触发动画
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
    this.activeModal = modal;

    // 聚焦到第一个可聚焦元素
    const focusable = modal.querySelector('button, [tabindex="0"]');
    if (focusable) focusable.focus();
  },

  /**
   * 隐藏弹窗
   */
  hide(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('show');
    // 等待动画完成后隐藏
    setTimeout(() => {
      if (!modal.classList.contains('show')) {
        modal.style.display = 'none';
      }
    }, 200);

    if (this.activeModal === modal) {
      this.activeModal = null;
    }
  },

  /**
   * 初始化事件监听
   */
  init() {
    // ESC键关闭弹窗
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.hide(this.activeModal.id);
      }
    });

    // 点击遮罩关闭
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay') && this.activeModal) {
        this.hide(this.activeModal.id);
      }
    });
  }
};

/**
 * 显示确认弹窗（替代原生confirm）
 */
function showConfirm(options) {
  const {
    title = '确认',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    type = 'default' // default | danger
  } = options;

  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay confirm-modal';
    modal.innerHTML = `
      <div class="modal-content modal-content-center">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-desc">${escapeHtml(message)}</div>
        <div class="modal-actions">
          <button class="btn-cancel">${escapeHtml(cancelText)}</button>
          <button class="btn-confirm ${type === 'danger' ? 'btn-danger' : ''}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const close = (result) => {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
        resolve(result);
      }, 200);
    };

    modal.querySelector('.btn-cancel').addEventListener('click', () => close(false));
    modal.querySelector('.btn-confirm').addEventListener('click', () => close(true));

    // ESC键关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        close(false);
      }
    };
    document.addEventListener('keydown', escHandler);

    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        close(false);
      }
    });
  });
}

// ==================== 6. LogManager ====================

/**
 * 日志管理器
 */
const LogManager = {
  container: null,
  toggleBtn: null,
  isVisible: false,

  init(containerId, toggleBtnId) {
    this.container = document.getElementById(containerId);
    this.toggleBtn = document.getElementById(toggleBtnId);
  },

  add(message, type = 'info') {
    if (!this.container) return;

    const time = new Date().toLocaleTimeString();
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };

    const item = document.createElement('div');
    item.className = `log-item log-${type}`;
    item.innerHTML = `<span class="log-time">[${time}]</span>${icons[type] || 'ℹ'} ${escapeHtml(message)}`;
    this.container.appendChild(item);

    // 自动滚动到底部
    this.container.scrollTop = this.container.scrollHeight;
  },

  toggle() {
    if (!this.container) return;
    this.isVisible = !this.isVisible;
    this.container.classList.toggle('show', this.isVisible);
    if (this.toggleBtn) {
      this.toggleBtn.textContent = this.isVisible ? '隐藏日志' : '显示日志';
    }
  }
};

// ==================== 7. ProgressManager ====================

/**
 * 进度条管理器
 */
const ProgressManager = {
  elements: {},

  init() {
    this.elements = {
      uploadProgress: document.getElementById('uploadProgress'),
      uploadProgressBar: document.getElementById('uploadProgressBar'),
      uploadProgressText: document.getElementById('uploadProgressText'),
      parseProgress: document.getElementById('parseProgress'),
      parseProgressBar: document.getElementById('parseProgressBar'),
      parseProgressText: document.getElementById('parseProgressText')
    };
  },

  showUpload() {
    const { uploadProgress, uploadProgressBar, uploadProgressText } = this.elements;
    if (uploadProgress) {
      uploadProgress.style.display = 'block';
      uploadProgressBar.style.width = '0%';
      uploadProgressText.textContent = '上传中... 0%';
    }
    this.hideParse();
  },

  updateUpload(percent) {
    const { uploadProgressBar, uploadProgressText } = this.elements;
    if (uploadProgressBar) {
      uploadProgressBar.style.width = `${percent}%`;
      uploadProgressText.textContent = `上传中... ${percent}%`;
    }
  },

  hideUpload() {
    const { uploadProgress } = this.elements;
    if (uploadProgress) uploadProgress.style.display = 'none';
  },

  showParse(message = '解析中...') {
    const { parseProgress, parseProgressBar, parseProgressText } = this.elements;
    if (parseProgress) {
      parseProgress.style.display = 'block';
      parseProgressBar.classList.add('indeterminate');
      parseProgressText.textContent = message;
    }
    this.hideUpload();
  },

  updateParse(message) {
    const { parseProgressText } = this.elements;
    if (parseProgressText) parseProgressText.textContent = message;
  },

  hideParse() {
    const { parseProgress } = this.elements;
    if (parseProgress) parseProgress.style.display = 'none';
  },

  hideAll() {
    this.hideUpload();
    this.hideParse();
  }
};

// ==================== 8. FillController ====================

/**
 * 填写控制器 - 统一管理按钮状态
 */
const FillController = {
  STATUS: {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused'
  },

  currentStatus: 'idle',
  elements: {},

  init() {
    this.elements = {
      startBtn: document.getElementById('startBtn'),
      pauseBtn: document.getElementById('pauseBtn'),
      continueBtn: document.getElementById('continueBtn'),
      progress: document.getElementById('progress')
    };

    this.elements.startBtn?.addEventListener('click', () => this.start());
    this.elements.pauseBtn?.addEventListener('click', () => this.pause());
    this.elements.continueBtn?.addEventListener('click', () => this.continue());

    this.render();
  },

  setStatus(status) {
    this.currentStatus = status;
    this.render();
  },

  render() {
    const { startBtn, pauseBtn, continueBtn } = this.elements;

    switch (this.currentStatus) {
      case this.STATUS.IDLE:
        if (startBtn) startBtn.style.display = 'flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (continueBtn) continueBtn.style.display = 'none';
        break;

      case this.STATUS.RUNNING:
        if (startBtn) startBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'flex';
        if (continueBtn) continueBtn.style.display = 'none';
        break;

      case this.STATUS.PAUSED:
        if (startBtn) startBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (continueBtn) continueBtn.style.display = 'flex';
        break;
    }
  },

  async start() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const specialPages = ['chrome://', 'chrome-extension://', 'edge://', 'about:'];
    if (specialPages.some(p => (tab.url || '').startsWith(p))) {
      LogManager.add('当前页面不支持填写，请切换到招聘网站', 'warning');
      StatusManager.set('请在招聘网站使用此功能', 'error');
      return;
    }

    this.setStatus(this.STATUS.RUNNING);
    LogManager.add('开始自动填写...', 'info');
    StatusManager.set('正在填写...', 'running');

    chrome.tabs.sendMessage(tab.id, { action: 'startFilling' });
  },

  pause() {
    this.setStatus(this.STATUS.PAUSED);
    LogManager.add('已暂停', 'info');
    StatusManager.set('已暂停，点击继续恢复', 'paused');
  },

  continue() {
    this.setStatus(this.STATUS.RUNNING);
    LogManager.add('继续填写...', 'info');
    StatusManager.set('正在填写...', 'running');
  },

  updateProgress(filled, total) {
    const { progress } = this.elements;
    if (progress) {
      const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
      const prefix = filled === total && total > 0 ? '成功填写' : '已填';
      progress.textContent = `${prefix} ${filled} / 总数 ${total} (${percent}%)`;
    }
  }
};

// ==================== 状态管理器 ====================

const StatusManager = {
  element: null,
  textElement: null,

  init() {
    this.element = document.getElementById('status');
    this.textElement = this.element?.querySelector('.status-text');
  },

  set(message, type = 'waiting') {
    if (!this.element) return;

    // 清除所有状态类
    this.element.classList.remove('status--waiting', 'status--running', 'status--paused', 'status--success', 'status--error');
    this.element.classList.add(`status--${type}`);

    if (this.textElement) {
      this.textElement.textContent = message;
    } else {
      this.element.textContent = message;
    }
  }
};

// ==================== 编辑按钮管理器 ====================

const EditButtonManager = {
  element: null,
  originalText: '编辑信息',
  processingText: '简历处理中...',

  init() {
    this.element = document.getElementById('editBtn');
  },

  /**
   * 设置为处理中状态（禁用）
   */
  setProcessing() {
    if (!this.element) return;
    this.element.disabled = true;
    this.element.textContent = this.processingText;
    this.element.style.opacity = '0.6';
    this.element.style.cursor = 'not-allowed';
  },

  /**
   * 恢复正常状态（可点击）
   */
  setNormal() {
    if (!this.element) return;
    this.element.disabled = false;
    this.element.textContent = this.originalText;
    this.element.style.opacity = '1';
    this.element.style.cursor = 'pointer';
  }
};

// ==================== 9. VersionManager ====================

/**
 * 版本管理器
 */
const VersionManager = {
  async loadList() {
    LogManager.add('正在获取历史版本...', 'info');
    try {
      const data = await HttpClient.get('/api/resume/versions');
      if (data.success && data.data && data.data.length > 0) {
        this.renderList(data.data);
      } else {
        this.showEmpty();
      }
    } catch (error) {
      LogManager.add(`获取版本列表失败: ${error.message}`, 'error');
      this.showEmpty();
    }
  },

  renderList(versions) {
    const list = document.getElementById('versionList');
    if (!list) return;

    list.innerHTML = versions.map(version => {
      const date = new Date(version.updated_at || version.created_at).toLocaleString('zh-CN');
      const name = version.name || '未命名简历';
      const jobIntention = version.job_intention || '';
      const sourceFile = version.source_file || '';

      return `
        <div class="version-item" data-version-id="${version.version_id}">
          <div class="version-info">
            <div class="version-name">${escapeHtml(name)}</div>
            <div class="version-meta">
              ${jobIntention ? `<span>求职意向: ${escapeHtml(jobIntention)}</span><br>` : ''}
              ${sourceFile ? `<span>来源: ${escapeHtml(sourceFile)}</span><br>` : ''}
              <span>保存时间: ${date}</span>
            </div>
          </div>
          <div class="version-actions">
            <button class="version-btn version-btn-load" data-action="load" data-version-id="${version.version_id}">加载</button>
            <button class="version-btn version-btn-use" data-action="use" data-version-id="${version.version_id}" style="background: #28a745;">按照此简历填写</button>
          </div>
        </div>
      `;
    }).join('');

    ModalManager.show('versionModal');
  },

  showEmpty() {
    const list = document.getElementById('versionList');
    if (!list) return;

    list.innerHTML = `
      <div class="no-versions">
        <svg class="no-versions-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <div class="no-versions-text">暂无历史简历</div>
        <div class="no-versions-hint">上传简历后会自动保存</div>
      </div>
    `;
    ModalManager.show('versionModal');
  },

  async load(versionId) {
    try {
      const data = await HttpClient.get(`/api/resume/version/${versionId}`);
      if (data.success && data.data) {
        // 保存到 chrome storage
        await StorageManager.saveResumeData(data.data);

        // 更新后端当前引用
        try {
          await HttpClient.put(`/api/resume/version/${versionId}`, data.data);
        } catch (e) {
          console.log('更新后端引用失败，但继续');
        }

        ModalManager.hide('versionModal');
        // 跳转到编辑页面
        chrome.tabs.create({ url: chrome.runtime.getURL(`web/index.html?version=${versionId}`) });
      } else {
        LogManager.add('加载版本失败', 'error');
      }
    } catch (error) {
      LogManager.add(`加载失败: ${error.message}`, 'error');
    }
  },

  /**
   * 使用指定版本的简历作为当前填写表单的信息源
   */
  async use(versionId) {
    try {
      LogManager.add('正在设置为填写模板...', 'info');

      // 1. 设置后端当前版本
      await HttpClient.post(`/api/resume/set-current/${versionId}`);

      // 2. 加载该版本的完整数据
      const data = await HttpClient.get(`/api/resume/version/${versionId}`);
      if (data.success && data.data) {
        // 3. 保存到 chrome storage（作为填写表单的数据源）
        await StorageManager.saveResumeData(data.data);

        const name = data.data.name || data.data.basic_info?.name || '未命名';
        LogManager.add(`已切换为: ${name}`, 'success');
        StatusManager.set('简历已就绪，可以开始填写', 'success');

        // 关闭弹窗
        ModalManager.hide('versionModal');
      } else {
        LogManager.add('加载简历失败', 'error');
      }
    } catch (error) {
      LogManager.add(`加载失败: ${error.message}`, 'error');
    }
  }
};

// ==================== 10. API服务 ====================

/**
 * 上传简历
 */
async function uploadResume() {
  // 上传前检查版本数量
  try {
    const versionsData = await HttpClient.get('/api/resume/versions');
    if (versionsData.success && versionsData.data?.length >= CONFIG.MAX_VERSIONS) {
      ModalManager.show('versionLimitModal');
      return;
    }
  } catch (e) {
    // 后端未启动，继续尝试上传
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.docx,.txt,.xlsx,.pdf';

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    LogManager.add(`正在上传: ${file.name}`, 'info');

    // 禁用编辑按钮，显示处理中状态
    EditButtonManager.setProcessing();

    // 显示上传进度条
    ProgressManager.showUpload();
    StatusManager.set('正在上传简历...', 'running');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const responseData = await HttpClient.upload('/api/resume/upload', formData, (percent) => {
        ProgressManager.updateUpload(percent);
      });

      if (responseData.success && responseData.data) {
        // 切换到解析进度条
        ProgressManager.showParse();
        StatusManager.set('正在解析简历...', 'running');

        // 检查是否使用了缓存
        if (responseData.message === '使用缓存数据') {
          LogManager.add('使用缓存数据，秒解析完成!', 'success');
        } else {
          LogManager.add('简历解析成功!', 'success');
        }

        // 隐藏进度条
        ProgressManager.hideAll();

        // 保存到 chrome storage
        await StorageManager.saveResumeData(responseData.data);

        StatusManager.set('简历已就绪，可以开始填写', 'success');

        // 恢复编辑按钮
        EditButtonManager.setNormal();
      } else {
        ProgressManager.hideAll();
        LogManager.add('简历解析失败: ' + (responseData.message || '未知错误'), 'error');
        StatusManager.set('解析失败，请重试', 'error');

        // 恢复编辑按钮
        EditButtonManager.setNormal();
      }
    } catch (error) {
      ProgressManager.hideAll();
      LogManager.add(`上传失败: ${error.message}`, 'error');
      StatusManager.set('上传失败，请重试', 'error');

      // 恢复编辑按钮
      EditButtonManager.setNormal();
    }
  };

  input.click();
}

// ==================== 11. 事件绑定 ====================

function bindEvents() {
  // 上传按钮
  document.getElementById('uploadBtn')?.addEventListener('click', uploadResume);

  // 编辑按钮
  document.getElementById('editBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('web/index.html') });
  });

  // 历史版本按钮
  document.getElementById('versionBtn')?.addEventListener('click', () => {
    VersionManager.loadList();
  });

  // 关闭版本弹窗按钮
  document.getElementById('close-modal-btn')?.addEventListener('click', () => {
    ModalManager.hide('versionModal');
  });

  // 日志切换
  document.getElementById('logToggle')?.addEventListener('click', () => {
    LogManager.toggle();
  });

  // 版本列表事件委托
  document.getElementById('versionList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.version-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const versionId = btn.dataset.versionId;

    if (action === 'load') {
      VersionManager.load(versionId);
    } else if (action === 'use') {
      VersionManager.use(versionId);
    }
  });

  // 版本超限弹窗
  document.getElementById('cancelLimitBtn')?.addEventListener('click', () => {
    ModalManager.hide('versionLimitModal');
  });

  document.getElementById('goDeleteBtn')?.addEventListener('click', () => {
    ModalManager.hide('versionLimitModal');
    chrome.tabs.create({ url: chrome.runtime.getURL('web/index.html?view=history') });
  });
}

// ==================== 12. 初始化 ====================

async function init() {
  // 初始化各管理器
  ModalManager.init();
  LogManager.init('logArea', 'logToggle');
  ProgressManager.init();
  StatusManager.init();
  EditButtonManager.init();
  FillController.init();

  // 绑定事件
  bindEvents();

  // 检查后端服务状态
  try {
    const response = await HttpClient.get('/health', { retries: 0 });
    if (response) {
      LogManager.add('后端服务已连接', 'success');
    }
  } catch (error) {
    LogManager.add('后端服务未启动', 'error');
    StatusManager.set('请先启动后端服务', 'error');
  }

  // 检查是否有缓存的简历数据
  const resumeData = await StorageManager.getResumeData();
  if (resumeData) {
    StatusManager.set('简历已就绪，可以开始填写', 'success');
  }
}

// 启动
document.addEventListener('DOMContentLoaded', init);
