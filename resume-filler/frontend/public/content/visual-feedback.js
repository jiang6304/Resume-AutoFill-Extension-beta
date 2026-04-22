/**
 * 简历自动填写助手 - 可视化反馈模块
 * 提供表单元素状态高亮和进度面板功能
 * @version 1.3.1
 */

// 模块版本
const VISUAL_FEEDBACK_VERSION = '1.3.1';

// 状态枚举
const FieldStatus = {
  IDENTIFIED: 'IDENTIFIED',   // 已识别（有映射值）
  NO_MAPPING: 'NO_MAPPING',   // 无映射值
  FILLING: 'FILLING',         // 填写中
  COMPLETED: 'COMPLETED',     // 已填写
  FAILED: 'FAILED',           // 失败
  SKIPPED: 'SKIPPED'          // 跳过
};

// 状态样式配置
const STATUS_STYLES = {
  [FieldStatus.IDENTIFIED]: {
    border: '2px dashed #3b82f6',
    background: 'rgba(59, 130, 246, 0.05)',
    label: null,
    color: '#3b82f6'
  },
  [FieldStatus.NO_MAPPING]: {
    border: '2px dashed #f59e0b',
    background: 'rgba(245, 158, 11, 0.1)',
    label: null,
    color: '#f59e0b'
  },
  [FieldStatus.FILLING]: {
    border: '2px solid #22c55e',
    background: 'transparent',
    label: '⏳ 填写中...',
    color: '#22c55e',
    animation: true
  },
  [FieldStatus.COMPLETED]: {
    border: '2px solid #22c55e',
    background: 'rgba(34, 197, 94, 0.1)',
    label: null,
    color: '#22c55e'
  },
  [FieldStatus.FAILED]: {
    border: '2px solid #ef4444',
    background: 'rgba(239, 68, 68, 0.05)',
    label: '❌ 失败',
    color: '#ef4444'
  },
  [FieldStatus.SKIPPED]: {
    border: '2px dashed #9ca3af',
    background: 'transparent',
    label: '⏭️ 跳过',
    color: '#9ca3af'
  }
};

/**
 * VisualFeedback 类
 * 负责表单元素的可视化状态显示和进度面板
 */
class VisualFeedback {
  constructor() {
    // 存储已标记元素的原始样式
    this.elementStates = new Map();
    // 标签元素映射
    this.labelElements = new Map();
    // 进度面板
    this.progressPanel = null;
    this.progressShadowRoot = null;
    // 统计数据
    this.stats = {
      total: 0,
      identified: 0,
      noMapping: 0,
      filling: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };
    // 动画样式已注入标记
    this.animationInjected = false;
    // 进度面板容器
    this.container = null;
    // 存储键名
    this.storageKey = 'rf-identified-elements';
    // 当前页面URL（用于区分不同页面）
    this.currentUrl = window.location.href.split('?')[0].split('#')[0];
  }

  /**
   * 初始化可视化反馈系统
   */
  init() {
    this.injectAnimationStyles();
    this.createProgressPanel();
    // 恢复已保存的识别状态
    this.restoreIdentifiedElements();
    console.log(`[VisualFeedback] 初始化完成 - 版本 ${VISUAL_FEEDBACK_VERSION}`);
  }

  /**
   * 生成元素的唯一标识符
   * @param {HTMLElement} element 目标元素
   * @returns {string} 元素标识符
   */
  generateElementId(element) {
    // 优先使用 id
    if (element.id) {
      return `id:${element.id}`;
    }
    // 其次使用 name
    if (element.name) {
      return `name:${element.name}`;
    }
    // 使用标签类型 + placeholder
    if (element.placeholder) {
      return `placeholder:${element.tagName}:${element.placeholder}`;
    }
    // 使用标签类型 + aria-label
    if (element.getAttribute('aria-label')) {
      return `aria:${element.tagName}:${element.getAttribute('aria-label')}`;
    }
    // 最后使用路径选择器
    return `path:${this.getElementPath(element)}`;
  }

  /**
   * 获取元素的 CSS 路径
   * @param {HTMLElement} element 目标元素
   * @returns {string} CSS 路径
   */
  getElementPath(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      }
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ').filter(c => c && !c.startsWith('rf-'));
        if (classes.length > 0) {
          selector += `.${classes[0]}`;
        }
      }
      const siblings = current.parentElement ?
        Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName) : [];
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join('>');
  }

  /**
   * 保存已识别元素到存储
   */
  saveIdentifiedElements() {
    try {
      const identifiedIds = [];
      this.elementStates.forEach((state, element) => {
        // 只保存已识别状态的元素
        if (state.status === FieldStatus.IDENTIFIED) {
          const id = this.generateElementId(element);
          identifiedIds.push(id);
        }
      });

      // 获取所有页面的数据
      let allData = {};
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        try {
          allData = JSON.parse(stored);
        } catch (e) {
          allData = {};
        }
      }

      // 更新当前页面的数据
      if (identifiedIds.length > 0) {
        allData[this.currentUrl] = {
          elements: identifiedIds,
          savedAt: Date.now()
        };
      } else {
        // 没有识别元素则删除当前页面记录
        delete allData[this.currentUrl];
      }

      localStorage.setItem(this.storageKey, JSON.stringify(allData));
      console.log(`[VisualFeedback] 已保存 ${identifiedIds.length} 个识别元素`);
    } catch (e) {
      console.warn('[VisualFeedback] 保存识别元素失败:', e);
    }
  }

  /**
   * 根据标识符查找元素
   * @param {string} id 元素标识符
   * @returns {HTMLElement|null} 找到的元素
   */
  findElementById(id) {
    if (id.startsWith('id:')) {
      return document.getElementById(id.substring(3));
    }
    if (id.startsWith('name:')) {
      return document.querySelector(`[name="${id.substring(5)}"]`);
    }
    if (id.startsWith('placeholder:')) {
      const parts = id.substring(12).split(':');
      const tag = parts[0];
      const placeholder = parts.slice(1).join(':');
      return document.querySelector(`${tag}[placeholder="${placeholder}"]`);
    }
    if (id.startsWith('aria:')) {
      const parts = id.substring(5).split(':');
      const tag = parts[0];
      const ariaLabel = parts.slice(1).join(':');
      return document.querySelector(`${tag}[aria-label="${ariaLabel}"]`);
    }
    if (id.startsWith('path:')) {
      return document.querySelector(id.substring(5));
    }
    return null;
  }

  /**
   * 恢复已保存的识别状态
   */
  restoreIdentifiedElements() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const allData = JSON.parse(stored);
      const pageData = allData[this.currentUrl];

      if (!pageData || !pageData.elements) return;

      // 清理过期数据（超过24小时）
      if (Date.now() - pageData.savedAt > 24 * 60 * 60 * 1000) {
        delete allData[this.currentUrl];
        localStorage.setItem(this.storageKey, JSON.stringify(allData));
        return;
      }

      // 恢复识别状态
      let restoredCount = 0;
      pageData.elements.forEach(id => {
        const element = this.findElementById(id);
        if (element) {
          // 直接应用样式，不调用 setElementStatus 以避免重复保存
          this.applyIdentifiedStyle(element);
          restoredCount++;
        }
      });

      console.log(`[VisualFeedback] 恢复了 ${restoredCount} 个识别元素`);
    } catch (e) {
      console.warn('[VisualFeedback] 恢复识别元素失败:', e);
    }
  }

  /**
   * 应用已识别样式（用于恢复）
   * @param {HTMLElement} element 目标元素
   */
  applyIdentifiedStyle(element) {
    const style = STATUS_STYLES[FieldStatus.IDENTIFIED];

    // 保存原始样式
    if (!this.elementStates.has(element)) {
      this.elementStates.set(element, {
        border: element.style.border,
        background: element.style.background,
        boxShadow: element.style.boxShadow,
        position: element.style.position,
        status: FieldStatus.IDENTIFIED
      });
    }

    // 确保元素可以显示标签
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      element.style.position = 'relative';
    }

    // 添加高亮类
    element.classList.add('rf-highlighted');

    // 应用状态样式
    element.style.border = style.border;
    element.style.background = style.background;

    // 创建状态标签
    this.createStatusLabel(element, style, null);

    // 更新统计
    this.stats.identified++;
    this.stats.total = Math.max(this.stats.total, this.stats.identified);
  }

  /**
   * 注入动画样式到页面
   */
  injectAnimationStyles() {
    if (this.animationInjected) return;

    const style = document.createElement('style');
    style.id = 'rf-animation-styles';
    style.textContent = `
      /* 脉冲动画 */
      @keyframes rf-pulse {
        0%, 100% {
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
        }
        50% {
          box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
        }
      }

      /* 标签淡入动画 */
      @keyframes rf-label-fade-in {
        from {
          opacity: 0;
          transform: translateY(-5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* 进度面板滑入动画 */
      @keyframes rf-panel-slide-in {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* 高亮元素样式 */
      .rf-highlighted {
        transition: box-shadow 0.2s ease, border-color 0.2s ease !important;
      }

      /* 填写中动画 */
      .rf-filling {
        animation: rf-pulse 1.5s infinite !important;
      }

      /* 状态标签 */
      .rf-status-label {
        position: absolute;
        top: -22px;
        left: 0;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        z-index: 2147483646;
        animation: rf-label-fade-in 0.2s ease;
        pointer-events: none;
      }
    `;

    document.head.appendChild(style);
    this.animationInjected = true;
  }

  /**
   * 创建进度面板
   */
  createProgressPanel() {
    // 创建容器
    this.container = document.createElement('div');
    this.container.id = 'rf-progress-container';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      display: none;
    `;

    // 使用 Shadow DOM 隔离样式
    this.progressShadowRoot = this.container.attachShadow({ mode: 'open' });

    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      .panel {
        width: 280px;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: rf-panel-slide-in 0.3s ease;
        overflow: hidden;
      }

      .panel-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        font-size: 14px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .panel-close {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.7;
        padding: 0;
        line-height: 1;
      }

      .panel-close:hover {
        opacity: 1;
      }

      .panel-body {
        padding: 16px;
      }

      .stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #f0f0f0;
      }

      .stat-row:last-child {
        border-bottom: none;
      }

      .stat-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #333;
      }

      .stat-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .stat-value {
        font-size: 14px;
        font-weight: 500;
        color: #333;
      }

      .progress-bar-container {
        width: 100%;
        height: 6px;
        background: #e8e8e8;
        border-radius: 3px;
        margin-top: 12px;
        overflow: hidden;
      }

      .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #22c55e, #4ade80);
        border-radius: 3px;
        transition: width 0.3s ease;
        width: 0%;
      }

      .progress-text {
        text-align: center;
        font-size: 12px;
        color: #666;
        margin-top: 8px;
      }

      /* 状态颜色 */
      .dot-identified { background: #3b82f6; }
      .dot-filling { background: #22c55e; }
      .dot-completed { background: #22c55e; }
      .dot-failed { background: #ef4444; }
      .dot-skipped { background: #9ca3af; }

      /* 折叠按钮 */
      .collapse-btn {
        width: 100%;
        padding: 8px;
        background: #f5f5f5;
        border: none;
        font-size: 12px;
        color: #666;
        cursor: pointer;
        display: none;
      }

      .collapse-btn:hover {
        background: #e8e8e8;
      }
    `;

    this.progressShadowRoot.appendChild(style);

    // 创建面板 HTML
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-header">
        <span>📊 填写进度</span>
        <button class="panel-close" id="closeBtn">&times;</button>
      </div>
      <div class="panel-body">
        <div class="stat-row">
          <div class="stat-label">
            <div class="stat-dot dot-identified"></div>
            <span>已识别</span>
          </div>
          <div class="stat-value" id="statIdentified">0</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">
            <div class="stat-dot dot-completed"></div>
            <span>已填写</span>
          </div>
          <div class="stat-value" id="statCompleted">0</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">
            <div class="stat-dot dot-skipped"></div>
            <span>已跳过</span>
          </div>
          <div class="stat-value" id="statSkipped">0</div>
        </div>
        <div class="stat-row">
          <div class="stat-label">
            <div class="stat-dot dot-failed"></div>
            <span>失败</span>
          </div>
          <div class="stat-value" id="statFailed">0</div>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar" id="progressBar"></div>
        </div>
        <div class="progress-text" id="progressText">已填 0 / 总数 0 (0%)</div>
      </div>
    `;

    this.progressShadowRoot.appendChild(panel);

    // 绑定关闭按钮事件
    const closeBtn = this.progressShadowRoot.getElementById('closeBtn');
    closeBtn.addEventListener('click', () => this.hideProgressPanel());

    document.body.appendChild(this.container);

    // 保存面板引用
    this.progressPanel = panel;
  }

  /**
   * 显示进度面板
   */
  showProgressPanel() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  /**
   * 隐藏进度面板
   */
  hideProgressPanel() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * 更新统计数据显示
   * @param {Object} stats 统计数据
   */
  updateStats(stats) {
    this.stats = { ...this.stats, ...stats };

    if (!this.progressShadowRoot) return;

    const updateElement = (id, value) => {
      const el = this.progressShadowRoot.getElementById(id);
      if (el) {
        el.textContent = value;
      }
    };

    updateElement('statIdentified', this.stats.identified);
    updateElement('statCompleted', this.stats.completed);
    updateElement('statSkipped', this.stats.skipped);
    updateElement('statFailed', this.stats.failed);

    // 更新进度条 - 显示完整填写进度
    const total = this.stats.total || 1;
    const completed = this.stats.completed + this.stats.skipped;
    const percentage = Math.round((completed / total) * 100);

    const progressBar = this.progressShadowRoot.getElementById('progressBar');
    const progressText = this.progressShadowRoot.getElementById('progressText');

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = `成功填写 ${percentage}% (${completed}/${total})`;
    }
  }

  /**
   * 设置元素状态
   * @param {HTMLElement} element 目标元素
   * @param {string} status 状态 (FieldStatus)
   * @param {string} labelText 可选的自定义标签文本
   */
  setElementStatus(element, status, labelText = null) {
    if (!element) return;

    const style = STATUS_STYLES[status];
    if (!style) return;

    // 保存原始样式（首次标记时）
    if (!this.elementStates.has(element)) {
      this.elementStates.set(element, {
        border: element.style.border,
        background: element.style.background,
        boxShadow: element.style.boxShadow,
        position: element.style.position,
        status: status
      });
    } else {
      // 更新状态
      const state = this.elementStates.get(element);
      state.status = status;
    }

    // 确保元素可以显示标签
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      element.style.position = 'relative';
    }

    // 添加高亮类
    element.classList.add('rf-highlighted');

    // 应用状态样式
    element.style.border = style.border;
    element.style.background = style.background;

    // 处理动画
    if (style.animation) {
      element.classList.add('rf-filling');
    } else {
      element.classList.remove('rf-filling');
    }

    // 创建或更新状态标签
    this.createStatusLabel(element, style, labelText);

    // 只有已识别状态才保存
    if (status === FieldStatus.IDENTIFIED) {
      this.saveIdentifiedElements();
    }

    console.log(`[VisualFeedback] 元素状态更新: ${status}`, element);
  }

  /**
   * 创建状态标签
   * @param {HTMLElement} element 目标元素
   * @param {Object} style 样式配置
   * @param {string} labelText 自定义标签文本
   */
  createStatusLabel(element, style, labelText) {
    // 移除旧标签
    this.removeStatusLabel(element);

    // 如果没有标签文本，不创建标签
    const finalLabelText = labelText || style.label;
    if (!finalLabelText) {
      return;
    }

    // 创建新标签
    const label = document.createElement('div');
    label.className = 'rf-status-label';
    label.textContent = finalLabelText;
    label.style.background = style.color;
    label.style.color = '#ffffff';

    // 将标签插入到元素旁边
    element.parentElement.style.position = 'relative';
    element.parentElement.appendChild(label);

    // 保存标签引用
    this.labelElements.set(element, label);
  }

  /**
   * 移除状态标签
   * @param {HTMLElement} element 目标元素
   */
  removeStatusLabel(element) {
    const existingLabel = this.labelElements.get(element);
    if (existingLabel && existingLabel.parentElement) {
      existingLabel.parentElement.removeChild(existingLabel);
    }
    this.labelElements.delete(element);
  }

  /**
   * 重置元素状态（清除高亮和标签）
   * @param {HTMLElement} element 目标元素
   * @param {boolean} removeFromStorage 是否从存储中移除
   */
  resetElement(element, removeFromStorage = true) {
    if (!element) return;

    // 恢复原始样式
    const originalStyle = this.elementStates.get(element);
    if (originalStyle) {
      element.style.border = originalStyle.border;
      element.style.background = originalStyle.background;
      element.style.boxShadow = originalStyle.boxShadow;
      element.style.position = originalStyle.position;
      this.elementStates.delete(element);
    }

    // 移除高亮类
    element.classList.remove('rf-highlighted');
    element.classList.remove('rf-filling');

    // 移除标签
    this.removeStatusLabel(element);

    // 从存储中移除
    if (removeFromStorage) {
      this.saveIdentifiedElements();
    }
  }

  /**
   * 批量标记元素为已识别状态
   * @param {Array} elements 元素数组
   */
  markIdentified(elements) {
    this.stats.total = elements.length;
    this.stats.identified = elements.length;

    elements.forEach((item, index) => {
      const element = item.element;
      if (element) {
        // 添加延迟，创建渐进式显示效果
        setTimeout(() => {
          this.setElementStatus(element, FieldStatus.IDENTIFIED);
        }, index * 30);
      }
    });

    this.updateStats(this.stats);
    this.showProgressPanel();

    // 批量保存（延迟执行，等待所有元素处理完成）
    setTimeout(() => {
      this.saveIdentifiedElements();
    }, elements.length * 30 + 100);

    console.log(`[VisualFeedback] 已标记 ${elements.length} 个元素为已识别`);
  }

  /**
   * 标记元素为填写中状态
   * @param {HTMLElement} element 目标元素
   */
  markFilling(element) {
    this.setElementStatus(element, FieldStatus.FILLING);

    // 滚动到元素位置
    this.scrollToElement(element);
  }

  /**
   * 标记元素为已完成状态
   * @param {HTMLElement} element 目标元素
   */
  markCompleted(element) {
    this.setElementStatus(element, FieldStatus.COMPLETED);
    this.stats.completed++;
    this.stats.identified--;
    this.updateStats(this.stats);
    // 填写完成后从存储中移除（不需要保存已完成状态）
    this.saveIdentifiedElements();
  }

  /**
   * 标记元素为失败状态
   * @param {HTMLElement} element 目标元素
   * @param {string} reason 失败原因
   */
  markFailed(element, reason = null) {
    this.setElementStatus(element, FieldStatus.FAILED, reason || '❌ 失败');
    this.stats.failed++;
    this.stats.identified--;
    this.updateStats(this.stats);
    // 失败后从存储中移除
    this.saveIdentifiedElements();
  }

  /**
   * 标记元素为跳过状态
   * @param {HTMLElement} element 目标元素
   * @param {string} reason 跳过原因
   */
  markSkipped(element, reason = null) {
    this.setElementStatus(element, FieldStatus.SKIPPED, reason || '⏭️ 跳过');
    this.stats.skipped++;
    this.stats.identified--;
    this.updateStats(this.stats);
    // 跳过后从存储中移除
    this.saveIdentifiedElements();
  }

  /**
   * 滚动到元素位置
   * @param {HTMLElement} element 目标元素
   */
  scrollToElement(element) {
    if (!element) return;

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  /**
   * 清除所有高亮和标签
   */
  clearAll() {
    // 重置所有已标记元素
    this.elementStates.forEach((_, element) => {
      this.resetElement(element, false);
    });

    // 清空状态
    this.elementStates.clear();
    this.labelElements.clear();
    this.stats = {
      total: 0,
      identified: 0,
      filling: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };

    // 清除当前页面的存储
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const allData = JSON.parse(stored);
        delete allData[this.currentUrl];
        localStorage.setItem(this.storageKey, JSON.stringify(allData));
      }
    } catch (e) {
      console.warn('[VisualFeedback] 清除存储失败:', e);
    }

    // 隐藏进度面板
    this.hideProgressPanel();

    console.log('[VisualFeedback] 已清除所有高亮');
  }

  /**
   * 销毁可视化反馈系统
   */
  destroy() {
    this.clearAll();

    // 移除进度面板
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    // 移除动画样式
    const animationStyles = document.getElementById('rf-animation-styles');
    if (animationStyles) {
      animationStyles.remove();
    }

    this.container = null;
    this.progressPanel = null;
    this.progressShadowRoot = null;
    this.animationInjected = false;

    console.log('[VisualFeedback] 已销毁');
  }

  /**
   * 获取当前统计数据
   * @returns {Object} 统计数据
   */
  getStats() {
    return { ...this.stats };
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.VisualFeedback = VisualFeedback;
  window.FieldStatus = FieldStatus;
}
