/**
 * 简历自动填写助手 - Content Script (合并版)
 * 包含：visual-feedback.js, cascading-select.js, index.js
 * 注入到网页中，负责表单识别和填写
 */

// ================== visual-feedback.js ==================
/**
 * 简历自动填写助手 - 可视化反馈模块
 * 提供表单元素状态高亮和进度面板功能
 */

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
  }

  /**
   * 初始化可视化反馈系统
   */
  init() {
    this.injectAnimationStyles();
    console.log('[VisualFeedback] 初始化完成');
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
        position: element.style.position
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

    // 处理动画
    if (style.animation) {
      element.classList.add('rf-filling');
    } else {
      element.classList.remove('rf-filling');
    }

    // 创建或更新状态标签
    this.createStatusLabel(element, style, labelText);

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
   */
  resetElement(element) {
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

    console.log(`[VisualFeedback] 已标记 ${elements.length} 个元素为已识别`);
  }

  /**
   * 标记元素为无映射值状态
   * @param {HTMLElement} element 目标元素
   */
  markNoMapping(element) {
    this.setElementStatus(element, FieldStatus.NO_MAPPING);
    this.stats.noMapping++;
    this.stats.identified--;
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
      this.resetElement(element);
    });

    // 清空状态
    this.elementStates.clear();
    this.labelElements.clear();
    this.stats = {
      total: 0,
      identified: 0,
      noMapping: 0,
      filling: 0,
      completed: 0,
      failed: 0,
      skipped: 0
    };

    console.log('[VisualFeedback] 已清除所有高亮');
  }

  /**
   * 销毁可视化反馈系统
   */
  destroy() {
    this.clearAll();

    // 移除动画样式
    const animationStyles = document.getElementById('rf-animation-styles');
    if (animationStyles) {
      animationStyles.remove();
    }

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


// ================== cascading-select.js ==================
/**
 * 简历自动填写助手 - 级联下拉框识别模块
 * 负责识别省/市/区、行业/职位等层级选择关系
 */

/**
 * 等待结果状态
 */
const WaitResult = {
  SUCCESS: 'SUCCESS',       // 成功加载
  TIMEOUT: 'TIMEOUT',       // 超时
  NO_CHANGE: 'NO_CHANGE',   // 无变化（可能不需要加载）
  ERROR: 'ERROR'            // 发生错误
};

/**
 * 失败原因代码
 * 用于记录选中检测失败的具体原因
 */
const FailureReasonCode = {
  OPTION_NOT_FOUND: 'OPTION_NOT_FOUND',   // 选项不存在
  VALUE_MISMATCH: 'VALUE_MISMATCH',       // 值不匹配
  TIMEOUT: 'TIMEOUT',                     // 等待超时
  NETWORK_ERROR: 'NETWORK_ERROR',         // 网络错误
  EMPTY_OPTIONS: 'EMPTY_OPTIONS',         // 选项列表为空
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND', // 元素未找到
  UNKNOWN: 'UNKNOWN'                      // 未知错误
};

/**
 * 失败原因的中文描述
 */
const FailureReasonMessages = {
  [FailureReasonCode.OPTION_NOT_FOUND]: '选项不存在',
  [FailureReasonCode.VALUE_MISMATCH]: '选中值与预期不符',
  [FailureReasonCode.TIMEOUT]: '等待选项加载超时',
  [FailureReasonCode.NETWORK_ERROR]: '网络错误',
  [FailureReasonCode.EMPTY_OPTIONS]: '下拉选项列表为空',
  [FailureReasonCode.ELEMENT_NOT_FOUND]: '目标元素未找到',
  [FailureReasonCode.UNKNOWN]: '未知错误'
};

/**
 * 级联模式定义
 * 定义常见的级联下拉框模式及其识别规则
 */
const CASCADE_PATTERNS = {
  // 省/市/区 三级级联
  REGION: {
    name: 'region',
    levels: [
      {
        level: 1,
        keywords: {
          name: ['province', 'prov', 'sheng', '省'],
          label: ['省', '省份', '省/市', '省/直辖市'],
          id: ['province', 'prov', 'sheng']
        }
      },
      {
        level: 2,
        keywords: {
          name: ['city', 'shi', '市', 'citys', 'cities'],
          label: ['市', '城市', '市/区', '地级市'],
          id: ['city', 'shi']
        }
      },
      {
        level: 3,
        keywords: {
          name: ['district', 'area', 'county', 'qu', 'xian', '区', '县'],
          label: ['区', '县', '区/县', '行政区', '县/区'],
          id: ['district', 'area', 'county', 'qu']
        }
      }
    ]
  },

  // 行业/职位 二级级联
  INDUSTRY_JOB: {
    name: 'industry_job',
    levels: [
      {
        level: 1,
        keywords: {
          name: ['industry', 'hangye', '行业', 'trade'],
          label: ['行业', '行业类别', '所属行业'],
          id: ['industry', 'hangye']
        }
      },
      {
        level: 2,
        keywords: {
          name: ['position', 'job', 'zhiwei', 'gangwei', '职位', '岗位'],
          label: ['职位', '岗位', '职位名称', '具体职位'],
          id: ['position', 'job', 'zhiwei']
        }
      }
    ]
  },

  // 学校/院系 二级级联
  SCHOOL_DEPARTMENT: {
    name: 'school_department',
    levels: [
      {
        level: 1,
        keywords: {
          name: ['school', 'university', 'xuexiao', 'daixue', '学校', '院校'],
          label: ['学校', '院校', '毕业院校', '学校名称'],
          id: ['school', 'university']
        }
      },
      {
        level: 2,
        keywords: {
          name: ['department', 'major', 'yuanxi', 'zhuanye', '院系', '专业'],
          label: ['院系', '专业', '系别', '所学专业'],
          id: ['department', 'major']
        }
      }
    ]
  },

  // 学历/专业 二级级联
  EDUCATION_MAJOR: {
    name: 'education_major',
    levels: [
      {
        level: 1,
        keywords: {
          name: ['education', 'degree', 'xueli', '学历', '学位'],
          label: ['学历', '最高学历', '学位'],
          id: ['education', 'degree']
        }
      },
      {
        level: 2,
        keywords: {
          name: ['major', 'zhuanye', '专业'],
          label: ['专业', '所学专业', '专业名称'],
          id: ['major']
        }
      }
    ]
  },

  // 工作年限/职位级别
  EXPERIENCE_LEVEL: {
    name: 'experience_level',
    levels: [
      {
        level: 1,
        keywords: {
          name: ['experience', 'nianxian', '年限', 'jingyan'],
          label: ['工作经验', '工作年限', '从业年限'],
          id: ['experience']
        }
      },
      {
        level: 2,
        keywords: {
          name: ['level', 'jibie', '级别', 'rank'],
          label: ['职位级别', '级别', '职级'],
          id: ['level', 'rank']
        }
      }
    ]
  },

  // 薪资范围
  SALARY_RANGE: {
    name: 'salary_range',
    levels: [
      {
        level: 1,
        keywords: {
          name: ['salary_min', 'salary_from', 'xinzi_min'],
          label: ['期望薪资(最低)', '薪资范围(起)', '最低薪资'],
          id: ['salary_min']
        }
      },
      {
        level: 2,
        keywords: {
          name: ['salary_max', 'salary_to', 'xinzi_max'],
          label: ['期望薪资(最高)', '薪资范围(止)', '最高薪资'],
          id: ['salary_max']
        }
      }
    ]
  }
};

/**
 * CascadingSelect 类
 * 负责识别和分析级联下拉框
 */
class CascadingSelect {
  constructor() {
    // 已识别的级联组
    this.cascadeGroups = [];
    // 元素到级联组的映射
    this.elementToGroup = new Map();
    // 组ID计数器
    this.groupIdCounter = 0;
  }

  /**
   * 检测页面中的级联下拉框
   * @param {Array} formElements - 表单元素列表（来自 identifyFormElements）
   * @returns {Array} 检测到的级联组列表
   */
  detect(formElements) {
    console.log('[CascadingSelect] 开始检测级联下拉框...');

    // 重置状态
    this.cascadeGroups = [];
    this.elementToGroup = new Map();
    this.groupIdCounter = 0;

    // 只处理 select 类型的元素
    const selectElements = formElements.filter(el => el.tagName === 'SELECT' && el.type === 'select');
    console.log(`[CascadingSelect] 发现 ${selectElements.length} 个下拉框元素`);

    // 遍历所有级联模式
    for (const [patternName, pattern] of Object.entries(CASCADE_PATTERNS)) {
      const groups = this.detectPattern(selectElements, pattern);
      this.cascadeGroups.push(...groups);
    }

    // 合并可能重叠的组
    this.mergeOverlappingGroups();

    // 输出检测结果
    console.log(`[CascadingSelect] 检测到 ${this.cascadeGroups.length} 个级联组`);
    this.cascadeGroups.forEach((group, idx) => {
      console.log(`[CascadingSelect] 级联组 ${idx + 1}:`, {
        类型: group.type,
        层级: group.levels.length,
        元素: group.levels.map(l => ({
          层级: l.level,
          标签: l.element.label,
          名称: l.element.name,
          当前值: l.currentValue
        }))
      });
    });

    return this.cascadeGroups;
  }

  /**
   * 检测特定模式的级联关系
   * @param {Array} selectElements - 下拉框元素列表
   * @param {Object} pattern - 级联模式定义
   * @returns {Array} 匹配的级联组列表
   */
  detectPattern(selectElements, pattern) {
    const groups = [];
    const matchedElements = new Set();

    // 为每个层级找到匹配的元素
    const levelMatches = pattern.levels.map(levelDef => {
      return selectElements.filter(el => {
        // 跳过已匹配的元素
        if (matchedElements.has(el)) return false;

        // 检查是否匹配
        const matchScore = this.calculateMatchScore(el, levelDef.keywords);

        return matchScore > 0;
      }).map(el => ({
        element: el,
        score: this.calculateMatchScore(el, levelDef.keywords)
      })).sort((a, b) => b.score - a.score); // 按匹配分数排序
    });

    // 尝试组装级联组
    // 从第一层级开始，寻找最佳匹配组合
    if (levelMatches[0].length === 0) {
      return groups;
    }

    // 对于每个第一层级的匹配，尝试构建完整级联组
    for (const firstLevelMatch of levelMatches[0]) {
      const group = this.tryBuildCascadeGroup(
        firstLevelMatch,
        levelMatches.slice(1),
        pattern,
        matchedElements
      );

      if (group) {
        groups.push(group);
        // 标记已使用的元素
        group.levels.forEach(l => matchedElements.add(l.element));
      }
    }

    return groups;
  }

  /**
   * 尝试构建级联组
   * @param {Object} firstLevelMatch - 第一层级的匹配
   * @param {Array} remainingLevels - 剩余层级的匹配列表
   * @param {Object} pattern - 级联模式定义
   * @param {Set} matchedElements - 已匹配元素集合
   * @returns {Object|null} 构建的级联组或null
   */
  tryBuildCascadeGroup(firstLevelMatch, remainingLevels, pattern, matchedElements) {
    const levels = [{
      level: pattern.levels[0].level,
      element: firstLevelMatch.element,
      currentValue: firstLevelMatch.element.value || '',
      options: firstLevelMatch.element.options || []
    }];

    let lastElement = firstLevelMatch.element;

    // 逐层查找匹配
    for (let i = 0; i < remainingLevels.length; i++) {
      const levelDef = pattern.levels[i + 1]; // +1 因为第一层级已处理
      const candidates = remainingLevels[i];

      // 在同一容器内查找相邻的下一层级元素
      const bestMatch = this.findBestNextLevelMatch(
        lastElement,
        candidates,
        levelDef,
        matchedElements
      );

      if (bestMatch) {
        levels.push({
          level: levelDef.level,
          element: bestMatch.element,
          currentValue: bestMatch.element.value || '',
          options: bestMatch.element.options || []
        });
        lastElement = bestMatch.element;
      } else {
        // 如果找不到完整级联，根据模式决定是否返回部分级联
        // 对于三级级联（如省市区），至少需要两级才算级联
        if (levels.length >= 2) {
          break; // 已有足够层级，返回部分级联组
        }
        return null; // 级联不完整，返回null
      }
    }

    // 至少需要两级才算级联
    if (levels.length < 2) {
      return null;
    }

    // 构建级联组
    const group = {
      groupId: `cascade_${this.groupIdCounter++}`,
      type: pattern.name,
      typeName: this.getTypeName(pattern.name),
      levels: levels,
      elements: levels.map(l => l.element) // 便捷访问
    };

    // 建立元素到组的映射
    levels.forEach(l => {
      this.elementToGroup.set(l.element, group);
    });

    return group;
  }

  /**
   * 查找最佳的下一层级匹配元素
   * @param {Object} lastElement - 上一层级元素
   * @param {Array} candidates - 候选元素列表
   * @param {Object} levelDef - 层级定义
   * @param {Set} matchedElements - 已匹配元素集合
   * @returns {Object|null} 最佳匹配或null
   */
  findBestNextLevelMatch(lastElement, candidates, levelDef, matchedElements) {
    if (!candidates || candidates.length === 0) return null;

    // 过滤掉已匹配的元素
    const availableCandidates = candidates.filter(c => !matchedElements.has(c.element));

    if (availableCandidates.length === 0) return null;

    // 策略1: 查找DOM相邻的元素
    const adjacentMatch = this.findAdjacentElement(lastElement, availableCandidates);
    if (adjacentMatch) {
      return adjacentMatch;
    }

    // 策略2: 查找同一容器内的元素
    const sameContainerMatch = this.findSameContainerElement(lastElement, availableCandidates);
    if (sameContainerMatch) {
      return sameContainerMatch;
    }

    // 策略3: 返回分数最高的匹配（已经按分数排序）
    return availableCandidates[0];
  }

  /**
   * 查找DOM相邻的元素
   * @param {Object} lastElement - 参考元素
   * @param {Array} candidates - 候选元素
   * @returns {Object|null} 相邻元素或null
   */
  findAdjacentElement(lastElement, candidates) {
    const lastDom = lastElement.element;
    if (!lastDom || !lastDom.parentElement) return null;

    // 检查同一父元素下的下一个兄弟元素
    let nextSibling = lastDom.nextElementSibling;
    while (nextSibling) {
      // 如果是select元素
      if (nextSibling.tagName === 'SELECT') {
        const match = candidates.find(c => c.element.element === nextSibling);
        if (match) return match;
      }
      // 检查是否包含select
      const childSelect = nextSibling.querySelector?.('select');
      if (childSelect) {
        const match = candidates.find(c => c.element.element === childSelect);
        if (match) return match;
      }
      nextSibling = nextSibling.nextElementSibling;
    }

    // 检查父元素的下一个兄弟
    const parentSibling = lastDom.parentElement?.nextElementSibling;
    if (parentSibling) {
      const childSelect = parentSibling.querySelector?.('select');
      if (childSelect) {
        const match = candidates.find(c => c.element.element === childSelect);
        if (match) return match;
      }
    }

    return null;
  }

  /**
   * 查找同一容器内的元素
   * @param {Object} lastElement - 参考元素
   * @param {Array} candidates - 候选元素
   * @returns {Object|null} 同容器元素或null
   */
  findSameContainerElement(lastElement, candidates) {
    const lastDom = lastElement.element;
    if (!lastDom) return null;

    // 查找共同的表单容器
    const container = lastDom.closest('form, .form, .form-group, .form-item, [class*="form"]');
    if (!container) return null;

    // 在同一容器内查找匹配的候选元素
    for (const candidate of candidates) {
      const candidateDom = candidate.element.element;
      if (candidateDom && candidateDom.closest('form, .form, .form-group, .form-item, [class*="form"]') === container) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * 计算元素与关键词的匹配分数
   * @param {Object} element - 表单元素
   * @param {Object} keywords - 关键词定义
   * @returns {number} 匹配分数
   */
  calculateMatchScore(element, keywords) {
    let score = 0;

    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const label = (element.label || '').toLowerCase();

    // 检查 name 属性
    if (keywords.name) {
      for (const kw of keywords.name) {
        const kwLower = kw.toLowerCase();
        if (name.includes(kwLower)) {
          score += 10;
          // 精确匹配加分
          if (name === kwLower) score += 5;
        }
      }
    }

    // 检查 id 属性
    if (keywords.id) {
      for (const kw of keywords.id) {
        const kwLower = kw.toLowerCase();
        if (id.includes(kwLower)) {
          score += 8;
          if (id === kwLower) score += 4;
        }
      }
    }

    // 检查 label
    if (keywords.label) {
      for (const kw of keywords.label) {
        const kwLower = kw.toLowerCase();
        if (label.includes(kwLower)) {
          score += 6;
          if (label === kwLower) score += 3;
        }
      }
    }

    return score;
  }

  /**
   * 合并重叠的级联组
   */
  mergeOverlappingGroups() {
    // 检查是否有元素被多个组使用
    const elementUsage = new Map();
    this.cascadeGroups.forEach(group => {
      group.levels.forEach(level => {
        const el = level.element;
        if (!elementUsage.has(el)) {
          elementUsage.set(el, []);
        }
        elementUsage.get(el).push(group);
      });
    });

    // 对于被多个组使用的元素，保留分数最高的组
    elementUsage.forEach((groups, element) => {
      if (groups.length > 1) {
        // 按组的层级数和匹配程度排序，保留最好的
        const bestGroup = groups.reduce((best, current) => {
          const currentScore = current.levels.reduce((sum, l) =>
            sum + this.calculateMatchScore(l.element,
              CASCADE_PATTERNS[current.type.toUpperCase()]?.levels.find(
                def => def.level === l.level
              )?.keywords || {}), 0);
          const bestScore = best.levels.reduce((sum, l) =>
            sum + this.calculateMatchScore(l.element,
              CASCADE_PATTERNS[best.type.toUpperCase()]?.levels.find(
                def => def.level === l.level
              )?.keywords || {}), 0);
          return currentScore > bestScore ? current : best;
        });

        // 移除其他组
        groups.forEach(g => {
          if (g !== bestGroup) {
            const idx = this.cascadeGroups.indexOf(g);
            if (idx > -1) {
              this.cascadeGroups.splice(idx, 1);
            }
          }
        });
      }
    });
  }

  /**
   * 获取类型的中文名称
   * @param {string} typeName - 类型名称
   * @returns {string} 中文名称
   */
  getTypeName(typeName) {
    const typeNames = {
      'region': '省/市/区',
      'industry_job': '行业/职位',
      'school_department': '学校/院系',
      'education_major': '学历/专业',
      'experience_level': '经验/级别',
      'salary_range': '薪资范围'
    };
    return typeNames[typeName] || typeName;
  }

  /**
   * 获取元素所属的级联组
   * @param {Object} element - 表单元素
   * @returns {Object|null} 所属级联组或null
   */
  getGroupForElement(element) {
    return this.elementToGroup.get(element) || null;
  }

  /**
   * 获取级联组的当前状态
   * @param {Object} group - 级联组
   * @returns {Object} 当前状态
   */
  getGroupState(group) {
    return {
      groupId: group.groupId,
      type: group.type,
      typeName: group.typeName,
      levels: group.levels.map(level => ({
        level: level.level,
        label: level.element.label,
        name: level.element.name,
        currentValue: level.currentValue,
        optionsCount: level.options?.length || 0
      }))
    };
  }

  // ================== 异步等待机制 ==================

  /**
   * 等待 select 元素选项加载完成
   * @param {HTMLSelectElement} selectElement - 目标 select 元素
   * @param {Object} options - 配置选项
   * @param {number} options.timeout - 超时时间（毫秒），默认 3000
   * @param {number} options.minOptions - 最少期望选项数，默认 2（至少有一个有效选项，加上默认空选项）
   * @param {number} options.pollInterval - 轮询间隔（毫秒），默认 50
   * @param {boolean} options.checkLoading - 是否检测 loading 状态，默认 true
   * @returns {Promise<Object>} 等待结果
   */
  async waitForOptions(selectElement, options = {}) {
    const {
      timeout = 3000,
      minOptions = 2,
      pollInterval = 50,
      checkLoading = true
    } = options;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const elementId = this.getElementId(selectElement);

      // 获取实际 DOM 元素
      const domElement = selectElement.element || selectElement;

      // 初始选项数量
      const initialOptionsCount = domElement.options?.length || 0;

      // 如果已经有足够选项，直接返回成功
      if (initialOptionsCount >= minOptions) {
        this.log(`元素已有足够选项 (${initialOptionsCount}个)，无需等待`, domElement);
        resolve({
          status: WaitResult.SUCCESS,
          optionsCount: initialOptionsCount,
          waitTime: 0,
          reason: '已有足够选项'
        });
        return;
      }

      this.log(`开始等待选项加载，当前选项: ${initialOptionsCount}个`, domElement);

      // 创建超时定时器
      const timeoutId = setTimeout(() => {
        this.cleanupWait(elementId);
        const currentCount = domElement.options?.length || 0;
        this.log(`等待超时，当前选项: ${currentCount}个`, domElement, 'error');
        resolve({
          status: WaitResult.TIMEOUT,
          optionsCount: currentCount,
          waitTime: timeout,
          reason: `等待超过 ${timeout}ms`
        });
      }, timeout);

      // 完成回调
      const onComplete = (status, reason, currentCount) => {
        clearTimeout(timeoutId);
        this.cleanupWait(elementId);
        const waitTime = Date.now() - startTime;
        this.log(`等待完成: ${status}, 选项数: ${currentCount}, 耗时: ${waitTime}ms`, domElement);
        resolve({
          status,
          optionsCount: currentCount,
          waitTime,
          reason
        });
      };

      // 存储等待状态
      this.waitingElements = this.waitingElements || new Map();
      this.observers = this.observers || new Map();

      this.waitingElements.set(elementId, {
        selectElement: domElement,
        timeoutId,
        onComplete,
        initialOptionsCount
      });

      // 策略1: MutationObserver 监听 DOM 变化
      this.setupMutationObserver(domElement, elementId, minOptions, onComplete);

      // 策略2: 轮询检测选项数量变化
      this.setupPolling(domElement, elementId, minOptions, pollInterval, timeout, onComplete);

      // 策略3: 检测 loading 状态
      if (checkLoading) {
        this.setupLoadingDetection(domElement, elementId, minOptions, onComplete);
      }
    });
  }

  /**
   * 设置 MutationObserver 监听
   */
  setupMutationObserver(selectElement, elementId, minOptions, onComplete) {
    // 检查是否支持 MutationObserver
    if (typeof MutationObserver === 'undefined') {
      this.log('MutationObserver 不可用', selectElement, 'warning');
      return;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 检查是否有新选项添加
          const addedNodes = Array.from(mutation.addedNodes);
          const hasOptionAdded = addedNodes.some(node =>
            node.tagName === 'OPTION' ||
            (node.querySelectorAll && node.querySelectorAll('option').length > 0)
          );

          if (hasOptionAdded) {
            const currentCount = selectElement.options?.length || 0;
            this.log(`MutationObserver 检测到选项变化，当前: ${currentCount}个`, selectElement);

            if (currentCount >= minOptions) {
              onComplete(WaitResult.SUCCESS, 'MutationObserver 检测到选项加载完成', currentCount);
              return;
            }
          }
        }
      }
    });

    observer.observe(selectElement, {
      childList: true,     // 监听子元素变化
      subtree: true,       // 监听所有后代元素
      attributes: false,
      characterData: false
    });

    this.observers.set(elementId, observer);
  }

  /**
   * 设置轮询检测
   */
  setupPolling(selectElement, elementId, minOptions, pollInterval, timeout, onComplete) {
    const startTime = Date.now();

    const poll = () => {
      // 检查是否还在等待
      if (!this.waitingElements.has(elementId)) {
        return;
      }

      const currentCount = selectElement.options?.length || 0;

      // 检查是否达到最小选项数
      if (currentCount >= minOptions) {
        onComplete(WaitResult.SUCCESS, '轮询检测到选项加载完成', currentCount);
        return;
      }

      // 检查是否超时
      if (Date.now() - startTime >= timeout) {
        return; // 超时由 timeoutId 处理
      }

      // 继续轮询
      setTimeout(poll, pollInterval);
    };

    poll();
  }

  /**
   * 设置 loading 状态检测
   */
  setupLoadingDetection(selectElement, elementId, minOptions, onComplete) {
    // 常见的 loading 相关类名
    const loadingClasses = ['loading', 'isLoading', 'is-loading', 'data-loading', 'loading-data'];
    // 常见的 loading 相关属性
    const loadingAttrs = ['loading', 'data-loading', 'aria-busy'];

    // 检查元素是否处于 loading 状态
    const checkLoading = () => {
      // 检查类名
      for (const cls of loadingClasses) {
        if (selectElement.classList && selectElement.classList.contains(cls)) {
          return true;
        }
      }

      // 检查属性
      for (const attr of loadingAttrs) {
        const value = selectElement.getAttribute(attr);
        if (value === 'true' || value === '1' || value === 'loading') {
          return true;
        }
      }

      // 检查父元素的 loading 状态
      const parent = selectElement.parentElement;
      if (parent) {
        for (const cls of loadingClasses) {
          if (parent.classList && parent.classList.contains(cls)) {
            return true;
          }
        }
        for (const attr of loadingAttrs) {
          const value = parent.getAttribute(attr);
          if (value === 'true' || value === '1' || value === 'loading') {
            return true;
          }
        }
      }

      return false;
    };

    // 如果当前正在 loading，监听 loading 状态消失
    if (checkLoading()) {
      this.log('检测到 loading 状态，等待 loading 消失...', selectElement);

      // 使用 MutationObserver 监听属性变化
      const loadingObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes') {
            if (!checkLoading()) {
              this.log('loading 状态已消失', selectElement);
              loadingObserver.disconnect();

              // loading 消失后检查选项数量
              const currentCount = selectElement.options?.length || 0;
              if (currentCount >= minOptions) {
                onComplete(WaitResult.SUCCESS, 'loading 状态消失，选项已加载', currentCount);
              }
            }
          }
        }
      });

      // 监听元素和父元素的属性变化
      loadingObserver.observe(selectElement, { attributes: true });
      if (selectElement.parentElement) {
        loadingObserver.observe(selectElement.parentElement, { attributes: true });
      }

      // 保存 observer
      this.observers.set(elementId + '_loading', loadingObserver);
    }
  }

  /**
   * 清理等待状态和监听器
   */
  cleanupWait(elementId) {
    // 清理等待状态
    if (this.waitingElements) {
      this.waitingElements.delete(elementId);
    }

    // 断开 MutationObserver
    if (this.observers) {
      const observer = this.observers.get(elementId);
      if (observer) {
        observer.disconnect();
        this.observers.delete(elementId);
      }

      // 断开 loading observer
      const loadingObserver = this.observers.get(elementId + '_loading');
      if (loadingObserver) {
        loadingObserver.disconnect();
        this.observers.delete(elementId + '_loading');
      }
    }
  }

  /**
   * 获取元素唯一标识
   */
  getElementId(element) {
    const domElement = element.element || element;
    return domElement.id || domElement.name || `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 日志输出
   */
  log(message, element, level = 'info') {
    const prefix = '[CascadingSelect]';
    const elementInfo = element ? `(${element.id || element.name || element.tagName})` : '';

    const logMethods = {
      info: console.log,
      warning: console.warn,
      error: console.error
    };

    const logMethod = logMethods[level] || console.log;
    logMethod(`${prefix}${elementInfo} ${message}`);
  }

  /**
   * 填写级联选择框并等待选项加载
   * @param {HTMLSelectElement} selectElement - 目标 select 元素
   * @param {string} value - 要选择的值
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 填写结果
   */
  async fillAndWait(selectElement, value, options = {}) {
    const {
      timeout = 3000,
      triggerChange = true,
      waitForChild = true,
      childElement = null  // 子级元素
    } = options;

    try {
      const domElement = selectElement.element || selectElement;

      // 1. 查找匹配的选项
      const targetOption = Array.from(domElement.options).find(opt =>
        opt.value === value ||
        opt.text === value ||
        opt.text.includes(value) ||
        value.includes(opt.text)
      );

      if (!targetOption) {
        this.log(`未找到匹配选项: ${value}`, domElement, 'warning');
        return {
          success: false,
          reason: '未找到匹配选项',
          matchedValue: null
        };
      }

      // 2. 设置选中值
      domElement.value = targetOption.value;

      // 3. 触发 change 事件（这通常会触发子级选项加载）
      if (triggerChange) {
        domElement.dispatchEvent(new Event('change', { bubbles: true }));
        // 某些框架可能需要 click 或 input 事件
        domElement.dispatchEvent(new Event('click', { bubbles: true }));
        domElement.dispatchEvent(new Event('input', { bubbles: true }));
      }

      this.log(`已选择: ${targetOption.text} (${targetOption.value})`, domElement);

      // 4. 等待子级选项加载
      if (waitForChild && childElement) {
        const childDom = childElement.element || childElement;
        const waitResult = await this.waitForOptions(childDom, { timeout });
        return {
          success: waitResult.status === WaitResult.SUCCESS,
          selectValue: targetOption.value,
          selectText: targetOption.text,
          childWaitResult: waitResult
        };
      }

      return {
        success: true,
        selectValue: targetOption.value,
        selectText: targetOption.text
      };

    } catch (error) {
      this.log(`填写失败: ${error.message}`, selectElement, 'error');
      return {
        success: false,
        reason: error.message,
        error: error
      };
    }
  }

  /**
   * 批量填写级联选择框
   * @param {Object} cascadeGroup - 级联组（来自 detect 方法）
   * @param {Array} values - 要填写的值数组
   * @param {Object} options - 配置选项
   * @param {VisualFeedback} visualFeedback - 可视化反馈实例（可选）
   * @returns {Promise<Object>} 填写结果
   */
  async fillCascadeGroup(cascadeGroup, values, options = {}, visualFeedback = null) {
    const {
      timeout = 3000,
      delayBetween = 100,  // 每次选择之间的延迟
      verifySelection = true  // 是否验证选中结果
    } = options;

    const results = [];
    const levels = cascadeGroup.levels;

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const value = values[i];

      if (!level || !value) {
        const reason = !level ? '层级不存在' : '值为空';
        results.push({
          level: level?.level || i,
          success: false,
          reason,
          reasonCode: FailureReasonCode.UNKNOWN
        });

        // 标记失败状态
        if (level && visualFeedback && typeof visualFeedback.markFailed === 'function') {
          visualFeedback.markFailed(level.element, `❌ ${reason}`);
        }
        continue;
      }

      const domElement = level.element.element || level.element;

      // 等待选项可用（除了第一个选择框）
      if (i > 0) {
        const waitResult = await this.waitForOptions(domElement, { timeout });
        if (waitResult.status !== WaitResult.SUCCESS) {
          const reason = `等待选项超时: ${waitResult.reason}`;
          results.push({
            level: level.level,
            success: false,
            reason,
            reasonCode: FailureReasonCode.TIMEOUT,
            waitResult
          });

          // 标记失败状态
          if (visualFeedback && typeof visualFeedback.markFailed === 'function') {
            visualFeedback.markFailed(level.element, `❌ ${FailureReasonMessages[FailureReasonCode.TIMEOUT]}`);
          }
          break; // 中断链式填写
        }
      }

      // 填写当前选择框
      const nextLevel = levels[i + 1];
      const fillResult = await this.fillAndWait(level.element, value, {
        timeout,
        triggerChange: true,
        waitForChild: !!nextLevel,
        childElement: nextLevel?.element
      });

      // 验证选中结果
      let verifyResult = { success: true };
      if (verifySelection && fillResult.success) {
        verifyResult = this.verifySelection(domElement, value, { fuzzyMatch: true });
      }

      const success = fillResult.success && verifyResult.success;
      const reasonCode = !fillResult.success
        ? (fillResult.reason?.includes('未找到') ? FailureReasonCode.OPTION_NOT_FOUND : FailureReasonCode.UNKNOWN)
        : (!verifyResult.success ? verifyResult.reasonCode : null);

      results.push({
        level: level.level,
        label: level.element.label,
        ...fillResult,
        success,
        reasonCode,
        verified: verifyResult.success
      });

      // 可视化反馈
      if (success) {
        if (visualFeedback && typeof visualFeedback.markCompleted === 'function') {
          visualFeedback.markCompleted(level.element);
        }
      } else {
        if (visualFeedback && typeof visualFeedback.markFailed === 'function') {
          const failMessage = fillResult.reason || verifyResult.reasonMessage || '填写失败';
          visualFeedback.markFailed(level.element, `❌ ${failMessage}`);
        }
        break; // 填写失败，中断链式填写
      }

      // 延迟，等待下一级选项加载
      if (i < levels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    const allSuccess = results.every(r => r.success);

    return {
      success: allSuccess,
      results,
      completedCount: results.filter(r => r.success).length,
      totalCount: levels.length,
      cascadeGroup
    };
  }

  /**
   * 填写地区级联选择框
   * @param {Object} cascadeGroup - 级联组
   * @param {string} address - 地址字符串
   * @param {Object} options - 配置选项
   * @param {VisualFeedback} visualFeedback - 可视化反馈实例（可选）
   * @returns {Promise<Object>} 填写结果
   */
  async fillRegionCascade(cascadeGroup, address, options = {}, visualFeedback = null) {
    const {
      timeout = 3000,
      delayBetween = 200,
      fuzzyMatch = true,  // 是否启用模糊匹配
      verifySelection = true  // 是否验证选中结果
    } = options;

    console.log(`[fillRegionCascade] 开始填写地区级联，地址: "${address}"`);

    // 解析地址
    const parsedAddress = parseAddress(address);
    const values = [];

    // 根据是否是直辖市决定填写方式
    if (parsedAddress.isMunicipality) {
      // 直辖市：省和市都是直辖市名，然后选区
      values.push(parsedAddress.province);  // 省/直辖市
      values.push(parsedAddress.city);       // 市（直辖市本身）
      if (parsedAddress.district) {
        values.push(parsedAddress.district); // 区
      }
    } else {
      // 非直辖市：省 -> 市 -> 区
      if (parsedAddress.province) values.push(parsedAddress.province);
      if (parsedAddress.city) values.push(parsedAddress.city);
      if (parsedAddress.district) values.push(parsedAddress.district);
    }

    console.log(`[fillRegionCascade] 解析后的值:`, values);

    // 获取级联组的层级
    const levels = cascadeGroup.levels;
    const results = [];

    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const targetValue = values[i];

      if (!targetValue) {
        console.log(`[fillRegionCascade] 第 ${i + 1} 级没有目标值，跳过`);
        results.push({
          level: level.level,
          success: false,
          reason: '没有目标值'
        });
        continue;
      }

      const domElement = level.element.element || level.element;

      // 等待选项可用（除了第一级）
      if (i > 0) {
        console.log(`[fillRegionCascade] 等待第 ${i + 1} 级选项加载...`);
        const waitResult = await this.waitForOptions(domElement, { timeout, minOptions: 2 });
        if (waitResult.status !== WaitResult.SUCCESS) {
          console.log(`[fillRegionCascade] 等待选项超时: ${waitResult.reason}`);
          results.push({
            level: level.level,
            success: false,
            reason: `等待选项超时: ${waitResult.reason}`,
            reasonCode: FailureReasonCode.TIMEOUT,
            waitResult
          });

          // 标记失败状态（可视化反馈）
          if (visualFeedback && typeof visualFeedback.markFailed === 'function') {
            visualFeedback.markFailed(level.element, `❌ ${FailureReasonMessages[FailureReasonCode.TIMEOUT]}`);
          }
          // 继续尝试填写，不中断
        }
      }

      // 查找匹配的选项
      let matchedOption = null;
      const options = Array.from(domElement.options || []);

      // 精确匹配
      matchedOption = options.find(opt =>
        opt.value === targetValue || opt.text === targetValue
      );

      // 如果没有精确匹配，尝试模糊匹配
      if (!matchedOption && fuzzyMatch) {
        // 策略1: 包含匹配
        matchedOption = options.find(opt =>
          opt.text.includes(targetValue) || targetValue.includes(opt.text)
        );

        // 策略2: 去掉"省"、"市"、"区"后匹配
        if (!matchedOption) {
          const cleanTarget = targetValue.replace(/省|市|区|县|自治区|特别行政区/g, '');
          matchedOption = options.find(opt => {
            const cleanOpt = (opt.text || '').replace(/省|市|区|县|自治区|特别行政区/g, '');
            return cleanOpt === cleanTarget || cleanOpt.includes(cleanTarget) || cleanTarget.includes(cleanOpt);
          });
        }

        // 策略3: 只匹配核心名称
        if (!matchedOption) {
          const coreTarget = targetValue.replace(/省|市|区|县|自治区|特别行政区/g, '');
          matchedOption = options.find(opt => {
            const coreOpt = (opt.text || '').replace(/省|市|区|县|自治区|特别行政区/g, '');
            // 模糊匹配：至少两个字符匹配
            if (coreTarget.length >= 2 && coreOpt.length >= 2) {
              return coreTarget.substring(0, 2) === coreOpt.substring(0, 2);
            }
            return false;
          });
        }
      }

      if (!matchedOption) {
        console.log(`[fillRegionCascade] 未找到匹配选项: "${targetValue}"`);
        console.log(`[fillRegionCascade] 可用选项:`, options.map(o => o.text));

        // 记录失败原因
        const failureReason = {
          code: FailureReasonCode.OPTION_NOT_FOUND,
          message: `${FailureReasonMessages[FailureReasonCode.OPTION_NOT_FOUND]}: "${targetValue}"`,
          availableOptions: options.map(o => o.text)
        };

        results.push({
          level: level.level,
          success: false,
          reason: failureReason.message,
          reasonCode: failureReason.code,
          availableOptions: failureReason.availableOptions
        });

        // 标记失败状态（可视化反馈）
        if (visualFeedback && typeof visualFeedback.markFailed === 'function') {
          visualFeedback.markFailed(level.element, `❌ ${failureReason.message}`);
        }

        break; // 级联中断
      }

      // 设置选中值
      console.log(`[fillRegionCascade] 选择第 ${i + 1} 级: "${matchedOption.text}" (${matchedOption.value})`);

      // 使用 triggerDataSync 设置值
      triggerDataSync(domElement, matchedOption.value);

      // 额外触发 change 事件
      domElement.dispatchEvent(new Event('change', { bubbles: true }));

      // 等待一小段时间让值稳定
      await new Promise(resolve => setTimeout(resolve, 50));

      // 验证选中结果
      let verifyResult = { success: true };
      if (verifySelection) {
        verifyResult = this.verifySelection(domElement, targetValue, { fuzzyMatch });
        console.log(`[fillRegionCascade] 验证结果:`, verifyResult);
      }

      if (!verifyResult.success) {
        // 验证失败
        results.push({
          level: level.level,
          success: false,
          reason: verifyResult.reasonMessage,
          reasonCode: verifyResult.reasonCode,
          expectedValue: targetValue,
          actualValue: verifyResult.actualValue,
          actualText: verifyResult.actualText
        });

        // 标记失败状态（可视化反馈）
        if (visualFeedback && typeof visualFeedback.markFailed === 'function') {
          visualFeedback.markFailed(level.element, `❌ ${verifyResult.reasonMessage}`);
        }

        break; // 级联中断
      }

      // 填写成功
      results.push({
        level: level.level,
        success: true,
        value: matchedOption.value,
        text: matchedOption.text,
        verified: verifyResult.success
      });

      // 标记成功状态（可视化反馈）
      if (visualFeedback && typeof visualFeedback.markCompleted === 'function') {
        visualFeedback.markCompleted(level.element);
      }

      // 延迟等待下一级加载
      if (i < levels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    const allSuccess = results.every(r => r.success);
    console.log(`[fillRegionCascade] 填写完成，成功: ${allSuccess}`);

    return {
      success: allSuccess,
      results,
      completedCount: results.filter(r => r.success).length,
      totalCount: levels.length,
      parsedAddress,
      cascadeGroup
    };
  }

  /**
   * 智能填写级联选择框
   * 根据级联组类型自动选择合适的填写策略
   * @param {Object} cascadeGroup - 级联组
   * @param {string} value - 要填写的值
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 填写结果
   */
  async smartFill(cascadeGroup, value, options = {}) {
    const type = cascadeGroup.type;

    console.log(`[smartFill] 智能填写级联，类型: ${type}, 值: "${value}"`);

    switch (type) {
      case 'region':
        return this.fillRegionCascade(cascadeGroup, value, options);

      case 'education_major':
        const education = parseEducation(value);
        const values = [education.education, education.major].filter(v => v);
        return this.fillCascadeGroup(cascadeGroup, values, options);

      case 'industry_job':
        const jobInfo = parseJobInfo(value);
        const jobValues = [jobInfo.industry, jobInfo.position].filter(v => v);
        return this.fillCascadeGroup(cascadeGroup, jobValues, options);

      default:
        // 默认使用值数组填写
        const arr = Array.isArray(value) ? value : [value];
        return this.fillCascadeGroup(cascadeGroup, arr, options);
    }
  }

  /**
   * 静态方法：智能填写级联
   */
  static async smartFill(cascadeGroup, value, options = {}) {
    const instance = new CascadingSelect();
    return instance.smartFill(cascadeGroup, value, options);
  }

  // ================== 选中检测机制 ==================

  /**
   * 验证 select 元素的选中值是否与预期一致
   * @param {HTMLSelectElement} selectElement - 目标 select 元素
   * @param {string} expectedValue - 期望的值
   * @param {Object} options - 配置选项
   * @returns {Object} 验证结果 { success, reasonCode, reasonMessage, actualValue, expectedValue }
   */
  verifySelection(selectElement, expectedValue, options = {}) {
    const {
      checkText = true,    // 是否检查选项文本
      checkValue = true,   // 是否检查选项值
      fuzzyMatch = false   // 是否模糊匹配
    } = options;

    // 获取实际 DOM 元素
    const domElement = selectElement.element || selectElement;

    // 检查元素是否存在
    if (!domElement) {
      return {
        success: false,
        reasonCode: FailureReasonCode.ELEMENT_NOT_FOUND,
        reasonMessage: FailureReasonMessages[FailureReasonCode.ELEMENT_NOT_FOUND],
        actualValue: null,
        expectedValue
      };
    }

    // 获取当前选中值
    const actualValue = domElement.value;
    const selectedIndex = domElement.selectedIndex;
    const selectedOption = selectedIndex >= 0 ? domElement.options[selectedIndex] : null;
    const actualText = selectedOption ? selectedOption.text : '';

    // 空值检查
    if (!actualValue && !actualText) {
      return {
        success: false,
        reasonCode: FailureReasonCode.EMPTY_OPTIONS,
        reasonMessage: FailureReasonMessages[FailureReasonCode.EMPTY_OPTIONS],
        actualValue: null,
        expectedValue,
        actualText: ''
      };
    }

    // 精确匹配检查
    if (checkValue && actualValue === expectedValue) {
      return {
        success: true,
        reasonCode: null,
        reasonMessage: '值精确匹配',
        actualValue,
        expectedValue,
        actualText
      };
    }

    // 文本精确匹配
    if (checkText && actualText === expectedValue) {
      return {
        success: true,
        reasonCode: null,
        reasonMessage: '文本精确匹配',
        actualValue,
        expectedValue,
        actualText
      };
    }

    // 模糊匹配
    if (fuzzyMatch) {
      // 文本包含匹配
      if (checkText && (actualText.includes(expectedValue) || expectedValue.includes(actualText))) {
        return {
          success: true,
          reasonCode: null,
          reasonMessage: '文本模糊匹配',
          actualValue,
          expectedValue,
          actualText,
          fuzzyMatched: true
        };
      }

      // 值包含匹配
      if (checkValue && (actualValue.includes(expectedValue) || expectedValue.includes(actualValue))) {
        return {
          success: true,
          reasonCode: null,
          reasonMessage: '值模糊匹配',
          actualValue,
          expectedValue,
          actualText,
          fuzzyMatched: true
        };
      }
    }

    // 匹配失败
    this.log(`选中值验证失败: 期望="${expectedValue}", 实际值="${actualValue}", 实际文本="${actualText}"`, domElement, 'warning');

    return {
      success: false,
      reasonCode: FailureReasonCode.VALUE_MISMATCH,
      reasonMessage: `${FailureReasonMessages[FailureReasonCode.VALUE_MISMATCH]}: 期望 "${expectedValue}", 实际为 "${actualText || actualValue}"`,
      actualValue,
      expectedValue,
      actualText
    };
  }

  /**
   * 带选中检测的填写方法
   * @param {HTMLSelectElement} selectElement - 目标 select 元素
   * @param {string} value - 要选择的值
   * @param {Object} options - 配置选项
   * @param {VisualFeedback} visualFeedback - 可视化反馈实例（可选）
   * @returns {Promise<Object>} 填写结果
   */
  async fillWithVerification(selectElement, value, options = {}, visualFeedback = null) {
    const {
      timeout = 3000,
      triggerChange = true,
      verifyAfterFill = true,
      fuzzyMatch = true,
      retryCount = 1,       // 重试次数
      retryDelay = 200      // 重试延迟
    } = options;

    const domElement = selectElement.element || selectElement;
    let lastError = null;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      if (attempt > 0) {
        this.log(`第 ${attempt} 次重试填写...`, domElement);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      // 1. 查找匹配的选项
      const targetOption = this.findMatchingOption(domElement, value, { fuzzyMatch });

      if (!targetOption) {
        lastError = {
          success: false,
          reasonCode: FailureReasonCode.OPTION_NOT_FOUND,
          reasonMessage: `${FailureReasonMessages[FailureReasonCode.OPTION_NOT_FOUND]}: "${value}"`,
          expectedValue: value,
          attempt
        };
        continue;
      }

      // 2. 设置选中值
      this.setSelectValue(domElement, targetOption.value);

      // 3. 触发 change 事件
      if (triggerChange) {
        this.triggerChangeEvent(domElement);
      }

      // 4. 等待一小段时间让值稳定
      await new Promise(resolve => setTimeout(resolve, 50));

      // 5. 验证选中结果
      if (verifyAfterFill) {
        const verifyResult = this.verifySelection(domElement, value, { fuzzyMatch });

        if (verifyResult.success) {
          this.log(`填写成功并验证通过: "${targetOption.text}" (${targetOption.value})`, domElement);

          // 调用可视化反馈
          if (visualFeedback && typeof visualFeedback.markCompleted === 'function') {
            visualFeedback.markCompleted(selectElement);
          }

          return {
            success: true,
            selectValue: targetOption.value,
            selectText: targetOption.text,
            verified: true,
            attempt
          };
        } else {
          lastError = {
            success: false,
            reasonCode: verifyResult.reasonCode,
            reasonMessage: verifyResult.reasonMessage,
            expectedValue: value,
            actualValue: verifyResult.actualValue,
            actualText: verifyResult.actualText,
            attempt
          };
        }
      } else {
        // 不验证，直接返回成功
        return {
          success: true,
          selectValue: targetOption.value,
          selectText: targetOption.text,
          verified: false,
          attempt
        };
      }
    }

    // 所有重试都失败
    this.log(`填写失败 (已重试 ${retryCount} 次): ${lastError?.reasonMessage}`, domElement, 'error');

    // 调用可视化反馈标记失败
    if (visualFeedback && typeof visualFeedback.markFailed === 'function') {
      visualFeedback.markFailed(selectElement, `❌ ${lastError?.reasonMessage || '填写失败'}`);
    }

    return {
      ...lastError,
      retryCount
    };
  }

  /**
   * 查找匹配的选项
   * @param {HTMLSelectElement} domElement - DOM 元素
   * @param {string} value - 目标值
   * @param {Object} options - 配置选项
   * @returns {HTMLOptionElement|null} 匹配的选项或 null
   */
  findMatchingOption(domElement, value, options = {}) {
    const { fuzzyMatch = true } = options;
    const optionsList = Array.from(domElement.options || []);

    if (optionsList.length === 0) {
      return null;
    }

    // 策略1: 精确匹配值
    let matched = optionsList.find(opt => opt.value === value);
    if (matched) return matched;

    // 策略2: 精确匹配文本
    matched = optionsList.find(opt => opt.text === value);
    if (matched) return matched;

    if (fuzzyMatch) {
      // 策略3: 文本包含匹配
      matched = optionsList.find(opt =>
        opt.text.includes(value) || value.includes(opt.text)
      );
      if (matched) return matched;

      // 策略4: 清理后匹配（去掉"省"、"市"、"区"等）
      const cleanValue = value.replace(/省|市|区|县|自治区|特别行政区/g, '');
      matched = optionsList.find(opt => {
        const cleanText = (opt.text || '').replace(/省|市|区|县|自治区|特别行政区/g, '');
        return cleanText === cleanValue || cleanText.includes(cleanValue) || cleanValue.includes(cleanText);
      });
      if (matched) return matched;

      // 策略5: 首字符匹配（针对简称）
      if (cleanValue.length >= 2) {
        matched = optionsList.find(opt => {
          const cleanText = (opt.text || '').replace(/省|市|区|县|自治区|特别行政区/g, '');
          return cleanText.length >= 2 && cleanText.substring(0, 2) === cleanValue.substring(0, 2);
        });
        if (matched) return matched;
      }
    }

    return null;
  }

  /**
   * 设置 select 元素的值
   * @param {HTMLSelectElement} domElement - DOM 元素
   * @param {string} value - 要设置的值
   */
  setSelectValue(domElement, value) {
    // 使用原生 setter 绕过框架保护
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(domElement, value);
    } else {
      domElement.value = value;
    }
  }

  /**
   * 触发 change 事件
   * @param {HTMLSelectElement} domElement - DOM 元素
   */
  triggerChangeEvent(domElement) {
    // 触发多种事件以确保兼容性
    const events = ['focus', 'input', 'change', 'blur'];
    events.forEach(eventType => {
      domElement.dispatchEvent(new Event(eventType, { bubbles: true }));
    });

    // React 特殊处理
    const inputEvent = document.createEvent('Event');
    inputEvent.initEvent('input', true, true);
    domElement.dispatchEvent(inputEvent);

    // Vue 特殊处理
    domElement.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText'
    }));
  }
}

// ================== Element UI 组件处理模块 ==================
/**
 * Element UI 组件识别和填写模块
 * 支持 el-input, el-select, el-cascader, el-date-editor, el-radio-group 等
 */

/**
 * Element UI 组件类型枚举
 */
const ElementUIType = {
  INPUT: 'el-input',           // 文本输入框
  SELECT: 'el-select',         // 下拉选择框
  CAScADER: 'el-cascader',     // 级联选择器
  CUSTOM_CASCADER: 'custom-cascader', // 自定义级联选择器（如智联招聘的 s-cascader）
  DATE: 'el-date-editor',      // 日期选择器
  RADIO: 'el-radio-group',     // 单选按钮组
  CHECKBOX: 'el-checkbox-group', // 复选框组
  SWITCH: 'el-switch',         // 开关
  INPUT_NUMBER: 'el-input-number', // 数字输入框
  RATE: 'el-rate',             // 评分
  SLIDER: 'el-slider',         // 滑块
  TIME: 'el-time-picker',      // 时间选择器
  DATETIME: 'el-datetime-picker' // 日期时间选择器
};

/**
 * 识别 Ant Design 组件
 * @param {HTMLElement} element - DOM 元素
 * @returns {Object|null} 组件信息 { type, wrapper, input, label }
 */
function identifyAntDesignComponent(element) {
  if (!element) return null;

  // 检测 ant-select
  const selectWrapper = element.closest ? element.closest('.ant-select') : null;
  if (selectWrapper && !selectWrapper.classList.contains('ant-select-disabled')) {
    return {
      type: 'ant-select',
      wrapper: selectWrapper,
      input: selectWrapper.querySelector('input, .ant-select-selector'),
      label: extractAntDesignLabel(selectWrapper)
    };
  }

  // 检测 ant-cascader
  const cascaderWrapper = element.closest ? element.closest('.ant-cascader') : null;
  if (cascaderWrapper && !cascaderWrapper.classList.contains('ant-cascader-disabled')) {
    return {
      type: 'ant-cascader',
      wrapper: cascaderWrapper,
      input: cascaderWrapper.querySelector('input, .ant-cascader-picker'),
      label: extractAntDesignLabel(cascaderWrapper)
    };
  }

  // 检测 ant-picker（日期选择器）
  const pickerWrapper = element.closest ? element.closest('.ant-picker') : null;
  if (pickerWrapper && !pickerWrapper.classList.contains('ant-picker-disabled') && !pickerWrapper.closest('.ant-cascader')) {
    const isRange = pickerWrapper.classList.contains('ant-picker-range');
    return {
      type: isRange ? 'ant-daterange' : 'ant-date',
      wrapper: pickerWrapper,
      input: pickerWrapper.querySelector('input'),
      label: extractAntDesignLabel(pickerWrapper)
    };
  }

  // 检测 ant-radio-group
  const radioGroup = element.closest ? element.closest('.ant-radio-group') : null;
  if (radioGroup) {
    return {
      type: 'ant-radio-group',
      wrapper: radioGroup,
      input: radioGroup.querySelectorAll('.ant-radio-wrapper'),
      label: extractAntDesignLabel(radioGroup)
    };
  }

  // 检测 ant-checkbox-group
  const checkboxGroup = element.closest ? element.closest('.ant-checkbox-group') : null;
  if (checkboxGroup) {
    return {
      type: 'ant-checkbox-group',
      wrapper: checkboxGroup,
      input: checkboxGroup.querySelectorAll('.ant-checkbox-wrapper'),
      label: extractAntDesignLabel(checkboxGroup)
    };
  }

  // 检测 ant-input（不在其他组件内的）
  const inputWrapper = element.closest ? element.closest('.ant-input-affix-wrapper, .ant-input') : null;
  if (inputWrapper && !inputWrapper.closest('.ant-select, .ant-cascader, .ant-picker')) {
    return {
      type: 'ant-input',
      wrapper: inputWrapper,
      input: inputWrapper.tagName === 'INPUT' ? inputWrapper : inputWrapper.querySelector('input'),
      label: extractAntDesignLabel(inputWrapper)
    };
  }

  return null;
}

/**
 * 提取 Ant Design 组件的标签
 * @param {HTMLElement} element - 组件元素
 * @returns {string} 标签文本
 */
function extractAntDesignLabel(element) {
  // 查找表单项容器
  const formItem = element.closest('.ant-form-item');
  if (formItem) {
    const labelEl = formItem.querySelector('.ant-form-item-label label');
    if (labelEl) {
      return labelEl.textContent.trim();
    }
  }

  // 查找 aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  // 查找 placeholder
  const input = element.querySelector('input');
  if (input && input.placeholder) {
    return input.placeholder;
  }

  return '';
}

/**
 * 识别 Element UI 组件
 * @param {HTMLElement} element - DOM 元素
 * @returns {Object|null} 组件信息 { type, wrapper, input, label }
 */
function identifyElementUIComponent(element) {
  if (!element) return null;

  // ================== 先检测 Ant Design 组件 ==================
  const antdResult = identifyAntDesignComponent(element);
  if (antdResult) {
    return antdResult;
  }

  // ================== 检测 Vant 组件 ==================
  const vantResult = identifyVantComponent(element);
  if (vantResult) {
    return vantResult;
  }

  // ================== 检测 iView 组件 ==================
  const iviewResult = identifyIViewComponent(element);
  if (iviewResult) {
    return iviewResult;
  }

  // ================== 优先检测自定义级联选择器 ==================
  // 智联招聘等网站使用的自定义级联组件
  // 特征：input.el-input__inner 触发，下拉面板使用 s-cascader__option / s-checkbutton__item
  const customCascaderInput = element.closest ? element.closest('.el-input') : null;
  if (customCascaderInput) {
    // 检查是否属于自定义级联选择器（不是 el-select、el-cascader、el-date-editor）
    const isNotStandardComponent = !customCascaderInput.closest('.el-select, .el-cascader, .el-date-editor, .el-input-number');
    const hasInputInner = customCascaderInput.querySelector('.el-input__inner');

    // 通过标签判断是否可能是级联选择器（省市区、籍贯、居住地等）
    const label = extractElementUILabel(customCascaderInput);
    const isCascaderLabel = label && ['省', '市', '区', '县', '地址', '居住地', '籍贯', '户口', '现居'].some(kw => label.includes(kw));

    if (isNotStandardComponent && hasInputInner && isCascaderLabel) {
      console.log(`[ElementUI] 检测到自定义级联选择器: ${label}`);
      return {
        type: ElementUIType.CUSTOM_CASCADER,
        wrapper: customCascaderInput,
        input: hasInputInner,
        label: label,
        isCustomCascader: true
      };
    }
  }

  // 向上查找 Element UI 组件容器
  const wrappers = [
    { selector: '.el-cascader', type: ElementUIType.CAScADER },
    { selector: '.el-select', type: ElementUIType.SELECT },
    { selector: '.el-date-editor', type: ElementUIType.DATE },
    { selector: '.el-input-number', type: ElementUIType.INPUT_NUMBER },
    { selector: '.el-rate', type: ElementUIType.RATE },
    { selector: '.el-slider', type: ElementUIType.SLIDER },
    { selector: '.el-time-picker', type: ElementUIType.TIME },
    { selector: '.el-datetime-picker', type: ElementUIType.DATETIME },
    { selector: '.el-switch', type: ElementUIType.SWITCH },
    { selector: '.el-input', type: ElementUIType.INPUT }
  ];

  for (const wrapper of wrappers) {
    const container = element.closest ? element.closest(wrapper.selector) : null;
    if (container) {
      // 检查是否是日期范围选择器
      if (wrapper.type === ElementUIType.DATE && container.classList.contains('el-date-editor--daterange')) {
        // 日期范围选择器，需要特殊处理
        return {
          type: 'el-daterange',
          wrapper: container,
          input: container.querySelectorAll('.el-range-input'),
          label: extractElementUILabel(container)
        };
      }

      // 检查是否是日期时间选择器
      if (wrapper.type === ElementUIType.DATE && container.classList.contains('el-date-editor--datetime')) {
        return {
          type: 'el-datetime',
          wrapper: container,
          input: container.querySelector('.el-input__inner'),
          label: extractElementUILabel(container)
        };
      }

      // 查找内部输入元素
      let input = null;
      if (wrapper.type === ElementUIType.SELECT) {
        input = container.querySelector('.el-input__inner');
      } else if (wrapper.type === ElementUIType.CAScADER) {
        input = container.querySelector('.el-input__inner');
      } else if (wrapper.type === ElementUIType.INPUT) {
        input = container.querySelector('.el-input__inner, textarea.el-textarea__inner');
      } else if (wrapper.type === ElementUIType.DATE) {
        input = container.querySelector('.el-input__inner');
      } else if (wrapper.type === ElementUIType.RATE) {
        input = container.querySelectorAll('.el-rate__item');
      } else if (wrapper.type === ElementUIType.SLIDER) {
        input = container.querySelector('.el-slider__runway');
      } else if (wrapper.type === ElementUIType.SWITCH) {
        input = container.querySelector('.el-switch__core');
      } else if (wrapper.type === ElementUIType.INPUT_NUMBER) {
        input = container.querySelector('.el-input__inner');
      } else {
        input = container.querySelector('input, textarea');
      }

      return {
        type: wrapper.type,
        wrapper: container,
        input: input,
        label: extractElementUILabel(container)
      };
    }
  }

  // 检查 radio-group 和 checkbox-group
  const radioGroup = element.closest ? element.closest('.el-radio-group') : null;
  if (radioGroup) {
    return {
      type: ElementUIType.RADIO,
      wrapper: radioGroup,
      input: radioGroup.querySelectorAll('.el-radio'),
      label: extractElementUILabel(radioGroup)
    };
  }

  const checkboxGroup = element.closest ? element.closest('.el-checkbox-group') : null;
  if (checkboxGroup) {
    return {
      type: ElementUIType.CHECKBOX,
      wrapper: checkboxGroup,
      input: checkboxGroup.querySelectorAll('.el-checkbox'),
      label: extractElementUILabel(checkboxGroup)
    };
  }

  return null;
}

/**
 * 提取 Element UI 组件的标签
 * @param {HTMLElement} element - 组件容器
 * @returns {string} 标签文本
 */
function extractElementUILabel(element) {
  // 查找表单项容器
  const formItem = element.closest ? element.closest('.el-form-item') : null;
  if (formItem) {
    const labelEl = formItem.querySelector('.el-form-item__label');
    if (labelEl) {
      return labelEl.textContent.trim().replace(/[：:*]/g, '');
    }
  }

  // 查找前置 label
  let prev = element.previousElementSibling;
  while (prev) {
    if (prev.tagName === 'LABEL') {
      return prev.textContent.trim().replace(/[：:*]/g, '');
    }
    if (['SPAN', 'DIV', 'P'].includes(prev.tagName)) {
      const text = prev.textContent.trim().replace(/[：:*]/g, '');
      if (text && text.length < 30) {
        return text;
      }
    }
    prev = prev.previousElementSibling;
  }

  return '';
}

/**
 * 获取 el-select 的选项列表
 * 点击展开下拉框，等待选项加载，获取选项文本列表
 * @param {HTMLElement} selectWrapper - el-select 容器元素
 * @param {Object} options - 配置选项
 * @returns {Promise<Array>} 选项列表 [{ value, text, disabled }]
 */
async function getElSelectOptions(selectWrapper, options = {}) {
  const { timeout = 3000, closeAfter = true } = options;
  const result = [];

  try {
    // 1. 点击打开下拉框
    const input = selectWrapper.querySelector('.el-input__inner');
    if (!input) {
      console.log('[ElementUI] 未找到 el-select 输入框');
      return result;
    }

    // 模拟点击打开
    input.click();
    input.focus();

    // 2. 等待下拉面板出现
    const dropdown = await waitForElementUI('.el-select-dropdown:not([style*="display: none"])', timeout);
    if (!dropdown) {
      console.log('[ElementUI] el-select 下拉面板未出现');
      return result;
    }

    // 3. 等待选项渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 4. 获取选项列表
    const optionElements = dropdown.querySelectorAll('.el-select-dropdown__item');
    optionElements.forEach(opt => {
      // 跳过分组标题
      if (opt.classList.contains('el-select-group__title')) return;

      result.push({
        value: opt.getAttribute('data-value') || opt.textContent.trim(),
        text: opt.textContent.trim(),
        disabled: opt.classList.contains('is-disabled'),
        element: opt
      });
    });

    console.log(`[ElementUI] el-select 获取到 ${result.length} 个选项`);

    // 5. 关闭下拉框（点击外部区域）
    if (closeAfter) {
      document.body.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

  } catch (error) {
    console.error('[ElementUI] 获取 el-select 选项失败:', error);
  }

  return result;
}

/**
 * 获取 el-cascader 的选项列表
 * 点击展开级联选择器，逐级获取选项
 * @param {HTMLElement} cascaderWrapper - el-cascader 容器元素
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 级联选项结构 { levels: [{ level, options }] }
 */
async function getElCascaderOptions(cascaderWrapper, options = {}) {
  const { timeout = 3000, maxLevels = 4, closeAfter = true } = options;
  const result = { levels: [], totalLevels: 0 };

  try {
    // 1. 点击打开级联选择器
    const input = cascaderWrapper.querySelector('.el-input__inner');
    if (!input) {
      console.log('[ElementUI] 未找到 el-cascader 输入框');
      return result;
    }

    input.click();
    input.focus();

    // 2. 等待下拉面板出现
    const dropdown = await waitForElementUI('.el-cascader__dropdown, .el-cascader-menus', timeout);
    if (!dropdown) {
      console.log('[ElementUI] el-cascader 下拉面板未出现');
      return result;
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    // 3. 逐级获取选项
    let currentLevel = 0;
    while (currentLevel < maxLevels) {
      const menus = dropdown.querySelectorAll('.el-cascader-menu');
      if (menus.length <= currentLevel) break;

      const menu = menus[currentLevel];
      const items = menu.querySelectorAll('.el-cascader-node');

      if (items.length === 0) break;

      const levelOptions = [];
      items.forEach(item => {
        const labelEl = item.querySelector('.el-cascader-node__label');
        levelOptions.push({
          value: item.getAttribute('data-value') || (labelEl ? labelEl.textContent.trim() : item.textContent.trim()),
          text: labelEl ? labelEl.textContent.trim() : item.textContent.trim(),
          hasChildren: item.classList.contains('el-cascader-node--has-children'),
          disabled: item.classList.contains('is-disabled'),
          element: item
        });
      });

      result.levels.push({
        level: currentLevel + 1,
        options: levelOptions
      });

      result.totalLevels = currentLevel + 1;

      // 如果第一个选项没有子级，说明是最后一级
      if (!levelOptions[0]?.hasChildren) break;

      // 点击第一个有子级的选项，展开下一级
      const expandableItem = Array.from(items).find(item =>
        item.classList.contains('el-cascader-node--has-children') &&
        !item.classList.contains('is-disabled')
      );

      if (!expandableItem) break;

      // 悬停展开下一级
      expandableItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 200));

      currentLevel++;
    }

    console.log(`[ElementUI] el-cascader 获取到 ${result.totalLevels} 级选项`);

    // 4. 关闭下拉框
    if (closeAfter) {
      document.body.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

  } catch (error) {
    console.error('[ElementUI] 获取 el-cascader 选项失败:', error);
  }

  return result;
}

/**
 * 等待 Element UI 元素出现
 * @param {string} selector - CSS 选择器
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<HTMLElement|null>}
 */
async function waitForElementUI(selector, timeout = 3000) {
  return new Promise((resolve) => {
    // 先检查是否已存在
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * 填写 el-input 文本框
 * @param {HTMLElement} inputWrapper - el-input 容器
 * @param {string} value - 要填写的值
 * @returns {Object} 填写结果
 */
function fillElInput(inputWrapper, value) {
  try {
    const input = inputWrapper.querySelector('.el-input__inner, textarea.el-textarea__inner');
    if (!input) {
      return { success: false, reason: '未找到输入框' };
    }

    // 使用 triggerDataSync 设置值
    triggerDataSync(input, value);

    console.log(`[ElementUI] ✅ el-input 填写成功: "${value}"`);
    return { success: true, value };
  } catch (error) {
    console.error('[ElementUI] el-input 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-select 下拉框
 * @param {HTMLElement} selectWrapper - el-select 容器
 * @param {string} value - 要选择的值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillElSelect(selectWrapper, value, options = {}) {
  const { timeout = 5000, fuzzyMatch = true } = options;

  console.log(`[ElementUI] 开始填写 el-select, 值: "${value}"`);

  try {
    // 0. 先关闭所有已打开的下拉面板，避免干扰
    const existingDropdowns = document.querySelectorAll('.el-select-dropdown');
    existingDropdowns.forEach(d => {
      if (d.offsetParent !== null) {
        // 点击外部关闭
        document.body.click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    // 1. 点击打开下拉框
    const input = selectWrapper.querySelector('.el-input__inner');
    if (!input) {
      console.log('[ElementUI] 未找到 .el-input__inner');
      return { success: false, reason: '未找到输入框' };
    }

    // 记录点击前的下拉面板数量
    const dropdownsBefore = document.querySelectorAll('.el-select-dropdown.el-popper').length;

    console.log('[ElementUI] 点击打开下拉框...');
    input.click();

    // 触发各种事件确保下拉框打开
    input.focus();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // 2. 等待新的下拉面板出现
    let dropdown = null;
    const startTime = Date.now();

    while (!dropdown && Date.now() - startTime < timeout) {
      const allDropdowns = document.querySelectorAll('.el-select-dropdown.el-popper');

      for (const d of allDropdowns) {
        // 检查面板是否可见
        if (d.offsetParent !== null) {
          // 检查是否是新打开的面板（通过位置判断）
          const rect = d.getBoundingClientRect();
          const inputRect = input.getBoundingClientRect();

          // 下拉面板应该在输入框下方附近
          if (rect.top >= inputRect.bottom - 50 && rect.top <= inputRect.bottom + 200) {
            dropdown = d;
            break;
          }
        }
      }

      if (!dropdown) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!dropdown) {
      // 最后尝试：找任意可见的下拉面板
      const allDropdowns = document.querySelectorAll('.el-select-dropdown');
      for (const d of allDropdowns) {
        if (d.offsetParent !== null) {
          dropdown = d;
          console.log('[ElementUI] 使用备用方案找到下拉面板');
          break;
        }
      }
    }

    if (!dropdown) {
      console.log('[ElementUI] 无法找到下拉面板');
      document.body.click();
      return { success: false, reason: '下拉面板未出现' };
    }

    console.log(`[ElementUI] 找到下拉面板: ${dropdown.className}`);
    await new Promise(resolve => setTimeout(resolve, 300)); // 等待选项加载

    // 3. 查找匹配的选项
    let optionElements = dropdown.querySelectorAll('.el-select-dropdown__item');

    // 如果没有选项，可能需要等待加载
    if (optionElements.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      optionElements = dropdown.querySelectorAll('.el-select-dropdown__item');
    }

    // 尝试其他选择器
    if (optionElements.length === 0) {
      optionElements = dropdown.querySelectorAll('[role="option"], li[class*="option"]');
    }

    console.log(`[ElementUI] 找到 ${optionElements.length} 个选项`);

    if (optionElements.length === 0) {
      console.log('[ElementUI] 没有找到任何选项');
      document.body.click();
      return { success: false, reason: '没有选项' };
    }

    // 打印所有选项用于调试
    const optionTexts = Array.from(optionElements).map(o => o.textContent.trim());
    console.log(`[ElementUI] 可用选项: ${optionTexts.join(', ')}`);

    let matchedOption = null;

    // 精确匹配
    for (const opt of optionElements) {
      if (opt.classList.contains('el-select-group__title')) continue;
      const text = opt.textContent.trim();
      if (text === value) {
        matchedOption = opt;
        console.log(`[ElementUI] 精确匹配: "${text}"`);
        break;
      }
    }

    // 模糊匹配（包含关系）
    if (!matchedOption && fuzzyMatch) {
      for (const opt of optionElements) {
        if (opt.classList.contains('el-select-group__title')) continue;
        const text = opt.textContent.trim();
        // 双向包含匹配
        if (text.includes(value) || value.includes(text)) {
          matchedOption = opt;
          console.log(`[ElementUI] 模糊匹配: "${text}"`);
          break;
        }
      }
    }

    // 更宽松的模糊匹配（去除空格和特殊字符后比较）
    if (!matchedOption && fuzzyMatch) {
      const normalizedValue = value.replace(/[\s\-_]/g, '').toLowerCase();
      for (const opt of optionElements) {
        if (opt.classList.contains('el-select-group__title')) continue;
        const text = opt.textContent.trim();
        const normalizedText = text.replace(/[\s\-_]/g, '').toLowerCase();
        if (normalizedText.includes(normalizedValue) || normalizedValue.includes(normalizedText)) {
          matchedOption = opt;
          console.log(`[ElementUI] 宽松匹配: "${text}"`);
          break;
        }
      }
    }

    if (!matchedOption) {
      console.log(`[ElementUI] ❌ el-select 未找到匹配选项: "${value}"`);
      document.body.click();
      return { success: false, reason: '未找到匹配选项', availableOptions: optionTexts };
    }

    // 4. 点击选项 - 使用多种方式确保点击成功
    console.log(`[ElementUI] 准备点击选项: "${matchedOption.textContent.trim()}"`);

    // 滚动到选项可见
    matchedOption.scrollIntoView({ block: 'nearest' });
    await new Promise(resolve => setTimeout(resolve, 100));

    // 方式1: 直接点击
    matchedOption.click();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 方式2: 触发鼠标事件
    matchedOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    matchedOption.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    matchedOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // 方式3: 如果有mouseenter效果
    matchedOption.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    await new Promise(resolve => setTimeout(resolve, 200));

    // 检查下拉面板是否已关闭
    const dropdownClosed = !dropdown || dropdown.offsetParent === null;

    if (dropdownClosed) {
      console.log(`[ElementUI] ✅ el-select 选择成功，下拉面板已关闭`);
    } else {
      // 如果下拉面板还开着，点击选项再试一次
      console.log('[ElementUI] 下拉面板未关闭，再次点击选项...');
      matchedOption.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { success: true, value: matchedOption.textContent.trim() };

  } catch (error) {
    console.error('[ElementUI] el-select 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-cascader 级联选择器
 * @param {HTMLElement} cascaderWrapper - el-cascader 容器
 * @param {string} value - 要填写的值（如地址）
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillElCascader(cascaderWrapper, value, options = {}) {
  const { timeout = 3000, delayBetween = 200, fuzzyMatch = true } = options;

  try {
    // 1. 解析值
    const parsed = parseAddress(value);
    const values = [parsed.province, parsed.city, parsed.district].filter(v => v);
    console.log(`[ElementUI] el-cascader 解析值: "${value}" =>`, values);

    if (values.length === 0) {
      return { success: false, reason: '无法解析值' };
    }

    // 2. 点击打开级联选择器
    const input = cascaderWrapper.querySelector('.el-input__inner');
    if (!input) {
      return { success: false, reason: '未找到输入框' };
    }

    input.click();
    input.focus();

    // 3. 等待下拉面板出现
    const dropdown = await waitForElementUI('.el-cascader__dropdown, .el-cascader-menus', timeout);
    if (!dropdown) {
      return { success: false, reason: '级联面板未出现' };
    }

    await new Promise(resolve => setTimeout(resolve, 150));

    // 4. 逐级选择
    const selectedValues = [];
    for (let i = 0; i < values.length; i++) {
      const targetValue = values[i];

      // 等待当前级别菜单出现
      await new Promise(resolve => setTimeout(resolve, delayBetween));

      const menus = dropdown.querySelectorAll('.el-cascader-menu');
      if (menus.length <= i) {
        console.log(`[ElementUI] ⚠️ el-cascader 第 ${i + 1} 级菜单未找到`);
        break;
      }

      const menu = menus[i];
      const items = menu.querySelectorAll('.el-cascader-node');

      // 查找匹配项
      let matchedItem = null;
      const cleanTarget = targetValue.replace(/省|市|区|县|自治区|特别行政区/g, '');

      for (const item of items) {
        const labelEl = item.querySelector('.el-cascader-node__label');
        const text = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
        const cleanText = text.replace(/省|市|区|县|自治区|特别行政区/g, '');

        // 精确匹配
        if (text === targetValue || cleanText === cleanTarget) {
          matchedItem = item;
          break;
        }

        // 模糊匹配
        if (fuzzyMatch && (text.includes(cleanTarget) || cleanTarget.includes(cleanText))) {
          matchedItem = item;
          break;
        }
      }

      if (!matchedItem) {
        console.log(`[ElementUI] ❌ el-cascader 第 ${i + 1} 级未找到匹配项: "${targetValue}"`);
        console.log(`[ElementUI] 可用选项:`, Array.from(items).map(item => {
          const labelEl = item.querySelector('.el-cascader-node__label');
          return labelEl ? labelEl.textContent.trim() : item.textContent.trim();
        }));
        break;
      }

      // 点击选项
      const isLastLevel = i === values.length - 1;

      if (isLastLevel) {
        // 最后一级：直接点击
        matchedItem.click();
      } else {
        // 非最后一级：悬停展开下一级
        matchedItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }

      const labelEl = matchedItem.querySelector('.el-cascader-node__label');
      selectedValues.push(labelEl ? labelEl.textContent.trim() : matchedItem.textContent.trim());
      console.log(`[ElementUI] ✅ el-cascader 第 ${i + 1} 级选择: "${selectedValues[selectedValues.length - 1]}"`);
    }

    // 5. 等待面板关闭
    await new Promise(resolve => setTimeout(resolve, 150));

    return {
      success: selectedValues.length === values.length,
      selectedValues,
      expectedValues: values
    };

  } catch (error) {
    console.error('[ElementUI] el-cascader 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写自定义级联选择器（如智联招聘的 s-cascader）
 * 支持智联招聘等网站的自定义级联组件
 *
 * @param {HTMLElement} inputWrapper - el-input 容器
 * @param {string} value - 地址值（如 "广东省深圳市南山区"）
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillCustomCascader(inputWrapper, value, options = {}) {
  const { timeout = 5000, delayBetween = 300 } = options;

  try {
    // 1. 解析地址值
    const parsed = parseAddress(value);
    const values = [parsed.province, parsed.city, parsed.district].filter(v => v);
    console.log(`[CustomCascader] 解析值: "${value}" =>`, values);

    if (values.length === 0) {
      return { success: false, reason: '无法解析地址值' };
    }

    // 2. 找到输入框
    const input = inputWrapper.querySelector('.el-input__inner');
    if (!input) {
      return { success: false, reason: '未找到输入框' };
    }

    // 3. 点击打开下拉面板
    console.log('[CustomCascader] 点击打开下拉面板...');
    input.click();
    input.focus();

    // 4. 等待下拉面板出现（多种选择器）
    const dropdownSelectors = [
      '.s-cascader__panel',
      '.s-cascader__dropdown',
      '.el-cascader__dropdown',
      '.el-cascader-menus',
      '.el-popper',
      '.el-select-dropdown'
    ];

    let dropdown = null;
    for (const selector of dropdownSelectors) {
      dropdown = await waitForElementUI(selector, 1500);
      if (dropdown) {
        console.log(`[CustomCascader] 找到下拉面板: ${selector}`);
        break;
      }
    }

    if (!dropdown) {
      console.log('[CustomCascader] 未找到下拉面板，尝试直接在 body 中查找');
      // 尝试在 body 中直接查找可能的下拉面板
      dropdown = document.querySelector('.s-cascader__panel, .s-cascader__dropdown');
    }

    if (!dropdown) {
      return { success: false, reason: '级联面板未出现' };
    }

    await new Promise(resolve => setTimeout(resolve, 200));

    // 5. 逐级选择
    const selectedValues = [];

    for (let i = 0; i < values.length; i++) {
      const targetValue = values[i];
      const cleanTarget = targetValue.replace(/省|市|区|县|自治区|特别行政区/g, '');

      console.log(`[CustomCascader] 第 ${i + 1} 级，目标: "${targetValue}"`);

      await new Promise(resolve => setTimeout(resolve, delayBetween));

      // 查找当前级别的选项
      // 智联招聘使用 s-cascader__option（省份/城市）和 s-checkbutton__item（区县）
      let optionSelectors = ['.s-cascader__option', '.s-checkbutton__item'];

      // 如果是第三级（区县），优先使用 s-checkbutton__item
      if (i === 2) {
        optionSelectors = ['.s-checkbutton__item', '.s-cascader__option'];
      }

      let matchedItem = null;

      for (const selector of optionSelectors) {
        const items = dropdown.querySelectorAll(selector);
        if (items.length === 0) continue;

        console.log(`[CustomCascader] 使用选择器 ${selector}，找到 ${items.length} 个选项`);

        for (const item of items) {
          const text = item.textContent.trim();
          const cleanText = text.replace(/省|市|区|县|自治区|特别行政区/g, '');

          // 精确匹配
          if (text === targetValue || cleanText === cleanTarget) {
            matchedItem = item;
            break;
          }

          // 模糊匹配
          if (text.includes(cleanTarget) || cleanTarget.includes(cleanText)) {
            matchedItem = item;
            break;
          }
        }

        if (matchedItem) break;
      }

      // 如果还没找到，尝试 el-cascader-node（标准 Element UI）
      if (!matchedItem) {
        const items = dropdown.querySelectorAll('.el-cascader-node');
        for (const item of items) {
          const labelEl = item.querySelector('.el-cascader-node__label');
          const text = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
          const cleanText = text.replace(/省|市|区|县|自治区|特别行政区/g, '');

          if (text === targetValue || cleanText === cleanTarget ||
              text.includes(cleanTarget) || cleanTarget.includes(cleanText)) {
            matchedItem = item;
            break;
          }
        }
      }

      if (!matchedItem) {
        console.log(`[CustomCascader] ❌ 第 ${i + 1} 级未找到匹配项: "${targetValue}"`);

        // 打印所有可用选项帮助调试
        const allOptions = dropdown.querySelectorAll('.s-cascader__option, .s-checkbutton__item, .el-cascader-node');
        console.log('[CustomCascader] 可用选项:', Array.from(allOptions).slice(0, 10).map(el => el.textContent.trim()));

        break;
      }

      // 点击选项
      console.log(`[CustomCascader] ✅ 点击选项: "${matchedItem.textContent.trim()}"`);
      matchedItem.click();

      selectedValues.push(matchedItem.textContent.trim());

      // 等待下一级菜单展开
      await new Promise(resolve => setTimeout(resolve, delayBetween));
    }

    // 6. 等待面板关闭
    await new Promise(resolve => setTimeout(resolve, 200));

    const success = selectedValues.length === values.length;
    console.log(`[CustomCascader] 填写${success ? '成功' : '部分成功'}:`, selectedValues);

    return {
      success,
      selectedValues,
      expectedValues: values
    };

  } catch (error) {
    console.error('[CustomCascader] 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

// ================== Ant Design 组件填写函数 ==================

/**
 * 填写 ant-select 下拉框
 * @param {HTMLElement} selectWrapper - ant-select 容器
 * @param {string} value - 要选择的值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillAntSelect(selectWrapper, value, options = {}) {
  const { timeout = 5000, fuzzyMatch = true, retryCount = 3 } = options;

  try {
    console.log(`[AntDesign] ant-select 开始填写: "${value}"`);
    console.log(`[AntDesign] selectWrapper 类名: ${selectWrapper.className}`);
    console.log(`[AntDesign] selectWrapper HTML 预览: ${selectWrapper.outerHTML.substring(0, 200)}`);

    // 0. 检查是否禁用或只读
    if (selectWrapper.classList.contains('ant-select-disabled')) {
      console.log('[AntDesign] 下拉框已禁用，跳过填写');
      return { success: false, reason: '下拉框已禁用' };
    }

    // 1. 获取选择器元素
    const selector = selectWrapper.querySelector('.ant-select-selector');
    if (!selector) {
      console.log('[AntDesign] 未找到 .ant-select-selector');
      return { success: false, reason: '未找到选择器' };
    }

    // 获取下拉框的唯一标识（用于查找对应的下拉面板）
    const selectId = selectWrapper.id || selectWrapper.getAttribute('data-testid') ||
                     selectWrapper.querySelector('input')?.id || '';
    console.log(`[AntDesign] selectWrapper id/data-testid: ${selectId}`);

    // 获取内部 input 元素（用于某些版本的事件触发）
    const internalInput = selectWrapper.querySelector('input.ant-select-selection-search-input');
    console.log(`[AntDesign] internalInput 存在: ${!!internalInput}`);

    // 2. 关闭其他已打开的下拉框
    const existingDropdowns = document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    if (existingDropdowns.length > 0) {
      console.log(`[AntDesign] 发现已打开的下拉框 ${existingDropdowns.length} 个，正在关闭...`);
      // 点击页面其他地方关闭
      document.body.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 3. 模拟真实的点击事件序列（增强版 - 包含指针事件）
    const simulateClick = (element) => {
      // 获取元素位置用于事件坐标
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      console.log(`[AntDesign] simulateClick 坐标: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);

      // 先触发 focus
      element.focus();
      element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      // pointerdown（现代浏览器支持）
      const pointerdownEvent = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        clientX: centerX,
        clientY: centerY,
        isPrimary: true
      });
      element.dispatchEvent(pointerdownEvent);

      // mousedown - 包含坐标信息
      const mousedownEvent = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        clientX: centerX,
        clientY: centerY
      });
      element.dispatchEvent(mousedownEvent);

      // pointerup
      const pointerupEvent = new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        clientX: centerX,
        clientY: centerY,
        isPrimary: true
      });
      element.dispatchEvent(pointerupEvent);

      // mouseup - 包含坐标信息
      const mouseupEvent = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        clientX: centerX,
        clientY: centerY
      });
      element.dispatchEvent(mouseupEvent);

      // click
      element.click();
    };

    // 4. 多次尝试打开下拉面板
    let dropdown = null;
    let lastAttemptError = '';

    for (let attempt = 1; attempt <= retryCount && !dropdown; attempt++) {
      console.log(`[AntDesign] 尝试打开下拉面板 (${attempt}/${retryCount})...`);

      // 尝试不同的点击方式
      if (attempt === 1) {
        // 第一次：在 selector 上点击
        simulateClick(selector);
      } else if (attempt === 2 && internalInput) {
        // 第二次：尝试在内部 input 上触发（某些版本需要）
        internalInput.focus();
        internalInput.click();
        // 同时触发 selector 的事件
        simulateClick(selector);
      } else {
        // 第三次及以后：尝试更完整的事件序列
        simulateClick(selector);
        // 额外触发 keydown 事件（某些组件监听键盘事件）
        const keydownEvent = new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          code: 'Enter'
        });
        selector.dispatchEvent(keydownEvent);
      }

      // 等待面板出现（逐步增加等待时间）
      const waitTime = 300 + attempt * 200;
      console.log(`[AntDesign] 等待 ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // 检查 selectWrapper 是否处于打开状态
      const isOpen = selectWrapper.classList.contains('ant-select-focused') ||
                     selectWrapper.classList.contains('ant-select-open');
      console.log(`[AntDesign] selectWrapper 打开状态: ${isOpen}`);

      // 查找下拉面板 - 多种方式
      dropdown = findVisibleDropdown(selectWrapper);

      if (!dropdown) {
        console.log(`[AntDesign] 第 ${attempt} 次尝试未找到面板，等待后重试`);
        // 等待更长时间再重试
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 5. 最后一次尝试：使用 MutationObserver 等待
    if (!dropdown) {
      console.log('[AntDesign] 使用 MutationObserver 等待下拉面板...');
      dropdown = await waitForElementUI('.ant-select-dropdown', timeout);

      if (dropdown) {
        // 验证可见性
        const style = window.getComputedStyle(dropdown);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          dropdown = null;
          lastAttemptError = '下拉面板存在但不可见';
        } else if (dropdown.classList.contains('ant-select-dropdown-hidden')) {
          dropdown = null;
          lastAttemptError = '下拉面板有 hidden 类';
        }
      }
    }

    if (!dropdown) {
      console.log('[AntDesign] 所有尝试都未能打开下拉面板');
      // 记录调试信息
      const allDropdownsDebug = document.querySelectorAll('.ant-select-dropdown');
      console.log(`[AntDesign] 调试: 页面上共有 ${allDropdownsDebug.length} 个 .ant-select-dropdown`);
      allDropdownsDebug.forEach((d, i) => {
        const style = window.getComputedStyle(d);
        console.log(`[AntDesign] 调试 [${i}]: display=${style.display}, visibility=${style.visibility}, opacity=${style.opacity}, hidden=${d.classList.contains('ant-select-dropdown-hidden')}`);
      });

      // 额外检查：selectWrapper 当前状态
      console.log(`[AntDesign] selectWrapper 当前类名: ${selectWrapper.className}`);
      const ariaExpanded = selectWrapper.getAttribute('aria-expanded');
      console.log(`[AntDesign] aria-expanded: ${ariaExpanded}`);

      return { success: false, reason: `下拉面板未出现: ${lastAttemptError || '未知原因'}` };
    }

    console.log('[AntDesign] 找到下拉面板，等待选项加载...');
    console.log(`[AntDesign] 下拉面板类名: ${dropdown.className}`);

    // 6. 等待选项加载（处理动态加载/虚拟滚动）
    await waitForDropdownItems(dropdown, 3000);

    // 7. 查找匹配选项
    const result = await findAndSelectOption(dropdown, value, fuzzyMatch, selector);
    return result;

  } catch (error) {
    console.error('[AntDesign] ant-select 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 查找可见的下拉面板
 * @param {HTMLElement} selectWrapper - ant-select 容器
 * @returns {HTMLElement|null} 下拉面板元素
 */
function findVisibleDropdown(selectWrapper) {
  // 尝试获取 select 的唯一标识（用于关联下拉面板）
  const selectId = selectWrapper.getAttribute('data-id') ||
                   selectWrapper.getAttribute('id') ||
                   selectWrapper.querySelector('input')?.id ||
                   selectWrapper.getAttribute('aria-owns');

  // 检查 selectWrapper 是否处于打开状态
  const isOpen = selectWrapper.classList.contains('ant-select-focused') ||
                 selectWrapper.classList.contains('ant-select-open') ||
                 selectWrapper.getAttribute('data-open') === 'true';

  if (isOpen) {
    console.log('[AntDesign] selectWrapper 处于打开状态');
  }

  // 方法0: 通过 aria-owns 或 data-id 关联（最准确）
  if (selectId) {
    // 尝试多种可能的关联方式
    const relatedSelectors = [
      `[data-id="${selectId}"]`,
      `[id="${selectId}"]`,
      `[aria-labelledby="${selectId}"]`
    ];

    for (const sel of relatedSelectors) {
      const dropdown = document.querySelector(sel);
      if (dropdown && dropdown.classList.contains('ant-select-dropdown')) {
        const style = window.getComputedStyle(dropdown);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
            !dropdown.classList.contains('ant-select-dropdown-hidden')) {
          console.log(`[AntDesign] 找到关联下拉面板 (方法0: ID关联 "${selectId}")`);
          return dropdown;
        }
      }
    }
  }

  // 方法1: 查找所有可见的下拉面板
  const allDropdowns = document.querySelectorAll('.ant-select-dropdown');

  // 收集所有可见的下拉面板
  const visibleDropdowns = [];
  for (const dropdown of allDropdowns) {
    // 检查可见性
    const style = window.getComputedStyle(dropdown);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      continue;
    }

    // 检查是否有 ant-select-dropdown-hidden 类
    if (dropdown.classList.contains('ant-select-dropdown-hidden')) {
      continue;
    }

    // 检查下拉面板中是否有选项
    const hasItems = dropdown.querySelector('.ant-select-item-option, [class*="select-item"]');
    const hasEmpty = dropdown.querySelector('.ant-select-item-empty');

    if (hasItems || hasEmpty) {
      visibleDropdowns.push(dropdown);
    }
  }

  // 如果只有一个可见下拉面板，直接返回
  if (visibleDropdowns.length === 1) {
    console.log('[AntDesign] 找到唯一可见下拉面板 (方法1: 全局查找)');
    return visibleDropdowns[0];
  }

  // 如果有多个可见下拉面板，尝试通过位置关联
  if (visibleDropdowns.length > 1) {
    const wrapperRect = selectWrapper.getBoundingClientRect();
    let closestDropdown = null;
    let minDistance = Infinity;

    for (const dropdown of visibleDropdowns) {
      const dropdownRect = dropdown.getBoundingClientRect();

      // 检查下拉面板是否在选择器下方
      if (dropdownRect.top >= wrapperRect.bottom - 10) {
        const distance = Math.abs(dropdownRect.left - wrapperRect.left);
        if (distance < minDistance) {
          minDistance = distance;
          closestDropdown = dropdown;
        }
      }
    }

    if (closestDropdown) {
      console.log('[AntDesign] 找到最近下拉面板 (方法1b: 位置关联)');
      return closestDropdown;
    }

    // 返回第一个可见的下拉面板
    console.log('[AntDesign] 返回第一个可见下拉面板 (方法1c: 多面板回退)');
    return visibleDropdowns[0];
  }

  // 方法2: 查找带有特定类名的下拉面板
  const visibleDropdown = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  if (visibleDropdown) {
    const style = window.getComputedStyle(visibleDropdown);
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
      console.log('[AntDesign] 找到可见下拉面板 (方法2: 类名选择器)');
      return visibleDropdown;
    }
  }

  // 方法3: 检查是否有 dropdown-placement 相关的类
  const placementDropdown = document.querySelector('.ant-select-dropdown[class*="dropdown-placement"]');
  if (placementDropdown) {
    const style = window.getComputedStyle(placementDropdown);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      console.log('[AntDesign] 找到可见下拉面板 (方法3: placement 类)');
      return placementDropdown;
    }
  }

  // 方法4: 检查 getPopupContainer 可能的容器
  const containers = document.querySelectorAll('.ant-select-dropdown-container, [class*="dropdown-container"]');
  for (const container of containers) {
    const dropdown = container.querySelector('.ant-select-dropdown');
    if (dropdown) {
      const style = window.getComputedStyle(dropdown);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        console.log('[AntDesign] 找到可见下拉面板 (方法4: 容器查找)');
        return dropdown;
      }
    }
  }

  return null;
}

/**
 * 等待下拉面板选项加载完成
 * @param {HTMLElement} dropdown - 下拉面板元素
 * @param {number} timeout - 超时时间
 */
async function waitForDropdownItems(dropdown, timeout = 2000) {
  const startTime = Date.now();
  let lastItemCount = 0;

  while (Date.now() - startTime < timeout) {
    // 检查是否已有选项
    const items = dropdown.querySelectorAll('.ant-select-item-option');
    if (items.length > 0) {
      // 等待选项数量稳定（避免动态加载时不完整）
      if (items.length === lastItemCount) {
        console.log(`[AntDesign] 下拉面板已加载 ${items.length} 个选项（已稳定）`);
        return;
      }
      lastItemCount = items.length;
      console.log(`[AntDesign] 下拉面板已加载 ${items.length} 个选项，等待稳定...`);
    }

    // 检查是否有其他格式的选项
    const altItems = dropdown.querySelectorAll('[class*="select-item"]:not(.ant-select-item-empty)');
    if (altItems.length > 0 && altItems.length === lastItemCount) {
      console.log(`[AntDesign] 下拉面板已加载 ${altItems.length} 个选项 (备用格式，已稳定)`);
      return;
    }

    // 检查是否正在加载
    const loading = dropdown.querySelector('.ant-select-dropdown-loading, .ant-spin, .anticon-loading');
    if (loading) {
      console.log('[AntDesign] 选项正在加载中...');
    }

    // 检查虚拟滚动容器
    const virtualList = dropdown.querySelector('.rc-virtual-list-holder');
    if (virtualList) {
      console.log('[AntDesign] 检测到虚拟滚动容器');
      // 虚拟滚动时，检查内部是否有内容
      const virtualItems = virtualList.querySelectorAll('.ant-select-item-option');
      if (virtualItems.length > 0) {
        console.log(`[AntDesign] 虚拟滚动容器中有 ${virtualItems.length} 个选项`);
        return;
      }
    }

    // 等待一段时间后再次检查
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // 最后检查一次，即使超时也继续
  const finalItems = dropdown.querySelectorAll('.ant-select-item-option');
  if (finalItems.length > 0) {
    console.log(`[AntDesign] 等待超时但找到 ${finalItems.length} 个选项，继续尝试选择`);
  } else {
    console.log('[AntDesign] 等待选项加载超时，继续尝试选择');
  }
}

/**
 * 查找并选择匹配的选项
 * @param {HTMLElement} dropdown - 下拉面板元素
 * @param {string} value - 目标值
 * @param {boolean} fuzzyMatch - 是否模糊匹配
 * @param {HTMLElement} selector - 选择器元素（用于关闭下拉框）
 * @returns {Object} 填写结果
 */
async function findAndSelectOption(dropdown, value, fuzzyMatch, selector) {
  console.log(`[AntDesign] findAndSelectOption 开始，目标值: "${value}"`);

  // 查找选项 - 使用多种选择器确保兼容性
  let items = dropdown.querySelectorAll('.ant-select-item-option');
  console.log(`[AntDesign] .ant-select-item-option 找到 ${items.length} 个选项`);

  if (items.length === 0) {
    // 备用选择器
    items = dropdown.querySelectorAll('[class*="select-item"]:not(.ant-select-item-empty)');
    console.log(`[AntDesign] 使用备用选择器找到 ${items.length} 个选项`);
  }

  // 尝试在虚拟滚动容器中查找
  if (items.length === 0) {
    const virtualList = dropdown.querySelector('.rc-virtual-list-holder');
    if (virtualList) {
      items = virtualList.querySelectorAll('.ant-select-item-option');
      console.log(`[AntDesign] 在虚拟滚动容器中找到 ${items.length} 个选项`);
    }
  }

  if (items.length === 0) {
    // 检查是否有空状态
    const empty = dropdown.querySelector('.ant-select-item-empty');
    if (empty) {
      console.log('[AntDesign] 下拉面板显示空状态');
      selector?.click();
      return { success: false, reason: '下拉面板为空，无可用选项' };
    }

    // 记录下拉面板内容用于调试
    console.log('[AntDesign] 下拉面板 HTML:', dropdown.innerHTML.substring(0, 800));
    selector?.click();
    return { success: false, reason: '未找到任何选项元素' };
  }

  console.log(`[AntDesign] 找到 ${items.length} 个选项，开始匹配...`);

  // 打印前几个选项用于调试
  const sampleItems = Array.from(items).slice(0, 5);
  console.log('[AntDesign] 前 5 个选项:', sampleItems.map(i => `"${getItemText(i)}"`).join(', '));

  // 查找匹配项
  let matchedItem = null;
  let matchedText = '';
  const cleanValue = value.trim().toLowerCase();

  // 先尝试精确匹配
  for (const item of items) {
    const text = getItemText(item);
    if (text.toLowerCase() === cleanValue) {
      matchedItem = item;
      matchedText = text;
      console.log(`[AntDesign] 精确匹配成功: "${text}"`);
      break;
    }
  }

  // 如果没有精确匹配，尝试模糊匹配
  if (!matchedItem && fuzzyMatch) {
    console.log('[AntDesign] 精确匹配失败，尝试模糊匹配...');

    // 优先匹配包含关系
    for (const item of items) {
      const text = getItemText(item);
      const textLower = text.toLowerCase();

      // 目标值包含选项文本 或 选项文本包含目标值
      if (textLower.includes(cleanValue) || cleanValue.includes(textLower)) {
        matchedItem = item;
        matchedText = text;
        console.log(`[AntDesign] 包含匹配成功: "${text}"`);
        break;
      }
    }

    // 如果还是没有，尝试更宽松的匹配
    if (!matchedItem) {
      for (const item of items) {
        const text = getItemText(item);
        const textLower = text.toLowerCase();

        // 检查关键词匹配（去掉常见后缀）
        const keywords = cleanValue.replace(/省|市|区|县|自治区|特别行政区/g, '').split(/[,，、\s]+/);
        for (const keyword of keywords) {
          if (keyword.length >= 2 && textLower.includes(keyword)) {
            matchedItem = item;
            matchedText = text;
            console.log(`[AntDesign] 关键词匹配成功: "${text}" (关键词: "${keyword}")`);
            break;
          }
        }
        if (matchedItem) break;
      }
    }

    // 最后尝试：检查选项 value 属性
    if (!matchedItem) {
      for (const item of items) {
        const itemValue = item.getAttribute('data-value') || item.getAttribute('value');
        if (itemValue && itemValue.toLowerCase() === cleanValue) {
          matchedItem = item;
          matchedText = getItemText(item);
          break;
        }
      }
    }
  }

  if (!matchedItem) {
    console.log(`[AntDesign] ant-select 未找到匹配项: "${value}"`);
    const availableOptions = Array.from(items).slice(0, 15).map(i => getItemText(i));
    console.log('[AntDesign] 可用选项:', availableOptions);

    // 关闭下拉框
    selector?.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    document.body.click();

    return { success: false, reason: `未找到匹配选项，可用: ${availableOptions.join(', ')}` };
  }

  // 点击选项
  console.log(`[AntDesign] 找到匹配项: "${matchedText}"，准备点击`);

  // 滚动到可见位置
  try {
    matchedItem.scrollIntoView({ behavior: 'instant', block: 'center' });
  } catch (e) {
    console.log('[AntDesign] scrollIntoView 失败，继续尝试点击');
  }

  await new Promise(resolve => setTimeout(resolve, 150));

  // 增强选项点击：模拟完整的鼠标事件（包括指针事件）
  const clickOption = (element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    console.log(`[AntDesign] clickOption 坐标: (${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);

    // mouseenter
    element.dispatchEvent(new MouseEvent('mouseenter', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    }));

    // mouseover
    element.dispatchEvent(new MouseEvent('mouseover', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    }));

    // pointerdown（现代浏览器支持）
    element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY,
      isPrimary: true
    }));

    // mousedown
    element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY
    }));

    // pointerup
    element.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY,
      isPrimary: true
    }));

    // mouseup
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: centerX,
      clientY: centerY
    }));

    // click
    element.click();
  };

  // 执行点击
  clickOption(matchedItem);

  // 等待选择生效
  await new Promise(resolve => setTimeout(resolve, 200));

  // 验证选择是否成功（检查下拉框是否关闭）
  const isDropdownClosed = dropdown.classList.contains('ant-select-dropdown-hidden') ||
                           window.getComputedStyle(dropdown).display === 'none';

  if (isDropdownClosed) {
    console.log(`[AntDesign] ✅ ant-select 选择成功: "${matchedText}" (下拉框已关闭)`);
    return { success: true, value: matchedText };
  }

  // 如果下拉框未关闭，可能需要额外点击
  console.log('[AntDesign] 下拉框未关闭，尝试再次点击选项');
  matchedItem.click();
  await new Promise(resolve => setTimeout(resolve, 150));

  console.log(`[AntDesign] ✅ ant-select 选择完成: "${matchedText}"`);
  return { success: true, value: matchedText };
}

/**
 * 获取选项的文本内容
 * @param {HTMLElement} item - 选项元素
 * @returns {string} 选项文本
 */
function getItemText(item) {
  // 尝试从 content 属性获取
  const content = item.getAttribute('title') || item.getAttribute('aria-label');
  if (content) return content.trim();

  // 尝试从内部元素获取
  const inner = item.querySelector('.ant-select-item-option-content');
  if (inner) return inner.textContent.trim();

  // 直接获取文本
  return item.textContent.trim();
}

/**
 * 填写 ant-cascader 级联选择器
 * @param {HTMLElement} cascaderWrapper - ant-cascader 容器
 * @param {string} value - 地址值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillAntCascader(cascaderWrapper, value, options = {}) {
  const { timeout = 5000, delayBetween = 300 } = options;

  try {
    // 1. 解析地址值
    const parsed = parseAddress(value);
    const values = [parsed.province, parsed.city, parsed.district].filter(v => v);
    console.log(`[AntDesign] ant-cascader 解析值: "${value}" =>`, values);

    if (values.length === 0) {
      return { success: false, reason: '无法解析地址值' };
    }

    // 2. 点击打开级联选择器
    const picker = cascaderWrapper.querySelector('.ant-cascader-picker');
    if (!picker) {
      return { success: false, reason: '未找到选择器' };
    }

    picker.click();
    await new Promise(resolve => setTimeout(resolve, 200));

    // 3. 等待下拉面板出现
    const dropdown = await waitForElementUI('.ant-cascader-dropdown', timeout);
    if (!dropdown) {
      return { success: false, reason: '级联面板未出现' };
    }

    // 4. 逐级选择
    const selectedValues = [];

    for (let i = 0; i < values.length; i++) {
      const targetValue = values[i];
      const cleanTarget = targetValue.replace(/省|市|区|县|自治区|特别行政区/g, '');

      await new Promise(resolve => setTimeout(resolve, delayBetween));

      // 查找当前级别的菜单
      const menus = dropdown.querySelectorAll('.ant-cascader-menu');
      if (menus.length <= i) {
        console.log(`[AntDesign] ⚠️ ant-cascader 第 ${i + 1} 级菜单未找到`);
        break;
      }

      const menu = menus[i];
      const items = menu.querySelectorAll('.ant-cascader-menu-item');

      let matchedItem = null;
      for (const item of items) {
        const text = item.textContent.trim();
        const cleanText = text.replace(/省|市|区|县|自治区|特别行政区/g, '');

        if (text === targetValue || cleanText === cleanTarget ||
            text.includes(cleanTarget) || cleanTarget.includes(cleanText)) {
          matchedItem = item;
          break;
        }
      }

      if (!matchedItem) {
        console.log(`[AntDesign] ❌ ant-cascader 第 ${i + 1} 级未找到匹配项: "${targetValue}"`);
        console.log('[AntDesign] 可用选项:', Array.from(items).map(i => i.textContent.trim()));
        break;
      }

      matchedItem.click();
      selectedValues.push(matchedItem.textContent.trim());
      console.log(`[AntDesign] ✅ ant-cascader 第 ${i + 1} 级选择: "${matchedItem.textContent.trim()}"`);
    }

    // 5. 点击外部关闭面板
    await new Promise(resolve => setTimeout(resolve, 100));
    document.body.click();

    return {
      success: selectedValues.length === values.length,
      selectedValues,
      expectedValues: values
    };

  } catch (error) {
    console.error('[AntDesign] ant-cascader 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 ant-picker 日期选择器
 * @param {HTMLElement} pickerWrapper - ant-picker 容器
 * @param {string} value - 日期值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillAntPicker(pickerWrapper, value, options = {}) {
  const { timeout = 3000, clickToOpen = true } = options;

  try {
    const isRange = pickerWrapper.classList.contains('ant-picker-range');
    console.log(`[AntDesign] fillAntPicker 开始, isRange=${isRange}, value="${value}"`);

    // 辅助函数：设置input值并触发事件（处理readonly）
    const setInputValue = (input, dateValue) => {
      console.log(`[AntDesign] setInputValue 开始，目标值: "${dateValue}"`);

      // 移除readonly属性以便可以设置值
      const wasReadonly = input.hasAttribute('readonly');
      if (wasReadonly) {
        input.removeAttribute('readonly');
        console.log(`[AntDesign] 已移除 readonly 属性`);
      }

      // 使用原生 setter 设置值（绕过 React 的保护）
      try {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, dateValue);
          console.log(`[AntDesign] 使用原生 setter 设置值成功`);
        } else {
          input.value = dateValue;
        }
      } catch (e) {
        input.value = dateValue;
        console.log(`[AntDesign] 原生 setter 失败，使用直接赋值: ${e.message}`);
      }

      console.log(`[AntDesign] 设置后 input.value = "${input.value}"`);

      // 触发多种事件确保框架感知变化
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: dateValue }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

      console.log(`[AntDesign] 已触发 focus/input/change/blur 事件`);

      // 恢复readonly属性
      if (wasReadonly) {
        input.setAttribute('readonly', '');
      }

      // 验证值是否成功设置
      if (input.value === dateValue) {
        console.log(`[AntDesign] ✅ setInputValue 成功`);
        return true;
      } else {
        console.log(`[AntDesign] ⚠️ setInputValue 可能失败，当前值: "${input.value}"`);
        return false;
      }
    };

    // 问题23修复：尝试点击打开日历面板后再填写
    // 某些 Ant Design 版本需要先打开面板才能正确设置值
    const tryOpenPicker = async (input) => {
      if (!clickToOpen) return;

      console.log('[AntDesign] 尝试打开日历面板...');

      // 方法1：直接点击 picker 容器
      pickerWrapper.click();
      await new Promise(r => setTimeout(r, 200));

      // 方法2：点击输入框
      input.click();
      input.focus();
      await new Promise(r => setTimeout(r, 200));

      // 方法3：查找并点击日历图标
      const calendarIcon = pickerWrapper.querySelector('.ant-picker-suffix');
      if (calendarIcon) {
        console.log('[AntDesign] 点击日历图标');
        calendarIcon.click();
        await new Promise(r => setTimeout(r, 300));
      }

      // 方法4：模拟键盘事件
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

      // 方法5：触发 mousedown/mouseup 事件
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      console.log('[AntDesign] 已尝试多种方式打开日历面板');
    };

    // 等待日历面板出现（针对当前 picker）
    const waitForPanel = async (maxWait = 1500) => {
      const startTime = Date.now();
      console.log('[AntDesign] 等待日历面板出现...');
      while (Date.now() - startTime < maxWait) {
        // 尝试多种选择器
        const selectors = [
          '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)',
          '.ant-picker-dropdown',
          '.ant-picker-panel-container'
        ];

        for (const selector of selectors) {
          const panel = document.querySelector(selector);
          if (panel) {
            // 确保面板是可见的
            const style = window.getComputedStyle(panel);
            const panelVisible = panel.offsetWidth > 0 && panel.offsetHeight > 0 &&
                                 style.display !== 'none' && style.visibility !== 'hidden';
            if (panelVisible) {
              console.log(`[AntDesign] 找到可见的日历面板: ${selector}`);
              return panel;
            }
          }
        }
        await new Promise(r => setTimeout(r, 100));
      }
      console.log('[AntDesign] 日历面板等待超时');
      return null;
    };

    // 点击日历面板中的日期
    const clickDateInPanel = async (dateStr) => {
      // 等待日历面板出现
      const panel = await waitForPanel(1500);
      if (!panel) {
        console.log(`[AntDesign] 日历面板未出现，尝试直接设置值`);
        return false;
      }

      // 解析日期
      const dateParts = dateStr.split(/[-\/]/);
      if (dateParts.length !== 3) {
        console.log(`[AntDesign] 日期格式不正确: ${dateStr}`);
        return false;
      }

      const year = dateParts[0];
      const month = parseInt(dateParts[1], 10);
      const day = parseInt(dateParts[2], 10);

      console.log(`[AntDesign] 尝试点击日期: ${year}-${month}-${day}`);

      // 查找年份选择器（如果需要切换年份）
      const yearBtn = panel.querySelector('.ant-picker-year-btn');
      if (yearBtn) {
        const currentYear = yearBtn.textContent.trim();
        console.log(`[AntDesign] 当前年份: ${currentYear}, 目标年份: ${year}`);
        if (currentYear !== year) {
          yearBtn.click();
          await new Promise(r => setTimeout(r, 300));

          // 选择年份 - 查找所有可能的年份单元格
          const yearCells = panel.querySelectorAll('.ant-picker-cell');
          for (const cell of yearCells) {
            if (cell.textContent.trim() === year && !cell.classList.contains('ant-picker-cell-disabled')) {
              cell.click();
              console.log(`[AntDesign] ✅ 已选择年份: ${year}`);
              await new Promise(r => setTimeout(r, 300));
              break;
            }
          }
        }
      }

      // 查找月份选择器（如果需要切换月份）
      const monthBtn = panel.querySelector('.ant-picker-month-btn');
      if (monthBtn) {
        const currentMonth = monthBtn.textContent.trim();
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        const targetMonth = monthNames[month - 1];
        console.log(`[AntDesign] 当前月份: ${currentMonth}, 目标月份: ${targetMonth}`);
        if (currentMonth !== targetMonth) {
          monthBtn.click();
          await new Promise(r => setTimeout(r, 300));

          // 选择月份 - 查找所有可能的月份单元格
          const monthCells = panel.querySelectorAll('.ant-picker-cell');
          for (const cell of monthCells) {
            const cellTitle = cell.getAttribute('title') || '';
            const cellText = cell.textContent.trim();
            if ((cellTitle === targetMonth || cellText === targetMonth) &&
                !cell.classList.contains('ant-picker-cell-disabled')) {
              cell.click();
              console.log(`[AntDesign] ✅ 已选择月份: ${targetMonth}`);
              await new Promise(r => setTimeout(r, 300));
              break;
            }
          }
        }
      }

      // 点击日期 - 尝试多种方式查找
      const dayCells = panel.querySelectorAll('.ant-picker-cell');

      // 方式1：通过 title 属性查找
      for (const cell of dayCells) {
        const cellTitle = cell.getAttribute('title') || '';
        if (cellTitle.includes(`${month}月`) && cellTitle.includes(`${day}日`)) {
          if (!cell.classList.contains('ant-picker-cell-disabled')) {
            cell.click();
            console.log(`[AntDesign] ✅ 已点击日期单元格 (通过title): ${cellTitle}`);
            return true;
          }
        }
      }

      // 方式2：直接查找包含日期数字的单元格
      for (const cell of dayCells) {
        const cellText = cell.textContent.trim();
        if (cellText === String(day) && !cell.classList.contains('ant-picker-cell-disabled')) {
          // 确保不是其他月份的日期
          const view = cell.closest('.ant-picker-date-panel, .ant-picker-panel');
          if (view) {
            cell.click();
            console.log(`[AntDesign] ✅ 已点击日期单元格 (通过数字): ${cellText}`);
            return true;
          }
        }
      }

      // 方式3：查找带有 data-value 属性的单元格
      for (const cell of dayCells) {
        const dataValue = cell.getAttribute('data-value') || '';
        if (dataValue.includes(`-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`) ||
            dataValue === dateStr) {
          if (!cell.classList.contains('ant-picker-cell-disabled')) {
            cell.click();
            console.log(`[AntDesign] ✅ 已点击日期单元格 (通过data-value): ${dataValue}`);
            return true;
          }
        }
      }

      console.log(`[AntDesign] ❌ 未找到日期单元格: ${day}`);
      return false;
    };

    // 点击确定按钮（如果有）
    const clickOkButton = async () => {
      await new Promise(r => setTimeout(r, 100));
      const panel = document.querySelector('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
      if (!panel) return false;

      const okBtn = panel.querySelector('.ant-picker-ok button');
      if (okBtn) {
        okBtn.click();
        console.log(`[AntDesign] ✅ 已点击确定按钮`);
        await new Promise(r => setTimeout(r, 100));
        return true;
      }
      return false;
    };

    if (isRange) {
      // 日期范围选择器
      const inputs = pickerWrapper.querySelectorAll('input');
      if (inputs.length < 2) {
        return { success: false, reason: '未找到日期范围输入框' };
      }

      const dates = value.split(/[至~\-—]/).map(d => d.trim());
      if (dates.length !== 2) {
        return { success: false, reason: '日期范围格式不正确' };
      }

      // 尝试打开日历面板
      await tryOpenPicker(inputs[0]);

      // 尝试点击日历面板选择日期
      const clicked1 = await clickDateInPanel(formatDateForInput(dates[0]));
      if (clicked1) {
        await new Promise(r => setTimeout(r, 200));
        await clickDateInPanel(formatDateForInput(dates[1]));
      } else {
        // 备用方案：直接设置值
        setInputValue(inputs[0], formatDateForInput(dates[0]));
        setInputValue(inputs[1], formatDateForInput(dates[1]));
      }

      // 点击确定或关闭面板
      await clickOkButton();
      document.body.click();

      console.log(`[AntDesign] ✅ ant-picker-range 填写完成: ${dates[0]} 至 ${dates[1]}`);
      return { success: true, value: `${dates[0]} 至 ${dates[1]}` };
    }

    // 单日期选择器
    const input = pickerWrapper.querySelector('input');
    if (!input) {
      return { success: false, reason: '未找到日期输入框' };
    }

    // 尝试打开日历面板
    await tryOpenPicker(input);

    const formattedDate = formatDateForInput(value);

    // 尝试点击日历面板选择日期
    const clicked = await clickDateInPanel(formattedDate);

    if (!clicked) {
      // 备用方案：直接设置值
      setInputValue(input, formattedDate);
    }

    // 点击确定按钮（如果有）
    await clickOkButton();

    // 关闭面板
    document.body.click();

    // 验证值是否设置成功
    await new Promise(r => setTimeout(r, 100));
    const finalValue = input.value;
    console.log(`[AntDesign] 日期输入框最终值: "${finalValue}"`);

    // 检查是否成功
    if (finalValue && finalValue.trim() !== '') {
      console.log(`[AntDesign] ✅ ant-picker 填写成功: ${finalValue}`);
      return { success: true, value: finalValue };
    } else {
      console.log(`[AntDesign] ⚠️ 日期可能未正确填入`);
      return { success: false, reason: '日期未正确填入' };
    }

  } catch (error) {
    console.error('[AntDesign] ant-picker 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 ant-radio-group 单选按钮组
 * @param {HTMLElement} radioGroup - ant-radio-group 容器
 * @param {string} value - 要选中的值
 * @param {Object} options - 配置选项
 * @returns {Object} 填写结果
 */
function fillAntRadioGroup(radioGroup, value, options = {}) {
  try {
    const targetValue = value.toLowerCase().trim();
    const radios = radioGroup.querySelectorAll('.ant-radio-wrapper');

    // 性别映射：支持多种输入格式
    const genderMap = {
      '男': ['男', 'male', 'm', 'true', '1'],
      '女': ['女', 'female', 'f', 'false', '0']
    };

    // 查找匹配的性别
    let normalizedValue = targetValue;
    for (const [gender, aliases] of Object.entries(genderMap)) {
      if (aliases.includes(targetValue)) {
        normalizedValue = gender;
        break;
      }
    }

    for (const radio of radios) {
      const radioText = radio.textContent.trim().toLowerCase();
      const radioInput = radio.querySelector('input');
      const inputValue = (radioInput?.value || '').toLowerCase();

      // 匹配：文本、input值、或规范化后的性别
      if (radioText === targetValue || inputValue === targetValue ||
          radioText === normalizedValue ||
          radioText.includes(targetValue) || targetValue.includes(radioText)) {
        radio.click();
        console.log(`[AntDesign] ✅ ant-radio-group 选择成功: "${radio.textContent.trim()}"`);
        return { success: true, value: radio.textContent.trim() };
      }
    }

    console.log(`[AntDesign] ❌ ant-radio-group 未找到匹配项: "${value}"`);
    console.log('[AntDesign] 可用选项:', Array.from(radios).map(r => ({
      text: r.textContent.trim(),
      value: r.querySelector('input')?.value
    })));
    return { success: false, reason: '未找到匹配选项' };

  } catch (error) {
    console.error('[AntDesign] ant-radio-group 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 ant-checkbox-group 复选框组
 * @param {HTMLElement} checkboxGroup - ant-checkbox-group 容器
 * @param {string|Array} value - 要选中的值
 * @param {Object} options - 配置选项
 * @returns {Object} 填写结果
 */
function fillAntCheckboxGroup(checkboxGroup, value, options = {}) {
  try {
    const targetValues = Array.isArray(value) ? value : [value];
    const checkboxes = checkboxGroup.querySelectorAll('.ant-checkbox-wrapper');
    const selected = [];

    for (const targetValue of targetValues) {
      const target = targetValue.toLowerCase().trim();

      for (const checkbox of checkboxes) {
        const checkboxText = checkbox.textContent.trim().toLowerCase();

        if (checkboxText === target || checkboxText.includes(target) || target.includes(checkboxText)) {
          checkbox.click();
          selected.push(checkbox.textContent.trim());
          break;
        }
      }
    }

    if (selected.length > 0) {
      console.log(`[AntDesign] ✅ ant-checkbox-group 选择成功:`, selected);
      return { success: true, value: selected };
    }

    console.log(`[AntDesign] ❌ ant-checkbox-group 未找到匹配项:`, targetValues);
    return { success: false, reason: '未找到匹配选项' };

  } catch (error) {
    console.error('[AntDesign] ant-checkbox-group 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 vant-field 输入框
 * @param {HTMLElement} fieldWrapper - van-field 容器
 * @param {string} value - 要填写的值
 * @returns {Object} 填写结果
 */
function fillVantField(fieldWrapper, value) {
  try {
    const input = fieldWrapper.querySelector('input, textarea');
    if (!input) return { success: false, reason: '未找到输入框' };

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    console.log(`[Vant] ✅ vant-field 填写成功: ${value}`);
    return { success: true, value };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 ivu-select 下拉框
 * @param {HTMLElement} selectWrapper - ivu-select 容器
 * @param {string} value - 要选择的值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillIviewSelect(selectWrapper, value, options = {}) {
  const { timeout = 3000, fuzzyMatch = true } = options;

  try {
    // 点击打开下拉框
    const selection = selectWrapper.querySelector('.ivu-select-selection');
    if (!selection) return { success: false, reason: '未找到选择器' };

    selection.click();
    await new Promise(resolve => setTimeout(resolve, 200));

    // 等待下拉面板
    const dropdown = await waitForElementUI('.ivu-select-dropdown', timeout);
    if (!dropdown) return { success: false, reason: '下拉面板未出现' };

    // 查找匹配选项
    const items = dropdown.querySelectorAll('.ivu-select-item');
    const cleanValue = value.trim().toLowerCase();

    for (const item of items) {
      const text = item.textContent.trim();
      if (text.toLowerCase() === cleanValue || text.includes(value) || fuzzyMatch && value.includes(text)) {
        item.click();
        console.log(`[iView] ✅ ivu-select 选择成功: ${text}`);
        return { success: true, value: text };
      }
    }

    selection.click(); // 关闭
    return { success: false, reason: '未找到匹配选项' };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 ivu-input 输入框
 * @param {HTMLElement} inputWrapper - ivu-input-wrapper 容器
 * @param {string} value - 要填写的值
 * @returns {Object} 填写结果
 */
function fillIviewInput(inputWrapper, value) {
  try {
    const input = inputWrapper.querySelector('input, textarea');
    if (!input) return { success: false, reason: '未找到输入框' };

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    console.log(`[iView] ✅ ivu-input 填写成功: ${value}`);
    return { success: true, value };
  } catch (error) {
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-date-editor 日期选择器
 * @param {HTMLElement} dateWrapper - el-date-editor 容器
 * @param {string} value - 日期值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillElDatePicker(dateWrapper, value, options = {}) {
  const { timeout = 3000 } = options;

  try {
    // 检查是否是日期范围选择器
    const isRange = dateWrapper.classList.contains('el-date-editor--daterange');

    if (isRange) {
      // 日期范围选择器处理
      const inputs = dateWrapper.querySelectorAll('.el-range-input');
      if (inputs.length < 2) {
        return { success: false, reason: '未找到日期范围输入框' };
      }

      // 解析日期范围
      const dates = value.split(/[至~\-—]/).map(d => d.trim());
      if (dates.length !== 2) {
        return { success: false, reason: '日期范围格式不正确，请使用"至"或"~"分隔' };
      }

      // 格式化日期
      const startDate = formatDateForInput(dates[0]);
      const endDate = formatDateForInput(dates[1]);

      // 设置值
      triggerDataSync(inputs[0], startDate);
      triggerDataSync(inputs[1], endDate);

      console.log(`[ElementUI] ✅ el-date-range 填写成功: ${startDate} 至 ${endDate}`);
      return { success: true, value: `${startDate} 至 ${endDate}` };
    }

    // 单日期选择器
    const input = dateWrapper.querySelector('.el-input__inner');
    if (!input) {
      return { success: false, reason: '未找到输入框' };
    }

    // 格式化日期
    const formattedDate = formatDateForInput(value);

    // 方式1：直接设置值
    triggerDataSync(input, formattedDate);

    console.log(`[ElementUI] ✅ el-date 填写成功: "${formattedDate}"`);
    return { success: true, value: formattedDate };

  } catch (error) {
    console.error('[ElementUI] el-date 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-radio-group 单选按钮组
 * @param {HTMLElement} radioGroup - el-radio-group 容器
 * @param {string} value - 要选择的值
 * @param {Object} options - 配置选项
 * @returns {Object} 填写结果
 */
function fillElRadioGroup(radioGroup, value, options = {}) {
  const { fuzzyMatch = true } = options;

  try {
    const radios = radioGroup.querySelectorAll('.el-radio');
    const targetValue = value.toLowerCase().trim();

    for (const radio of radios) {
      const labelEl = radio.querySelector('.el-radio__label');
      const labelText = labelEl ? labelEl.textContent.trim().toLowerCase() : '';
      const input = radio.querySelector('input');

      if (!input) continue;

      const radioValue = input.value.toLowerCase();

      // 精确匹配
      if (labelText === targetValue || radioValue === targetValue) {
        radio.click();
        console.log(`[ElementUI] ✅ el-radio 选择成功: "${labelText || radioValue}"`);
        return { success: true, value: labelText || radioValue };
      }

      // 模糊匹配
      if (fuzzyMatch && (labelText.includes(targetValue) || targetValue.includes(labelText))) {
        radio.click();
        console.log(`[ElementUI] ✅ el-radio 模糊匹配成功: "${labelText}"`);
        return { success: true, value: labelText };
      }
    }

    console.log(`[ElementUI] ❌ el-radio-group 未找到匹配选项: "${value}"`);
    return { success: false, reason: '未找到匹配选项' };

  } catch (error) {
    console.error('[ElementUI] el-radio-group 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-checkbox-group 复选框组
 * @param {HTMLElement} checkboxGroup - el-checkbox-group 容器
 * @param {string|Array} value - 要选择的值（可以是数组）
 * @param {Object} options - 配置选项
 * @returns {Object} 填写结果
 */
function fillElCheckboxGroup(checkboxGroup, value, options = {}) {
  const { fuzzyMatch = true } = options;

  try {
    const checkboxes = checkboxGroup.querySelectorAll('.el-checkbox');
    const values = Array.isArray(value) ? value : [value];
    const selectedValues = [];

    for (const targetValue of values) {
      const target = targetValue.toLowerCase().trim();
      let found = false;

      for (const checkbox of checkboxes) {
        const labelEl = checkbox.querySelector('.el-checkbox__label');
        const labelText = labelEl ? labelEl.textContent.trim().toLowerCase() : '';
        const input = checkbox.querySelector('input');

        if (!input || input.checked) continue;

        const checkboxValue = input.value.toLowerCase();

        if (labelText === target || checkboxValue === target ||
            (fuzzyMatch && (labelText.includes(target) || target.includes(labelText)))) {
          checkbox.click();
          selectedValues.push(labelText || checkboxValue);
          found = true;
          break;
        }
      }

      if (!found) {
        console.log(`[ElementUI] ⚠️ el-checkbox 未找到匹配选项: "${targetValue}"`);
      }
    }

    if (selectedValues.length > 0) {
      console.log(`[ElementUI] ✅ el-checkbox-group 选择成功:`, selectedValues);
      return { success: true, value: selectedValues };
    }

    return { success: false, reason: '未找到任何匹配选项' };

  } catch (error) {
    console.error('[ElementUI] el-checkbox-group 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-switch 开关
 * @param {HTMLElement} switchWrapper - el-switch 容器
 * @param {boolean|string} value - 开关值
 * @returns {Object} 填写结果
 */
function fillElSwitch(switchWrapper, value) {
  try {
    const input = switchWrapper.querySelector('input');
    if (!input) {
      return { success: false, reason: '未找到开关输入' };
    }

    const targetChecked = value === true || value === 'true' || value === '是' || value === '1';

    if (input.checked !== targetChecked) {
      switchWrapper.click();
    }

    console.log(`[ElementUI] ✅ el-switch 设置成功: ${targetChecked}`);
    return { success: true, value: targetChecked };

  } catch (error) {
    console.error('[ElementUI] el-switch 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-input-number 数字输入框
 * @param {HTMLElement} numberWrapper - el-input-number 容器
 * @param {number|string} value - 数值
 * @returns {Object} 填写结果
 */
function fillElInputNumber(numberWrapper, value) {
  try {
    const input = numberWrapper.querySelector('.el-input__inner');
    if (!input) {
      return { success: false, reason: '未找到输入框' };
    }

    const num = extractNumber(value);
    if (num === null) {
      return { success: false, reason: '无效的数值' };
    }

    // 检查最小最大值
    const min = parseFloat(input.min) || parseFloat(numberWrapper.getAttribute('min')) || -Infinity;
    const max = parseFloat(input.max) || parseFloat(numberWrapper.getAttribute('max')) || Infinity;
    const clampedNum = Math.max(min, Math.min(max, num));

    triggerDataSync(input, String(clampedNum));

    console.log(`[ElementUI] ✅ el-input-number 填写成功: ${clampedNum}`);
    return { success: true, value: clampedNum };

  } catch (error) {
    console.error('[ElementUI] el-input-number 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 填写 el-rate 评分
 * @param {HTMLElement} rateWrapper - el-rate 容器
 * @param {number|string} value - 评分值
 * @returns {Object} 填写结果
 */
function fillElRate(rateWrapper, value) {
  try {
    const items = rateWrapper.querySelectorAll('.el-rate__item');
    const num = parseInt(value, 10);

    if (isNaN(num) || num < 1 || num > items.length) {
      return { success: false, reason: `评分值必须在 1-${items.length} 之间` };
    }

    // 点击对应的星星
    const targetItem = items[num - 1];
    if (targetItem) {
      const icon = targetItem.querySelector('.el-rate__icon');
      if (icon) {
        icon.click();
      }
    }

    console.log(`[ElementUI] ✅ el-rate 设置成功: ${num} 星`);
    return { success: true, value: num };

  } catch (error) {
    console.error('[ElementUI] el-rate 填写失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 智能填写 Element UI 组件
 * 自动识别组件类型并调用对应的填写函数
 * @param {HTMLElement} element - DOM 元素
 * @param {string} value - 要填写的值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function smartFillElementUI(element, value, options = {}) {
  const componentInfo = identifyElementUIComponent(element);

  if (!componentInfo) {
    return { success: false, reason: '不是 Element UI 组件' };
  }

  console.log(`[ElementUI] 识别到组件类型: ${componentInfo.type}`);

  switch (componentInfo.type) {
    case ElementUIType.INPUT:
      return fillElInput(componentInfo.wrapper, value);

    case ElementUIType.SELECT:
      return await fillElSelect(componentInfo.wrapper, value, options);

    case ElementUIType.CAScADER:
      return await fillElCascader(componentInfo.wrapper, value, options);

    case ElementUIType.CUSTOM_CASCADER:
      return await fillCustomCascader(componentInfo.wrapper, value, options);

    case ElementUIType.DATE:
    case 'el-datetime':
    case 'el-daterange':
      return await fillElDatePicker(componentInfo.wrapper, value, options);

    case ElementUIType.RADIO:
      return fillElRadioGroup(componentInfo.wrapper, value, options);

    case ElementUIType.CHECKBOX:
      return fillElCheckboxGroup(componentInfo.wrapper, value, options);

    case ElementUIType.SWITCH:
      return fillElSwitch(componentInfo.wrapper, value);

    case ElementUIType.INPUT_NUMBER:
      return fillElInputNumber(componentInfo.wrapper, value);

    case ElementUIType.RATE:
      return fillElRate(componentInfo.wrapper, value);

    // ================== Ant Design 组件处理 ==================
    case 'ant-select':
      return await fillAntSelect(componentInfo.wrapper, value, options);

    case 'ant-cascader':
      return await fillAntCascader(componentInfo.wrapper, value, options);

    case 'ant-date':
    case 'ant-daterange':
      return await fillAntPicker(componentInfo.wrapper, value, options);

    case 'ant-radio-group':
      return fillAntRadioGroup(componentInfo.wrapper, value, options);

    case 'ant-checkbox-group':
      return fillAntCheckboxGroup(componentInfo.wrapper, value, options);

    case 'ant-input':
      const antInput = componentInfo.input || componentInfo.wrapper.querySelector('input');
      if (antInput) {
        triggerDataSync(antInput, value);
        return { success: true, value };
      }
      return { success: false, reason: '未找到输入框' };

    // ================== Vant 组件处理 ==================
    case 'vant-field':
      return fillVantField(componentInfo.wrapper, value);

    case 'vant-picker':
      return { success: false, reason: 'vant-picker 需要交互选择' };

    // ================== iView 组件处理 ==================
    case 'ivu-select':
      return await fillIviewSelect(componentInfo.wrapper, value, options);

    case 'ivu-input':
      return fillIviewInput(componentInfo.wrapper, value);

    default:
      // 尝试查找内部输入框直接填写
      const input = componentInfo.wrapper?.querySelector('input:not([type="hidden"]), textarea');
      if (input) {
        triggerDataSync(input, value);
        return { success: true, value };
      }
      return { success: false, reason: `不支持的组件类型: ${componentInfo.type}` };
  }
}

/**
 * 检测 Element UI 级联选择器
 * @param {Array} formElements - 表单元素列表
 * @returns {Array} 检测到的级联组
 */
function detectElementUICascading(formElements) {
  const groups = [];
  const processed = new Set();

  for (const el of formElements) {
    const domEl = el.element || el;
    if (processed.has(domEl)) continue;

    // 检测 el-cascader
    const cascader = domEl.closest ? domEl.closest('.el-cascader') : null;
    if (cascader) {
      const label = extractElementUILabel(cascader);
      const cascadeType = inferCascadeTypeFromLabel(label);

      groups.push({
        groupId: `el_cascader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: cascadeType || 'custom',
        subtype: 'element-ui-cascader',
        framework: UIFramework.ELEMENT_UI,
        element: cascader,
        label: label,
        isCascaderComponent: true,
        levels: [{ level: 1, element: cascader, label }]
      });

      processed.add(cascader);
      continue;
    }

    // 检测 el-select 组成的级联
    const select = domEl.closest ? domEl.closest('.el-select') : null;
    if (select && !processed.has(select)) {
      const label = extractElementUILabel(select);
      const cascadeType = inferCascadeTypeFromLabel(label);

      if (cascadeType) {
        groups.push({
          groupId: `el_select_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: cascadeType,
          framework: UIFramework.ELEMENT_UI,
          element: select,
          label: label,
          isSelectComponent: true,
          levels: [{ level: 1, element: select, label }]
        });
        processed.add(select);
      }
    }
  }

  // 尝试合并相邻的同类型 el-select
  return mergeElementUISelectGroups(groups);
}

/**
 * 根据标签推断级联类型
 * @param {string} label - 标签文本
 * @returns {string|null} 级联类型
 */
function inferCascadeTypeFromLabel(label) {
  if (!label) return null;

  const labelLower = label.toLowerCase();

  if (['省', '市', '区', '县', '地址', '居住地', '籍贯', '户口', '现居'].some(kw => labelLower.includes(kw))) {
    return 'region';
  }
  if (['行业', '职位', '岗位', '期望职位'].some(kw => labelLower.includes(kw))) {
    return 'industry_job';
  }
  if (['学历', '专业'].some(kw => labelLower.includes(kw))) {
    return 'education_major';
  }
  if (['学校', '院校', '毕业院校'].some(kw => labelLower.includes(kw))) {
    return 'school_department';
  }

  return null;
}

/**
 * 合并相邻的 el-select 组
 * @param {Array} groups - 检测到的组
 * @returns {Array} 合并后的组
 */
function mergeElementUISelectGroups(groups) {
  const typeGroups = {};

  groups.forEach(group => {
    if (group.type && group.type !== 'custom' && group.isSelectComponent) {
      if (!typeGroups[group.type]) {
        typeGroups[group.type] = [];
      }
      typeGroups[group.type].push(group);
    }
  });

  const merged = [];

  Object.entries(typeGroups).forEach(([type, items]) => {
    if (items.length >= 2) {
      // 按位置排序
      items.sort((a, b) => {
        const rectA = a.element.getBoundingClientRect();
        const rectB = b.element.getBoundingClientRect();
        return rectA.left - rectB.left;
      });

      // 检查是否在同一容器内
      const container = items[0].element.closest('.el-form, .el-row, form, .el-col');
      const sameContainer = items.every(item => {
        const itemContainer = item.element.closest('.el-form, .el-row, form, .el-col');
        return itemContainer === container;
      });

      if (sameContainer) {
        merged.push({
          groupId: `el_cascade_${type}_${Date.now()}`,
          type: type,
          framework: UIFramework.ELEMENT_UI,
          levels: items.map((item, idx) => ({
            level: idx + 1,
            element: item.element,
            label: item.label
          })),
          elements: items.map(item => item.element)
        });
      } else {
        merged.push(...items);
      }
    } else {
      merged.push(...items);
    }
  });

  // 添加 cascader 组件
  groups.filter(g => g.isCascaderComponent).forEach(g => merged.push(g));

  return merged;
}

/**
 * 填写 Element UI 级联组
 * @param {Object} group - 级联组
 * @param {string} value - 值
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} 填写结果
 */
async function fillElementUICascadeGroup(group, value, options = {}) {
  if (group.isCascaderComponent) {
    return await fillElCascader(group.element, value, options);
  }

  // 对于多个 el-select 组成的级联
  const { timeout = 3000, delayBetween = 200, fuzzyMatch = true } = options;

  try {
    // 解析值
    let values = [];

    if (group.type === 'region') {
      const parsed = parseAddress(value);
      values = [parsed.province, parsed.city, parsed.district].filter(v => v);
    } else {
      // 尝试按分隔符分割
      values = value.split(/[,\s，、\/]+/).filter(v => v);
    }

    if (values.length === 0) {
      return { success: false, reason: '无法解析值' };
    }

    const results = [];
    const levels = group.levels || [];

    for (let i = 0; i < levels.length && i < values.length; i++) {
      const level = levels[i];
      const targetValue = values[i];

      const result = await fillElSelect(level.element, targetValue, { timeout, fuzzyMatch });
      results.push({
        level: level.level,
        ...result
      });

      if (!result.success) {
        break;
      }

      // 等待下一级选项加载
      if (i < levels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetween));
      }
    }

    const successCount = results.filter(r => r.success).length;

    return {
      success: successCount === levels.length,
      results,
      completedCount: successCount,
      totalCount: levels.length
    };

  } catch (error) {
    console.error('[ElementUI] 级联组填写失败:', error);
    return { success: false, reason: error.message };
  }
}

// ================== 直辖市和地址解析 ==================

/**
 * 直辖市列表
 * 北京、上海、天津、重庆 没有省级划分，直接是市区
 */
const MUNICIPALITIES = {
  '北京': { name: '北京', fullName: '北京市', type: 'municipality' },
  '北京市': { name: '北京', fullName: '北京市', type: 'municipality' },
  '上海': { name: '上海', fullName: '上海市', type: 'municipality' },
  '上海市': { name: '上海', fullName: '上海市', type: 'municipality' },
  '天津': { name: '天津', fullName: '天津市', type: 'municipality' },
  '天津市': { name: '天津', fullName: '天津市', type: 'municipality' },
  '重庆': { name: '重庆', fullName: '重庆市', type: 'municipality' },
  '重庆市': { name: '重庆', fullName: '重庆市', type: 'municipality' }
};

/**
 * 省份简称映射
 */
const PROVINCE_ABBREVIATIONS = {
  '广东': '广东省', '广州': '广东省', '深圳': '广东省',
  '浙江': '浙江省', '杭州': '浙江省', '宁波': '浙江省',
  '江苏': '江苏省', '南京': '江苏省', '苏州': '江苏省',
  '山东': '山东省', '济南': '山东省', '青岛': '山东省',
  '四川': '四川省', '成都': '四川省',
  '湖北': '湖北省', '武汉': '湖北省',
  '湖南': '湖南省', '长沙': '湖南省',
  '河南': '河南省', '郑州': '河南省',
  '河北': '河北省', '石家庄': '河北省',
  '福建': '福建省', '福州': '福建省', '厦门': '福建省',
  '陕西': '陕西省', '西安': '陕西省',
  '安徽': '安徽省', '合肥': '安徽省',
  '辽宁': '辽宁省', '沈阳': '辽宁省', '大连': '辽宁省',
  '江西': '江西省', '南昌': '江西省',
  '黑龙江': '黑龙江省', '哈尔滨': '黑龙江省',
  '吉林': '吉林省', '长春': '吉林省',
  '山西': '山西省', '太原': '山西省',
  '云南': '云南省', '昆明': '云南省',
  '贵州': '贵州省', '贵阳': '贵州省',
  '甘肃': '甘肃省', '兰州': '甘肃省',
  '海南': '海南省', '海口': '海南省', '三亚': '海南省',
  '青海': '青海省', '西宁': '青海省',
  '内蒙古': '内蒙古自治区', '呼和浩特': '内蒙古自治区',
  '广西': '广西壮族自治区', '南宁': '广西壮族自治区',
  '西藏': '西藏自治区', '拉萨': '西藏自治区',
  '宁夏': '宁夏回族自治区', '银川': '宁夏回族自治区',
  '新疆': '新疆维吾尔自治区', '乌鲁木齐': '新疆维吾尔自治区',
  '香港': '香港特别行政区', '澳门': '澳门特别行政区',
  '台湾': '台湾省'
};

/**
 * 解析地址字符串为省/市/区结构
 * @param {string} address - 地址字符串
 * @returns {Object} 解析结果 { province, city, district, isMunicipality }
 */
function parseAddress(address) {
  if (!address || typeof address !== 'string') {
    return { province: '', city: '', district: '', isMunicipality: false };
  }

  // 清理地址字符串
  let cleaned = address.trim();

  // 结果对象
  const result = {
    province: '',
    city: '',
    district: '',
    isMunicipality: false,
    original: address
  };

  // 检查是否是直辖市
  for (const [key, info] of Object.entries(MUNICIPALITIES)) {
    if (cleaned.includes(key)) {
      result.isMunicipality = true;
      result.province = info.fullName;
      result.city = info.fullName;

      // 提取区名（直辖市后面通常直接是区）
      let remaining = cleaned.replace(key, '').trim();
      // 移除"市"字
      remaining = remaining.replace(/^市/, '').trim();

      // 提取区
      const districtMatch = remaining.match(/(.+?(?:区|县))/);
      if (districtMatch) {
        result.district = districtMatch[1];
      } else if (remaining) {
        // 如果没有"区"或"县"，但有剩余文字，当作区名
        result.district = remaining;
      }

      console.log(`[parseAddress] 直辖市解析: "${address}" =>`, result);
      return result;
    }
  }

  // 非直辖市，按省/市/区解析

  // 格式1: 广东省深圳市南山区
  // 格式2: 广东 深圳 南山
  // 格式3: 广东深圳南山

  // 尝试匹配标准格式：省+市+区
  const fullPattern = /^(.+?(?:省|自治区|特别行政区))?(.+?(?:市|地区|州|盟))?(.+?(?:区|县|市|旗))?$/;
  const match = cleaned.match(fullPattern);

  if (match) {
    result.province = match[1] || '';
    result.city = match[2] || '';
    result.district = match[3] || '';
  }

  // 如果标准格式没匹配到，尝试用简称匹配
  if (!result.province && !result.city) {
    // 分割空格/分隔符
    const parts = cleaned.split(/[\s,，、\/]+/).filter(p => p);

    if (parts.length >= 1) {
      // 尝试从第一部分识别省份
      const firstPart = parts[0];

      // 检查是否是省份简称
      for (const [abbr, fullName] of Object.entries(PROVINCE_ABBREVIATIONS)) {
        if (firstPart.includes(abbr) || abbr.includes(firstPart)) {
          result.province = fullName;
          break;
        }
      }

      // 如果没有省份，但有多个部分，第一部分可能是省
      if (!result.province && parts.length >= 2) {
        // 尝试添加"省"
        if (!firstPart.endsWith('省') && !firstPart.endsWith('自治区')) {
          result.province = firstPart + '省';
        } else {
          result.province = firstPart;
        }
      }

      // 第二部分作为市
      if (parts.length >= 2) {
        const secondPart = parts[1];
        if (!secondPart.endsWith('市') && !secondPart.endsWith('地区')) {
          result.city = secondPart + '市';
        } else {
          result.city = secondPart;
        }
      }

      // 第三部分作为区
      if (parts.length >= 3) {
        const thirdPart = parts[2];
        if (!thirdPart.endsWith('区') && !thirdPart.endsWith('县') && !thirdPart.endsWith('市')) {
          result.district = thirdPart + '区';
        } else {
          result.district = thirdPart;
        }
      }
    }
  }

  // 进一步清理和标准化
  if (result.province) {
    result.province = result.province.trim();
  }
  if (result.city) {
    // 移除可能的前缀"省"
    result.city = result.city.replace(/^省/, '').trim();
  }
  if (result.district) {
    result.district = result.district.trim();
  }

  console.log(`[parseAddress] 地址解析: "${address}" =>`, result);
  return result;
}

/**
 * 解析学历/专业信息
 * @param {string} education - 学历信息
 * @returns {Object} 解析结果 { education, major }
 */
function parseEducation(education) {
  if (!education || typeof education !== 'string') {
    return { education: '', major: '' };
  }

  const result = {
    education: '',
    major: '',
    original: education
  };

  // 常见学历关键词
  const educationLevels = [
    '博士', '博士研究生',
    '硕士', '硕士研究生',
    '本科', '大学本科',
    '大专', '专科', '高职',
    '高中', '中专', '职高',
    '初中', '小学'
  ];

  // 尝试提取学历
  for (const level of educationLevels) {
    if (education.includes(level)) {
      result.education = level;
      break;
    }
  }

  // 尝试提取专业（通常在学历后面）
  if (result.education) {
    const idx = education.indexOf(result.education);
    const remaining = education.substring(idx + result.education.length).trim();
    // 专业通常跟在学历后面，或者用分隔符分开
    if (remaining) {
      result.major = remaining.replace(/^[，,、：:\s]+/, '').split(/[，,、]/)[0].trim();
    }
  }

  console.log(`[parseEducation] 学历解析: "${education}" =>`, result);
  return result;
}

/**
 * 解析行业/职位信息
 * @param {string} jobInfo - 职位信息
 * @returns {Object} 解析结果 { industry, position }
 */
function parseJobInfo(jobInfo) {
  if (!jobInfo || typeof jobInfo !== 'string') {
    return { industry: '', position: '' };
  }

  const result = {
    industry: '',
    position: '',
    original: jobInfo
  };

  // 常见行业关键词
  const industries = [
    '互联网', 'IT', '软件', '电子商务', '金融', '银行',
    '教育', '医疗', '房地产', '建筑', '制造业', '贸易',
    '咨询', '广告', '媒体', '文化', '物流', '零售'
  ];

  // 尝试提取行业
  for (const ind of industries) {
    if (jobInfo.includes(ind)) {
      result.industry = ind;
      break;
    }
  }

  // 剩余部分作为职位
  if (result.industry) {
    const idx = jobInfo.indexOf(result.industry);
    const remaining = jobInfo.substring(idx + result.industry.length).trim();
    if (remaining) {
      result.position = remaining.replace(/^[，,、：:\s]+/, '').split(/[，,、]/)[0].trim();
    }
  } else {
    // 如果没找到行业，可能整个字符串是职位
    result.position = jobInfo;
  }

  return result;
}

// ================== 数据绑定同步 ==================

/**
 * 触发数据同步，支持 Vue/React 等框架
 * @param {HTMLElement} element - 目标元素
 * @param {string} value - 要设置的值
 */
function triggerDataSync(element, value) {
  if (!element) return;

  // 确保元素是 INPUT 或 SELECT 类型
  const tagName = element.tagName;
  if (tagName !== 'INPUT' && tagName !== 'SELECT' && tagName !== 'TEXTAREA') {
    console.warn(`[triggerDataSync] 元素类型不支持: ${tagName}，使用默认值设置`);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  // 1. 设置值
  try {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      tagName === 'SELECT' ? HTMLSelectElement.prototype :
      tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      // 使用原生 setter 绕过 React 等框架的值保护
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value;
    }
  } catch (e) {
    console.warn('[triggerDataSync] 原生 setter 调用失败，使用默认方式:', e.message);
    element.value = value;
  }

  // 2. 触发事件序列（兼容各种框架）
  const events = [
    new Event('focus', { bubbles: true }),
    new Event('input', { bubbles: true }),
    new Event('change', { bubbles: true }),
    new Event('blur', { bubbles: true })
  ];

  events.forEach(event => {
    element.dispatchEvent(event);
  });

  // 3. 特殊处理 React
  // React 15 及以下版本使用 document.createEvent
  const inputEvent = document.createEvent('Event');
  inputEvent.initEvent('input', true, true);
  element.dispatchEvent(inputEvent);

  // 4. 特殊处理 Vue
  // Vue 通常监听 input 和 change 事件
  const vueInputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    data: value,
    inputType: 'insertText'
  });
  element.dispatchEvent(vueInputEvent);

  console.log(`[triggerDataSync] 已设置值并触发同步: "${value}"`);
}

/**
 * 触发 select 元素的 change 事件
 * @param {HTMLSelectElement} selectElement - select 元素
 */
function triggerSelectChange(selectElement) {
  if (!selectElement) return;

  // 触发多种事件以确保兼容性
  const events = ['click', 'focus', 'change', 'blur'];
  events.forEach(eventType => {
    selectElement.dispatchEvent(new Event(eventType, { bubbles: true }));
  });

  // 模拟用户点击选项
  if (selectElement.selectedIndex >= 0) {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (selectedOption) {
      selectedOption.dispatchEvent(new Event('click', { bubbles: true }));
    }
  }
}

// ================== 自定义组件级联识别 ==================

/**
 * UI框架类型枚举
 */
const UIFramework = {
  NATIVE: 'native',           // 原生 HTML 元素
  ELEMENT_UI: 'element-ui',   // Element UI (Vue)
  ANT_DESIGN: 'ant-design',   // Ant Design (React/Vue)
  VANT: 'vant',               // Vant (移动端 Vue)
  IVIEW: 'iview',             // iView (Vue)
  CUSTOM: 'custom'            // 自定义组件
};

/**
 * 检测元素所属的 UI 框架类型
 * @param {HTMLElement} element - 目标元素
 * @returns {string} UI 框架类型
 */
function detectUIFramework(element) {
  if (!element) return UIFramework.NATIVE;

  // Element UI 检测
  if (isElementUIComponent(element)) {
    return UIFramework.ELEMENT_UI;
  }

  // Ant Design 检测
  if (isAntDesignComponent(element)) {
    return UIFramework.ANT_DESIGN;
  }

  // Vant 检测
  if (isVantComponent(element)) {
    return UIFramework.VANT;
  }

  // iView 检测
  if (isIViewComponent(element)) {
    return UIFramework.IVIEW;
  }

  return UIFramework.NATIVE;
}

/**
 * 检测是否为 Element UI 组件
 * @param {HTMLElement} element - 目标元素
 * @returns {boolean}
 */
function isElementUIComponent(element) {
  const domEl = element.element || element;

  // 检测 Element UI 的特征类名
  const elementUIClasses = [
    'el-select', 'el-cascader', 'el-input',
    'el-date-editor', 'el-form-item'
  ];

  // 检查自身类名
  for (const cls of elementUIClasses) {
    if (domEl.classList && domEl.classList.contains(cls)) {
      return true;
    }
  }

  // 检查父元素
  const parent = domEl.closest('.el-select, .el-cascader, .el-form-item');
  if (parent) {
    return true;
  }

  // 检测 Vue 实例上的 Element UI 特征
  if (domEl.__vue__ && domEl.__vue__.$options.name) {
    const name = domEl.__vue__.$options.name.toLowerCase();
    if (name.startsWith('el')) {
      return true;
    }
  }

  return false;
}

/**
 * 检测是否为 Ant Design 组件
 * @param {HTMLElement} element - 目标元素
 * @returns {boolean}
 */
function isAntDesignComponent(element) {
  const domEl = element.element || element;

  // 检测 Ant Design 的特征类名
  const antdClasses = [
    'ant-select', 'ant-cascader', 'ant-input',
    'ant-picker', 'ant-form-item'
  ];

  // 检查自身类名
  for (const cls of antdClasses) {
    if (domEl.classList && domEl.classList.contains(cls)) {
      return true;
    }
  }

  // 检查父元素
  const parent = domEl.closest('.ant-select, .ant-cascader, .ant-form-item');
  if (parent) {
    return true;
  }

  // 检测 React 属性
  const reactKey = Object.keys(domEl).find(key => key.startsWith('__reactProps') || key.startsWith('__reactFiber'));
  if (reactKey && domEl.classList.contains('ant-select-selector')) {
    return true;
  }

  return false;
}

/**
 * 检测是否为 Vant 组件
 * @param {HTMLElement} element - 目标元素
 * @returns {boolean}
 */
function isVantComponent(element) {
  const domEl = element.element || element;

  const vantClasses = ['van-picker', 'van-field', 'van-cascader', 'van-select'];

  for (const cls of vantClasses) {
    if (domEl.classList && domEl.classList.contains(cls)) {
      return true;
    }
  }

  const parent = domEl.closest('.van-picker, .van-field, .van-cascader');
  return !!parent;
}

/**
 * 检测是否为 iView 组件
 * @param {HTMLElement} element - 目标元素
 * @returns {boolean}
 */
function isIViewComponent(element) {
  const domEl = element.element || element;

  const iviewClasses = ['ivu-select', 'ivu-cascader', 'ivu-input', 'ivu-form-item'];

  for (const cls of iviewClasses) {
    if (domEl.classList && domEl.classList.contains(cls)) {
      return true;
    }
  }

  const parent = domEl.closest('.ivu-select, .ivu-cascader, .ivu-form-item');
  return !!parent;
}

/**
 * 识别 Vant 组件详细信息
 * @param {HTMLElement} element - 目标元素
 * @returns {Object|null} 组件信息
 */
function identifyVantComponent(element) {
  if (!element) return null;

  const domEl = element.element || element;

  // 检测 van-field
  const fieldWrapper = domEl.closest ? domEl.closest('.van-field') : null;
  if (fieldWrapper) {
    const input = fieldWrapper.querySelector('input, textarea');
    const label = fieldWrapper.querySelector('.van-field__label')?.textContent.trim() || '';

    return {
      type: 'vant-field',
      wrapper: fieldWrapper,
      input: input || fieldWrapper,
      label: label
    };
  }

  // 检测 van-picker
  const pickerWrapper = domEl.closest ? domEl.closest('.van-picker') : null;
  if (pickerWrapper) {
    const label = pickerWrapper.querySelector('.van-field__label')?.textContent.trim() || '';

    return {
      type: 'vant-picker',
      wrapper: pickerWrapper,
      input: null,
      label: label
    };
  }

  return null;
}

/**
 * 识别 iView 组件详细信息
 * @param {HTMLElement} element - 目标元素
 * @returns {Object|null} 组件信息
 */
function identifyIViewComponent(element) {
  if (!element) return null;

  const domEl = element.element || element;

  // 检测 ivu-select
  const selectWrapper = domEl.closest ? domEl.closest('.ivu-select') : null;
  if (selectWrapper) {
    const input = selectWrapper.querySelector('input');
    const formItem = selectWrapper.closest('.ivu-form-item');
    const label = formItem ? formItem.querySelector('.ivu-form-item-label')?.textContent.trim() : '';

    return {
      type: 'ivu-select',
      wrapper: selectWrapper,
      input: input || selectWrapper.querySelector('.ivu-select-selection'),
      label: label
    };
  }

  // 检测 ivu-input-wrapper
  const inputWrapper = domEl.closest ? domEl.closest('.ivu-input-wrapper') : null;
  if (inputWrapper) {
    // 跳过 select 内的 input
    if (inputWrapper.closest('.ivu-select, .ivu-cascader')) {
      return null;
    }

    const input = inputWrapper.querySelector('input, textarea');
    const formItem = inputWrapper.closest('.ivu-form-item');
    const label = formItem ? formItem.querySelector('.ivu-form-item-label')?.textContent.trim() : '';

    return {
      type: 'ivu-input',
      wrapper: inputWrapper,
      input: input || inputWrapper,
      label: label
    };
  }

  return null;
}

/**
 * 自定义组件级联检测器
 * 扩展 CascadingSelect 类以支持 Element UI / Ant Design 等组件
 */
class CustomComponentCascading {

  constructor() {
    // 检测到的自定义组件级联组
    this.customGroups = [];
  }

  /**
   * 检测页面中的自定义组件级联选择器
   * @param {Array} formElements - 表单元素列表
   * @returns {Array} 检测到的自定义组件级联组
   */
  detect(formElements) {
    console.log('[CustomComponentCascading] 开始检测自定义组件级联...');
    this.customGroups = [];

    // 按UI框架分组
    const frameworkGroups = {
      [UIFramework.ELEMENT_UI]: [],
      [UIFramework.ANT_DESIGN]: [],
      [UIFramework.VANT]: [],
      [UIFramework.IVIEW]: [],
      [UIFramework.CUSTOM]: []
    };

    // 分类元素
    formElements.forEach(el => {
      const framework = detectUIFramework(el);
      if (framework !== UIFramework.NATIVE) {
        frameworkGroups[framework].push(el);
      }
    });

    // 检测 Element UI 级联选择器
    if (frameworkGroups[UIFramework.ELEMENT_UI].length > 0) {
      const elUIGroups = this.detectElementUICascading(frameworkGroups[UIFramework.ELEMENT_UI]);
      this.customGroups.push(...elUIGroups);
    }

    // 检测 Ant Design 级联选择器
    if (frameworkGroups[UIFramework.ANT_DESIGN].length > 0) {
      const antdGroups = this.detectAntDesignCascading(frameworkGroups[UIFramework.ANT_DESIGN]);
      this.customGroups.push(...antdGroups);
    }

    console.log(`[CustomComponentCascading] 检测到 ${this.customGroups.length} 个自定义组件级联组`);
    return this.customGroups;
  }

  /**
   * 检测 Element UI 级联选择器
   * @param {Array} elements - Element UI 元素列表
   * @returns {Array} 检测到的级联组
   */
  detectElementUICascading(elements) {
    const groups = [];

    elements.forEach(el => {
      const domEl = el.element || el;

      // 检测 el-cascader (Element UI 级联选择器)
      const cascader = domEl.closest ? domEl.closest('.el-cascader') : null;
      if (cascader) {
        groups.push({
          groupId: `el_cascader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'custom',
          subtype: 'element-ui-cascader',
          framework: UIFramework.ELEMENT_UI,
          element: cascader,
          label: this.extractElementUILabel(cascader),
          // el-cascader 内部处理了级联逻辑
          isCascaderComponent: true,
          levels: [{ level: 1, element: cascader }]
        });
        return;
      }

      // 检测多个 el-select 组成的级联
      const selectWrapper = domEl.closest ? domEl.closest('.el-select') : null;
      if (selectWrapper) {
        // 根据标签判断是否为级联组的一部分
        const label = this.extractElementUILabel(selectWrapper);
        const cascadeType = this.inferCascadeType(label);
        if (cascadeType) {
          groups.push({
            groupId: `el_select_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: cascadeType,
            framework: UIFramework.ELEMENT_UI,
            element: selectWrapper,
            label: label,
            isSelectComponent: true,
            levels: [{ level: 1, element: selectWrapper, label }]
          });
        }
      }
    });

    // 尝试合并相邻的 el-select 为级联组
    return this.mergeElementUISelects(groups);
  }

  /**
   * 检测 Ant Design 级联选择器
   * @param {Array} elements - Ant Design 元素列表
   * @returns {Array} 检测到的级联组
   */
  detectAntDesignCascading(elements) {
    const groups = [];

    elements.forEach(el => {
      const domEl = el.element || el;

      // 检测 ant-cascader (Ant Design 级联选择器)
      const cascader = domEl.closest ? domEl.closest('.ant-cascader') : null;
      if (cascader) {
        groups.push({
          groupId: `antd_cascader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'custom',
          subtype: 'ant-design-cascader',
          framework: UIFramework.ANT_DESIGN,
          element: cascader,
          label: this.extractAntDesignLabel(cascader),
          isCascaderComponent: true,
          levels: [{ level: 1, element: cascader }]
        });
        return;
      }

      // 检测多个 ant-select 组成的级联
      const selectWrapper = domEl.closest ? domEl.closest('.ant-select') : null;
      if (selectWrapper) {
        const label = this.extractAntDesignLabel(selectWrapper);
        const cascadeType = this.inferCascadeType(label);
        if (cascadeType) {
          groups.push({
            groupId: `antd_select_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: cascadeType,
            framework: UIFramework.ANT_DESIGN,
            element: selectWrapper,
            label: label,
            isSelectComponent: true,
            levels: [{ level: 1, element: selectWrapper, label }]
          });
        }
      }
    });

    return this.mergeAntDesignSelects(groups);
  }

  /**
   * 提取 Element UI 组件的标签
   * @param {HTMLElement} element - 组件元素
   * @returns {string} 标签文本
   */
  extractElementUILabel(element) {
    // 查找表单项容器
    const formItem = element.closest('.el-form-item');
    if (formItem) {
      const labelEl = formItem.querySelector('.el-form-item__label');
      if (labelEl) {
        return labelEl.textContent.trim();
      }
    }

    // 查找前置 label
    const prev = element.previousElementSibling;
    if (prev && prev.tagName === 'LABEL') {
      return prev.textContent.trim();
    }

    return '';
  }

  /**
   * 提取 Ant Design 组件的标签
   * @param {HTMLElement} element - 组件元素
   * @returns {string} 标签文本
   */
  extractAntDesignLabel(element) {
    // 查找表单项容器
    const formItem = element.closest('.ant-form-item');
    if (formItem) {
      const labelEl = formItem.querySelector('.ant-form-item-label label');
      if (labelEl) {
        return labelEl.textContent.trim();
      }
    }

    // 查找前置 label
    const prev = element.previousElementSibling;
    if (prev && prev.tagName === 'LABEL') {
      return prev.textContent.trim();
    }

    return '';
  }

  /**
   * 根据标签推断级联类型
   * @param {string} label - 标签文本
   * @returns {string|null} 级联类型
   */
  inferCascadeType(label) {
    const labelLower = (label || '').toLowerCase();

    // 省市区
    if (['省', '市', '区', '县', '地址', '居住地', '籍贯'].some(kw => labelLower.includes(kw))) {
      return 'region';
    }

    // 行业职位
    if (['行业', '职位', '岗位'].some(kw => labelLower.includes(kw))) {
      return 'industry_job';
    }

    // 学历专业
    if (['学历', '专业'].some(kw => labelLower.includes(kw))) {
      return 'education_major';
    }

    // 学校院系
    if (['学校', '院系', '院校'].some(kw => labelLower.includes(kw))) {
      return 'school_department';
    }

    return null;
  }

  /**
   * 合并 Element UI Select 为级联组
   * @param {Array} groups - 检测到的组
   * @returns {Array} 合并后的组
   */
  mergeElementUISelects(groups) {
    // 按类型分组并尝试合并
    const typeGroups = {};

    groups.forEach(group => {
      if (group.type && group.type !== 'custom') {
        if (!typeGroups[group.type]) {
          typeGroups[group.type] = [];
        }
        typeGroups[group.type].push(group);
      }
    });

    const merged = [];

    // 对于每种类型，检查DOM相邻性
    Object.entries(typeGroups).forEach(([type, items]) => {
      if (items.length >= 2) {
        // 检查是否DOM相邻
        items.sort((a, b) => {
          const posA = a.element.getBoundingClientRect ? a.element.getBoundingClientRect().left : 0;
          const posB = b.element.getBoundingClientRect ? b.element.getBoundingClientRect().left : 0;
          return posA - posB;
        });

        // 检查是否在同一表单项组中
        const sameContainer = items.every(item => {
          const container = item.element.closest('.el-form, .el-row, form');
          return container === items[0].element.closest('.el-form, .el-row, form');
        });

        if (sameContainer) {
          // 合并为一个级联组
          merged.push({
            groupId: `el_cascade_${type}_${Date.now()}`,
            type: type,
            framework: UIFramework.ELEMENT_UI,
            levels: items.map((item, idx) => ({
              level: idx + 1,
              element: item.element,
              label: item.label
            })),
            elements: items.map(item => item.element)
          });
        } else {
          merged.push(...items);
        }
      } else {
        merged.push(...items);
      }
    });

    // 添加单元素级联组件
    groups.filter(g => g.type === 'custom').forEach(g => merged.push(g));

    return merged;
  }

  /**
   * 合并 Ant Design Select 为级联组
   * @param {Array} groups - 检测到的组
   * @returns {Array} 合并后的组
   */
  mergeAntDesignSelects(groups) {
    // 与 Element UI 类似的逻辑
    const typeGroups = {};

    groups.forEach(group => {
      if (group.type && group.type !== 'custom') {
        if (!typeGroups[group.type]) {
          typeGroups[group.type] = [];
        }
        typeGroups[group.type].push(group);
      }
    });

    const merged = [];

    Object.entries(typeGroups).forEach(([type, items]) => {
      if (items.length >= 2) {
        items.sort((a, b) => {
          const posA = a.element.getBoundingClientRect ? a.element.getBoundingClientRect().left : 0;
          const posB = b.element.getBoundingClientRect ? b.element.getBoundingClientRect().left : 0;
          return posA - posB;
        });

        const sameContainer = items.every(item => {
          const container = item.element.closest('.ant-form, .ant-row, form');
          return container === items[0].element.closest('.ant-form, .ant-row, form');
        });

        if (sameContainer) {
          merged.push({
            groupId: `antd_cascade_${type}_${Date.now()}`,
            type: type,
            framework: UIFramework.ANT_DESIGN,
            levels: items.map((item, idx) => ({
              level: idx + 1,
              element: item.element,
              label: item.label
            })),
            elements: items.map(item => item.element)
          });
        } else {
          merged.push(...items);
        }
      } else {
        merged.push(...items);
      }
    });

    groups.filter(g => g.type === 'custom').forEach(g => merged.push(g));

    return merged;
  }

  /**
   * 填写 Element UI 级联选择器
   * @param {Object} group - 级联组
   * @param {string} value - 要填写的值
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 填写结果
   */
  async fillElementUICascader(group, value, options = {}) {
    console.log(`[CustomComponentCascading] 填写 Element UI 级联: "${value}"`);

    const element = group.element;

    // 1. 点击打开选择器
    const input = element.querySelector('.el-input__inner, input');
    if (input) {
      input.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 2. 解析值（如省市区）
    const parsed = parseAddress(value);
    const values = [parsed.province, parsed.city, parsed.district].filter(v => v);

    // 3. 等待下拉面板出现
    const panel = await this.waitForElement('.el-cascader__dropdown, .el-cascader-menus', 3000);
    if (!panel) {
      return { success: false, reason: '级联面板未出现' };
    }

    // 4. 逐级选择
    for (let i = 0; i < values.length; i++) {
      const targetValue = values[i];
      const menu = panel.querySelectorAll('.el-cascader-menu')[i];
      if (!menu) {
        return { success: false, reason: `第${i + 1}级菜单未找到` };
      }

      // 查找匹配项
      const items = menu.querySelectorAll('.el-cascader-node');
      let found = false;
      for (const item of items) {
        const text = item.textContent.trim();
        if (text.includes(targetValue) || targetValue.includes(text.replace(/省|市|区|县/g, ''))) {
          item.click();
          await new Promise(resolve => setTimeout(resolve, 200));
          found = true;
          break;
        }
      }

      if (!found) {
        return { success: false, reason: `未找到匹配项: ${targetValue}` };
      }
    }

    // 5. 关闭面板（点击最后一级后会自动关闭）

    return { success: true, values };
  }

  /**
   * 填写 Ant Design 级联选择器
   * @param {Object} group - 级联组
   * @param {string} value - 要填写的值
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 填写结果
   */
  async fillAntDesignCascader(group, value, options = {}) {
    console.log(`[CustomComponentCascading] 填写 Ant Design 级联: "${value}"`);

    const element = group.element;

    // 1. 点击打开选择器
    const input = element.querySelector('.ant-select-selector, input');
    if (input) {
      input.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 2. 解析值
    const parsed = parseAddress(value);
    const values = [parsed.province, parsed.city, parsed.district].filter(v => v);

    // 3. 等待下拉面板出现
    const dropdown = await this.waitForElement('.ant-select-dropdown, .ant-cascader-dropdown', 3000);
    if (!dropdown) {
      return { success: false, reason: '级联面板未出现' };
    }

    // 4. 逐级选择
    for (let i = 0; i < values.length; i++) {
      const targetValue = values[i];
      const menus = dropdown.querySelectorAll('.ant-cascader-menu');
      const menu = menus[i];
      if (!menu) {
        return { success: false, reason: `第${i + 1}级菜单未找到` };
      }

      // 查找匹配项
      const items = menu.querySelectorAll('.ant-cascader-menu-item');
      let found = false;
      for (const item of items) {
        const text = item.textContent.trim();
        if (text.includes(targetValue) || targetValue.includes(text.replace(/省|市|区|县/g, ''))) {
          item.click();
          await new Promise(resolve => setTimeout(resolve, 200));
          found = true;
          break;
        }
      }

      if (!found) {
        return { success: false, reason: `未找到匹配项: ${targetValue}` };
      }
    }

    return { success: true, values };
  }

  /**
   * 等待元素出现
   * @param {string} selector - CSS选择器
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<HTMLElement|null>}
   */
  async waitForElement(selector, timeout = 3000) {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * 智能填写自定义组件级联
   * @param {Object} group - 级联组
   * @param {string} value - 要填写的值
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} 填写结果
   */
  async smartFill(group, value, options = {}) {
    if (group.framework === UIFramework.ELEMENT_UI) {
      if (group.isCascaderComponent) {
        return this.fillElementUICascader(group, value, options);
      }
    }

    if (group.framework === UIFramework.ANT_DESIGN) {
      if (group.isCascaderComponent) {
        return this.fillAntDesignCascader(group, value, options);
      }
    }

    // 默认返回不支持
    return {
      success: false,
      reason: `不支持的组件类型: ${group.framework}`,
      group
    };
  }
}


// ================== index.js ==================
/**
 * 简历自动填写助手 - Content Script
 * 注入到网页中，负责表单识别和填写
 */

// API基础地址
const API_BASE = 'http://127.0.0.1:8001';

// 当前脚本版本（每次更新时修改）
const SCRIPT_VERSION = '1.6.1';

// 可视化反馈实例
let visualFeedback = null;

// 级联选择检测器实例
let cascadingSelect = null;

// 安全发送消息到扩展（处理扩展刷新后连接断开的情况）
function safeSendMessage(message) {
  try {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(message);
    }
  } catch (e) {
    console.log('[简历助手] 扩展连接已断开，请刷新页面');
  }
}

// 安全发送消息并等待响应（带超时处理）
function safeSendMessageWithResponse(message, timeout = 30000) {
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeoutId = setTimeout(() => {
      reject(new Error('消息请求超时'));
    }, timeout);

    try {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        clearTimeout(timeoutId);
        reject(new Error('扩展连接不可用'));
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeoutId);

        // 检查是否有运行时错误
        if (chrome.runtime.lastError) {
          console.error('[简历助手] 消息发送错误:', chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      console.log('[简历助手] 扩展连接已断开，请刷新页面');
      reject(e);
    }
  });
}

// 检查版本是否更新
function checkVersionUpdate() {
  const storageKey = 'resume-filler-script-version';
  const lastVersion = localStorage.getItem(storageKey);

  console.log(`[简历助手] 当前版本: ${SCRIPT_VERSION}, 上次版本: ${lastVersion}`);

  if (lastVersion && lastVersion !== SCRIPT_VERSION) {
    // 版本已更新，显示刷新提示
    console.log('[简历助手] 检测到版本更新，显示刷新提示');
    showRefreshPrompt();
  }

  // 保存当前版本
  localStorage.setItem(storageKey, SCRIPT_VERSION);
}

// 浮动弹窗相关变量
let floatingPopup = null;
let shadowRoot = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragStartPosition = { x: 0, y: 0 };
let hasMoved = false;

// 版本列表缓存
let cachedVersions = null;
let versionsLoadingTime = 0;

// 填写状态
let fillingState = {
  isRunning: false,
  isPaused: false,
  currentIndex: 0,
  formElements: [],
  resumeData: null,
  isRestart: false  // 是否为重新填写模式（重新填写时覆盖已有内容）
};

// ================== 填写报告系统（全局） ==================
// 记录每个字段的填写状态，供 MCP 分析
let fillingReport = {
  startTime: null,
  endTime: null,
  totalFields: 0,
  fields: [],
  summary: { success: 0, failed: 0, skipped: 0, noMapping: 0 }
};

// 重置报告
function resetFillingReport(totalFields) {
  fillingReport = {
    startTime: new Date().toISOString(),
    endTime: null,
    totalFields: totalFields,
    fields: [],
    summary: { success: 0, failed: 0, skipped: 0, noMapping: 0 }
  };
}

// 记录单个字段状态
function recordFieldStatus(index, field, status, details = {}) {
  if (!field) return;
  fillingReport.fields.push({
    index,
    label: field.label || field.name || field.id || `字段${index}`,
    type: field.type,
    status, // 'success' | 'failed' | 'skipped' | 'no_mapping'
    readSuccess: details.readSuccess !== false,
    mapSuccess: details.mapSuccess !== false,
    mapValue: details.mapValue || null,
    fillSuccess: details.fillSuccess === true,
    reason: details.reason || null
  });
}

// 输出精简报告 - 只输出失败和跳过的字段
function outputFillingReport() {
  fillingReport.endTime = new Date().toISOString();
  fillingReport.summary = {
    success: fillingReport.fields.filter(f => f.status === 'success').length,
    failed: fillingReport.fields.filter(f => f.status === 'failed').length,
    skipped: fillingReport.fields.filter(f => f.status === 'skipped').length,
    noMapping: fillingReport.fields.filter(f => f.status === 'no_mapping').length
  };

  // 只记录失败和跳过的字段
  const problemFields = fillingReport.fields.filter(f =>
    f.status === 'failed' || f.status === 'skipped' || f.status === 'no_mapping'
  );

  // 精简报告结构
  const report = {
    total: fillingReport.totalFields,
    ok: fillingReport.summary.success,
    issues: problemFields.map(f => {
      // 确定问题阶段
      let stage = '';
      if (!f.readSuccess) {
        stage = '读取失败';
      } else if (!f.mapSuccess) {
        stage = '无映射值';
      } else if (!f.fillSuccess) {
        stage = '填写失败';
      } else if (f.status === 'skipped') {
        stage = '已跳过';
      }

      return {
        field: f.label,
        type: f.type,
        stage: stage,
        reason: f.reason || null
      };
    })
  };

  // 输出报告到控制台（单行 JSON，方便 MCP 解析）
  console.log('[简历助手报告]', JSON.stringify(report));

  // 发送报告到后端
  sendReportToBackend(report);

  return fillingReport;
}

// 发送报告到后端
async function sendReportToBackend(report) {
  try {
    const response = await fetch('http://127.0.0.1:8001/api/resume/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(report)
    });

    if (response.ok) {
      console.log('[简历助手] 报告已发送到后端');
    } else {
      console.log('[简历助手] 报告发送失败:', response.status);
    }
  } catch (e) {
    console.log('[简历助手] 报告发送出错:', e.message);
  }
}

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    // 响应ping请求，用于检测content script是否已加载
    sendResponse({ status: 'ok', version: SCRIPT_VERSION });
    return true;
  } else if (message.action === 'togglePopup') {
    toggleFloatingPopup();
    sendResponse({ status: 'ok' });
  } else if (message.action === 'startFilling') {
    startAutoFilling();
    sendResponse({ status: 'ok' });
  } else if (message.action === 'pauseFilling') {
    pauseFilling();
    sendResponse({ status: 'ok' });
  } else if (message.action === 'continueFilling') {
    continueFilling();
    sendResponse({ status: 'ok' });
  } else if (message.action === 'extensionUpdated') {
    // 扩展已更新，显示刷新提示
    showUpdateNotification(message.previousVersion, message.currentVersion);
    sendResponse({ status: 'ok' });
  } else if (message.action === 'showRefreshPrompt') {
    // 首次注入，显示刷新提示
    showRefreshPrompt();
    sendResponse({ status: 'ok' });
  } else {
    sendResponse({ status: 'unknown' });
  }
  return true;
});

// ================== 浮动弹窗相关函数 ==================

function toggleFloatingPopup() {
  if (!floatingPopup) {
    createFloatingPopup();
  }
  const isVisible = floatingPopup.style.display === 'block';
  console.log('[简历助手] toggleFloatingPopup called, isVisible:', isVisible);
  floatingPopup.style.display = isVisible ? 'none' : 'block';

  // 打开弹窗时预加载版本列表（后台静默加载）
  if (!isVisible && !cachedVersions) {
    fetch(`${API_BASE}/api/resume/versions`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          cachedVersions = data.data;
          versionsLoadingTime = Date.now();
        }
      })
      .catch(() => {});
  }
}

function createFloatingPopup() {
  // 创建容器
  floatingPopup = document.createElement('div');
  floatingPopup.id = 'resume-filler-container';
  floatingPopup.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    display: none;
  `;

  // ================== 只阻止事件向外部传播 ==================
  // 注意：不能使用 stopImmediatePropagation()，否则会阻止 Shadow DOM 内部的事件监听器
  // 重要：不能阻止 mouseup 事件，否则 window 上的 stopDrag 监听器无法收到事件
  ['click', 'mousedown'].forEach(eventType => {
    floatingPopup.addEventListener(eventType, (e) => {
      e.stopPropagation(); // 只阻止冒泡，不阻止捕获和当前目标的其他监听器
    }, false); // 只在冒泡阶段处理
  });

  // 使用Shadow DOM隔离样式
  shadowRoot = floatingPopup.attachShadow({ mode: 'open' });

  // 注入样式 - 与 popup/index.html 保持一致
  const style = document.createElement('style');
  style.textContent = `
    /* Shadow DOM 样式 - 使用实际值而非CSS变量 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    .container {
      width: 320px;
      min-height: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f5f7fa;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      line-height: 1.3;
      padding: 12px;
    }
    .header {
      position: relative;
      text-align: center;
      padding: 16px 0;
      border-bottom: 2px solid #e8e8e8;
      margin-bottom: 12px;
      user-select: none;
      background: linear-gradient(135deg, #f5f7fa 0%, #e8e8e8 100%);
      border-radius: 8px 8px 0 0;
    }
    .header:hover {
      background: linear-gradient(135deg, #e8f4f8 0%, #d0e8f0 100%);
    }
    .header h1 {
      font-size: 18px;
      color: #262626;
      font-weight: 600;
    }
    .header-hint {
      font-size: 11px;
      color: #999;
      margin-top: 4px;
    }
    .container {
      cursor: default;
    }
    .container:active {
      cursor: move;
    }
    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 18px;
      color: #999;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .close-btn:hover {
      background: #f5f5f5;
      color: #f14072;
    }
    .btn-restart {
      margin-top: 8px;
      background: #52c41a;
      color: white;
      border-color: #52c41a;
    }
    .btn-restart:hover {
      background: #389e0d;
      border-color: #389e0d;
    }
    .section {
      background: #ffffff;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .btn {
      width: 100%;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .btn:last-child {
      margin-bottom: 0;
    }
    .btn-primary {
      background: #8bbeee;
      color: #fff;
      box-shadow: 0 2px 4px rgba(139, 190, 238, 0.3);
    }
    .btn-primary:hover {
      background: #5197d4;
      box-shadow: 0 4px 8px rgba(139, 190, 238, 0.4);
    }
    .btn-primary:active {
      background: #3d7ab3;
    }
    .btn-secondary {
      background: #ffffff;
      color: #262626;
      border: 1px solid #e8e8e8;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .btn-secondary:hover {
      background: #fafafa;
      border-color: #d9d9d9;
      color: #5197d4;
    }
    .btn-success {
      background: #fadb2f;
      color: #333;
      box-shadow: 0 2px 4px rgba(250, 219, 47, 0.3);
    }
    .btn-success:hover {
      background: #f5c800;
    }
    .btn-warning {
      background: #d178f1;
      color: #fff;
      box-shadow: 0 2px 4px rgba(209, 120, 241, 0.3);
    }
    .btn-warning:hover {
      background: #b85cd9;
    }
    .btn-danger {
      background: #f14072;
      color: #fff;
    }
    .btn-danger:hover {
      background: #d92a5a;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }
    .status {
      font-size: 12px;
      text-align: center;
      padding: 8px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      line-height: 1.3;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      animation: pulse 2s infinite;
      flex-shrink: 0;
    }
    .status--waiting .status-dot {
      background: #8c8c8c;
      animation: none;
    }
    .status--running .status-dot {
      background: #8bbeee;
    }
    .status--paused .status-dot {
      background: #d178f1;
      animation: none;
    }
    .status--success .status-dot {
      background: #fadb2f;
      animation: none;
    }
    .status--error .status-dot {
      background: #f14072;
      animation: none;
    }
    .status--waiting { color: #8c8c8c; }
    .status--running { color: #5197d4; }
    .status--paused { color: #d178f1; }
    .status--success { color: #c9a800; }
    .status--error { color: #f14072; }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }
    /* 进度区域样式 */
    .progress-area {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
      display: none;
      font-size: 12px;
    }
    .progress-area.show {
      display: block;
    }
    /* 里程碑样式 */
    .milestone {
      display: flex;
      align-items: flex-start;
      padding: 10px;
      margin-bottom: 8px;
      background: #ffffff;
      border-radius: 6px;
      border-left: 3px solid #8bbeee;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      transition: all 0.3s ease;
    }
    .milestone.active {
      border-left-color: #52c41a;
      background: linear-gradient(90deg, rgba(82,196,26,0.05) 0%, #ffffff 100%);
    }
    .milestone.success {
      border-left-color: #52c41a;
      background: linear-gradient(90deg, rgba(82,196,26,0.1) 0%, #ffffff 100%);
    }
    .milestone.error {
      border-left-color: #f5222d;
      background: linear-gradient(90deg, rgba(245,34,45,0.05) 0%, #ffffff 100%);
    }
    .milestone-icon {
      font-size: 18px;
      margin-right: 10px;
      flex-shrink: 0;
    }
    .milestone-content {
      flex: 1;
      min-width: 0;
    }
    .milestone-title {
      font-weight: 500;
      color: #262626;
      margin-bottom: 4px;
    }
    .milestone-detail {
      font-size: 11px;
      color: #8c8c8c;
      line-height: 1.4;
    }
    /* 实时进度摘要 */
    .progress-summary {
      font-size: 11px;
      color: #595959;
      padding: 8px 10px;
      background: #e6f7ff;
      border-radius: 4px;
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .progress-summary .stat {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .progress-summary .stat-value {
      font-weight: 600;
      color: #1890ff;
    }
    .progress-summary .stat-success {
      color: #52c41a;
    }
    .progress-summary .stat-fail {
      color: #f5222d;
    }
    .progress-summary .stat-skip {
      color: #faad14;
    }
    /* 进度条样式 */
    .upload-progress,
    .parse-progress {
      margin-top: 12px;
    }
    .progress-bar-container {
      width: 100%;
      height: 8px;
      background: #e8e8e8;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #8bbeee, #5197d4);
      border-radius: 4px;
      transition: width 0.3s ease;
      width: 0%;
    }
    .parse-progress .progress-bar {
      background: linear-gradient(90deg, #fadb2f, #f5c800);
    }
    .progress-text {
      font-size: 12px;
      color: #595959;
      text-align: center;
      margin-top: 6px;
      line-height: 1.3;
    }
    @keyframes progressIndeterminate {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    .progress-bar.indeterminate {
      width: 50% !important;
      animation: progressIndeterminate 1.5s infinite ease-in-out;
    }
    /* 弹窗样式 */
    .modal-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
    }
    .modal-overlay.show {
      opacity: 1;
      visibility: visible;
    }
    .modal-content {
      background: #ffffff;
      border-radius: 8px;
      width: 280px;
      max-width: 90%;
      max-height: 80%;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      transform: scale(0.9) translateY(-10px);
      transition: transform 0.2s ease;
    }
    .modal-overlay.show .modal-content {
      transform: scale(1) translateY(0);
    }
    .modal-content-center {
      padding: 24px;
      text-align: center;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e8e8e8;
      font-size: 14px;
      font-weight: 500;
    }
    .modal-close-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #8c8c8c;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .modal-close-btn:hover {
      background: #f5f5f5;
      color: #262626;
    }
    .modal-body {
      padding: 8px;
      max-height: 220px;
      overflow-y: auto;
    }
    .modal-title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 12px;
      color: #262626;
    }
    .modal-desc {
      font-size: 13px;
      color: #595959;
      margin-bottom: 16px;
      line-height: 1.5;
    }
    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .btn-cancel {
      padding: 8px 16px;
      border: 1px solid #e8e8e8;
      border-radius: 4px;
      background: #ffffff;
      cursor: pointer;
      color: #595959;
      transition: all 0.2s;
    }
    .btn-cancel:hover {
      border-color: #8bbeee;
      color: #8bbeee;
    }
    .btn-confirm {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: #8bbeee;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-confirm:hover {
      background: #5197d4;
    }
    .btn-confirm.btn-danger {
      background: #f14072;
    }
    .btn-confirm.btn-danger:hover {
      background: #d92a5a;
    }
    /* 版本列表项样式 */
    .version-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #e8e8e8;
      transition: background 0.2s;
    }
    .version-item:last-child {
      border-bottom: none;
    }
    .version-item:hover {
      background: rgba(139, 190, 238, 0.15);
    }
    .version-info {
      flex: 1;
      min-width: 0;
    }
    .version-name {
      font-size: 13px;
      font-weight: 500;
      color: #262626;
      margin-bottom: 4px;
    }
    .version-meta {
      font-size: 11px;
      color: #8c8c8c;
      line-height: 1.4;
    }
    .version-actions {
      display: flex;
      gap: 6px;
      margin-left: 8px;
    }
    .version-btn {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .version-btn-load {
      background: rgba(139, 190, 238, 0.15);
      color: #5197d4;
    }
    .version-btn-load:hover {
      background: #8bbeee;
      color: #fff;
    }
    .version-btn-use {
      background: rgba(250, 219, 47, 0.15);
      color: #b8a000;
    }
    .version-btn-use:hover {
      background: #fadb2f;
      color: #333;
    }
    .version-btn-delete {
      background: rgba(241, 64, 114, 0.15);
      color: #f14072;
    }
    .version-btn-delete:hover {
      background: #f14072;
      color: #fff;
    }
    .no-versions {
      text-align: center;
      padding: 24px 16px;
      color: #8c8c8c;
    }
    .no-versions-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      opacity: 0.5;
    }
    .no-versions-text {
      font-size: 13px;
      margin-bottom: 4px;
    }
    .no-versions-hint {
      font-size: 12px;
    }
  `;
  shadowRoot.appendChild(style);

  // 注入HTML
  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <div class="header" id="popupHeader">
      <h1>简历自动填写助手</h1>
      <button class="close-btn" id="closeBtn" title="关闭">✕</button>
    </div>

    <div class="section">
      <button class="btn btn-primary" id="uploadBtn">上传简历</button>
      <button class="btn btn-secondary" id="editBtn">编辑信息</button>
      <button class="btn btn-secondary" id="versionBtn">选择历史版本</button>

      <!-- 上传进度条 -->
      <div class="upload-progress" id="uploadProgress" style="display: none;">
        <div class="progress-bar-container">
          <div class="progress-bar" id="uploadProgressBar"></div>
        </div>
        <div class="progress-text" id="uploadProgressText">上传中... 0%</div>
      </div>

      <!-- 解析进度条 -->
      <div class="parse-progress" id="parseProgress" style="display: none;">
        <div class="progress-bar-container">
          <div class="progress-bar indeterminate" id="parseProgressBar"></div>
        </div>
        <div class="progress-text" id="parseProgressText">解析中...</div>
      </div>
    </div>

    <div class="section">
      <button class="btn btn-success" id="startBtn">开始填写</button>
      <button class="btn btn-warning" id="pauseBtn" style="display:none;">暂停</button>
      <button class="btn btn-primary" id="continueBtn" style="display:none;">继续</button>
      <button class="btn btn-restart" id="restartBtn">重新填写</button>
    </div>

    <!-- 进度区域 -->
    <div class="section">
      <button class="btn btn-secondary" id="logToggle">显示进度</button>
      <div class="progress-area" id="logArea">
        <!-- 里程碑信息 -->
        <div class="milestone" id="milestone-identify" style="display: none;">
          <div class="milestone-icon">🔍</div>
          <div class="milestone-content">
            <div class="milestone-title">识别表单</div>
            <div class="milestone-detail" id="detail-identify"></div>
          </div>
        </div>
        <div class="milestone" id="milestone-map" style="display: none;">
          <div class="milestone-icon">🧠</div>
          <div class="milestone-content">
            <div class="milestone-title">AI字段映射</div>
            <div class="milestone-detail" id="detail-map"></div>
          </div>
        </div>
        <div class="milestone" id="milestone-fill" style="display: none;">
          <div class="milestone-icon">✏️</div>
          <div class="milestone-content">
            <div class="milestone-title">自动填写</div>
            <div class="milestone-detail" id="detail-fill"></div>
          </div>
        </div>
        <div class="milestone milestone-success" id="milestone-complete" style="display: none;">
          <div class="milestone-icon">✅</div>
          <div class="milestone-content">
            <div class="milestone-title">填写完成</div>
            <div class="milestone-detail" id="detail-complete"></div>
          </div>
        </div>
        <!-- 实时进度摘要 -->
        <div class="progress-summary" id="progressSummary" style="display: none;"></div>
      </div>
    </div>

    <div class="status" id="status">等待上传简历...</div>

    <!-- 版本信息 -->
    <div class="version-info" id="versionInfo" style="text-align: center; padding: 8px; font-size: 11px; color: #999; border-top: 1px solid #eee;">
      简历自动填写助手 v<span id="extVersion">--</span>
    </div>

    <!-- 历史版本弹窗 -->
    <div class="modal-overlay" id="versionModal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <span>选择历史版本</span>
          <button class="modal-close-btn" id="closeModalBtn">&times;</button>
        </div>
        <div class="modal-body" id="versionList"></div>
      </div>
    </div>

    <!-- 版本超限弹窗 -->
    <div class="modal-overlay" id="versionLimitModal" style="display: none;">
      <div class="modal-content modal-center">
        <div class="modal-title">版本数量已达上限</div>
        <div class="modal-desc">最多保存5个简历版本，请先删除旧版本再上传新简历。</div>
        <div class="modal-actions">
          <button class="btn-cancel" id="cancelLimitBtn">取消</button>
          <button class="btn-confirm" id="goDeleteBtn">去删除</button>
        </div>
      </div>
    </div>
  `;
  shadowRoot.appendChild(container);

  // 注意：Shadow DOM 已经隔离了事件，不需要额外阻止冒泡
  // 如果在 container 上使用 stopImmediatePropagation()，会阻止按钮的点击事件

  // 添加拖拽功能 - 整个弹窗都可以拖拽
  // 重要：mouseup 必须在 window 上监听，否则可能无法正确捕获松开事件
  container.addEventListener('mousedown', startDrag);

  // 在 window 上监听 mouseup，确保无论鼠标在哪里都能捕获到松开事件
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('mousemove', onDrag);

  // 初始化事件监听
  initPopupEvents();

  document.body.appendChild(floatingPopup);

  // ================== 监控弹窗样式变化 ==================
  // 用于调试：记录谁修改了 display 属性
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        console.log('[简历助手] 弹窗样式变化:', {
          oldValue: mutation.oldValue,
          newValue: floatingPopup.style.cssText,
          display: floatingPopup.style.display,
          stack: new Error().stack
        });
      }
    });
  });
  observer.observe(floatingPopup, { attributes: true, attributeOldValue: true });
}

// 拖拽相关函数
function startDrag(e) {
  if (!floatingPopup) return;

  // 排除按钮、输入框等可交互元素
  const target = e.target;
  const isInteractive = target.closest && target.closest('button, input, select, textarea, a, [role="button"], .btn, .version-btn, .modal-close-btn');
  if (isInteractive) return;

  // 开始拖拽
  isDragging = true;
  const rect = floatingPopup.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;

  // 改变样式为移动图标（十字箭头）
  floatingPopup.style.cursor = 'move';
}

function onDrag(e) {
  if (!isDragging || !floatingPopup) return;

  e.preventDefault();

  // 计算新位置
  let newLeft = e.clientX - dragOffset.x;
  let newTop = e.clientY - dragOffset.y;

  // 边界检查
  const maxLeft = window.innerWidth - 50;
  const maxTop = window.innerHeight - 50;
  newLeft = Math.max(0, Math.min(newLeft, maxLeft));
  newTop = Math.max(0, Math.min(newTop, maxTop));

  floatingPopup.style.left = newLeft + 'px';
  floatingPopup.style.top = newTop + 'px';
  floatingPopup.style.right = 'auto';
}

function stopDrag(e) {
  if (!isDragging) return;

  // 停止拖拽
  isDragging = false;

  // 松开鼠标，固定位置，切换为普通指针
  if (floatingPopup) {
    floatingPopup.style.cursor = '';
    console.log('[简历助手] 弹窗已固定:', floatingPopup.style.left, floatingPopup.style.top);
  }
}

// 初始化弹窗事件
function initPopupEvents() {
  const $ = (id) => shadowRoot.getElementById(id);

  const uploadBtn = $('uploadBtn');
  const editBtn = $('editBtn');
  const versionBtn = $('versionBtn');
  const startBtn = $('startBtn');
  const pauseBtn = $('pauseBtn');
  const continueBtn = $('continueBtn');
  const restartBtn = $('restartBtn');
  const closeBtn = $('closeBtn');
  const logToggle = $('logToggle');
  const logArea = $('logArea');
  const progress = $('progress');
  const status = $('status');
  const uploadProgress = $('uploadProgress');
  const uploadProgressBar = $('uploadProgressBar');
  const uploadProgressText = $('uploadProgressText');
  const parseProgress = $('parseProgress');
  const parseProgressBar = $('parseProgressBar');
  const parseProgressText = $('parseProgressText');

  // 进度条控制函数
  function showUploadProgress() {
    uploadProgress.style.display = 'block';
    parseProgress.style.display = 'none';
    uploadProgressBar.style.width = '0%';
    uploadProgressText.textContent = '上传中... 0%';
  }

  function updateUploadProgress(percent) {
    uploadProgressBar.style.width = `${percent}%`;
    uploadProgressText.textContent = `上传中... ${percent}%`;
  }

  function showParseProgress() {
    parseProgress.style.display = 'block';
    uploadProgress.style.display = 'none';
    parseProgressBar.classList.add('indeterminate');
    parseProgressText.textContent = '解析中...';
  }

  function updateParseProgress(message) {
    parseProgressText.textContent = message;
  }

  function hideAllProgress() {
    uploadProgress.style.display = 'none';
    parseProgress.style.display = 'none';
  }

  // 更新里程碑状态
  function updateMilestone(milestone, status, detail) {
    const el = $(`milestone-${milestone}`);
    const detailEl = $(`detail-${milestone}`);
    if (!el) return;

    el.style.display = 'flex';
    el.classList.remove('active', 'success', 'error');

    if (status === 'active') {
      el.classList.add('active');
    } else if (status === 'success') {
      el.classList.add('success');
    } else if (status === 'error') {
      el.classList.add('error');
    }

    if (detailEl && detail) {
      detailEl.textContent = detail;
    }
  }

  // 更新进度摘要
  function updateProgressSummary(filled, failed, skipped, total) {
    const summaryEl = $('progressSummary');
    if (!summaryEl) return;

    summaryEl.style.display = 'flex';
    const percent = total > 0 ? Math.round((filled / total) * 100) : 0;

    summaryEl.innerHTML = `
      <div class="stat">
        <span>进度:</span>
        <span class="stat-value">${filled}/${total}</span>
        <span>(${percent}%)</span>
      </div>
      <div style="display: flex; gap: 12px;">
        <div class="stat">
          <span>✅</span>
          <span class="stat-value stat-success">${filled}</span>
        </div>
        <div class="stat">
          <span>❌</span>
          <span class="stat-value stat-fail">${failed}</span>
        </div>
        <div class="stat">
          <span>⏭️</span>
          <span class="stat-value stat-skip">${skipped}</span>
        </div>
      </div>
    `;
  }

  // 日志函数（保留但改为更新里程碑详情）
  function log(message, type = 'info') {
    console.log(`[简历助手] ${type}: ${message}`);

    // 根据消息内容判断更新哪个里程碑
    if (message.includes('识别') || message.includes('表单元素')) {
      updateMilestone('identify', type === 'error' ? 'error' : 'active', message);
    } else if (message.includes('映射') || message.includes('LLM') || message.includes('AI')) {
      updateMilestone('map', type === 'error' ? 'error' : 'active', message);
    } else if (message.includes('填写') && !message.includes('完成')) {
      updateMilestone('fill', type === 'error' ? 'error' : 'active', message);
    } else if (message.includes('完成')) {
      updateMilestone('complete', 'success', message);
    }
  }

  // 更新状态
  function updateStatus(message) {
    status.textContent = message;
  }

  // 上传简历
  uploadBtn.addEventListener('click', async () => {
    // 上传前检查版本数量
    try {
      const versionsResponse = await fetch(`${API_BASE}/api/resume/versions`);
      const versionsData = await versionsResponse.json();
      if (versionsData.success && versionsData.data?.length >= 5) {
        showVersionLimitModal();
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

      log(`正在上传: ${file.name}`, 'info');

      // 显示上传进度条
      showUploadProgress();
      updateStatus('正在上传简历...');

      const formData = new FormData();
      formData.append('file', file);

      // 使用 XMLHttpRequest 以支持上传进度
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          updateUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          // 上传完成，切换到解析进度条
          showParseProgress();
          updateParseProgress('解析中...');

          try {
            const responseData = JSON.parse(xhr.responseText);
            if (responseData.success && responseData.data) {
              // 检查是否使用了缓存
              if (responseData.message === '使用缓存数据') {
                log('使用缓存数据，秒解析完成!', 'success');
              } else {
                log('简历解析成功!', 'success');
              }

              // 隐藏进度条
              hideAllProgress();

              // 保存到 chrome storage
              chrome.storage.local.set({ resumeData: responseData.data });

              updateStatus('简历已就绪，可以开始填写');
            } else {
              hideAllProgress();
              log('简历解析失败: ' + (responseData.message || '未知错误'), 'error');
              updateStatus('解析失败，请重试');
            }
          } catch (parseError) {
            hideAllProgress();
            log('解析响应失败: ' + parseError.message, 'error');
            updateStatus('解析失败，请重试');
          }
        } else {
          hideAllProgress();
          log('上传失败: HTTP ' + xhr.status, 'error');
          updateStatus('上传失败，请重试');
        }
      };

      xhr.onerror = () => {
        hideAllProgress();
        log('上传失败，请检查后端服务', 'error');
        updateStatus('上传失败，请检查后端服务');
      };

      xhr.open('POST', `${API_BASE}/api/resume/upload`);
      xhr.send(formData);
    };

    input.click();
  });

  // 编辑信息
  editBtn.addEventListener('click', () => {
    safeSendMessage({ action: 'openEditPage' });
  });

  // 历史版本
  versionBtn.addEventListener('click', async () => {
    log('正在获取历史版本...', 'info');
    await loadVersions();
  });

  // 弹窗控制函数
  function showVersionLimitModal() {
    $('versionLimitModal').style.display = 'flex';
  }

  function hideVersionLimitModal() {
    $('versionLimitModal').style.display = 'none';
  }

  function showVersionModal() {
    $('versionModal').style.display = 'flex';
  }

  function hideVersionModal() {
    $('versionModal').style.display = 'none';
  }

  // 版本超限弹窗按钮
  $('cancelLimitBtn').addEventListener('click', hideVersionLimitModal);
  $('goDeleteBtn').addEventListener('click', () => {
    hideVersionLimitModal();
    // 打开历史版本管理页面
    safeSendMessage({ action: 'openEditPage', view: 'history' });
  });

  // 关闭版本弹窗
  $('closeModalBtn').addEventListener('click', hideVersionModal);

  // 加载版本列表（带缓存）
  async function loadVersions() {
    // 检查缓存是否有效（30秒内）
    const now = Date.now();
    if (cachedVersions && (now - versionsLoadingTime) < 30000) {
      renderVersionList(cachedVersions);
      return;
    }

    // 显示加载中
    $('versionList').innerHTML = '<div class="no-versions">加载中...</div>';
    showVersionModal();

    try {
      const response = await fetch(`${API_BASE}/api/resume/versions`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data.length > 0) {
          cachedVersions = data.data;
          versionsLoadingTime = now;
          renderVersionList(data.data);
        } else {
          $('versionList').innerHTML = '<div class="no-versions">暂无历史版本<br>上传简历后会自动保存</div>';
        }
      } else {
        $('versionList').innerHTML = '<div class="no-versions">获取失败，请重试</div>';
        log('获取版本列表失败', 'error');
      }
    } catch (error) {
      $('versionList').innerHTML = '<div class="no-versions">网络错误，请检查后端服务</div>';
      log('获取版本列表失败: ' + error.message, 'error');
    }
  }

  // 渲染版本列表
  function renderVersionList(versions) {
    const list = $('versionList');
    list.innerHTML = versions.map(version => {
      const date = new Date(version.created_at).toLocaleString('zh-CN');
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
            <button class="version-btn version-btn-use" data-action="use" data-version-id="${version.version_id}" style="background: #28a745;">填写</button>
            <button class="version-btn version-btn-load" data-action="load" data-version-id="${version.version_id}">加载</button>
            <button class="version-btn version-btn-delete" data-action="delete" data-version-id="${version.version_id}">删除</button>
          </div>
        </div>
      `;
    }).join('');

    showVersionModal();
  }

  // 版本列表按钮点击事件（事件委托）
  $('versionList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.version-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const versionId = btn.dataset.versionId;

    if (action === 'load') {
      await loadVersion(versionId);
    } else if (action === 'use') {
      await useVersionForFilling(versionId);
    } else if (action === 'delete') {
      await deleteVersion(versionId);
    }
  });

  // 加载版本
  async function loadVersion(versionId) {
    try {
      log('正在加载版本...', 'info');
      const response = await fetch(`${API_BASE}/api/resume/version/${versionId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          // 保存到本地存储
          chrome.storage.local.set({ resumeData: data.data });
          log('版本加载成功', 'success');
          updateStatus('简历已就绪，可以开始填写');
          hideVersionModal();

          // 跳转到编辑页面
          safeSendMessage({ action: 'openEditPage', version: versionId });
        } else {
          log('加载版本失败', 'error');
        }
      }
    } catch (error) {
      log('加载版本失败: ' + error.message, 'error');
    }
  }

  // 使用指定版本进行填写（设置为当前填写模板）
  async function useVersionForFilling(versionId) {
    try {
      log('正在设置为填写模板...', 'info');

      // 1. 设置后端当前版本
      const setResponse = await fetch(`${API_BASE}/api/resume/set-current/${versionId}`, {
        method: 'POST'
      });

      if (!setResponse.ok) {
        log('设置失败', 'error');
        return;
      }

      // 2. 从后端加载该版本的完整数据
      const versionResponse = await fetch(`${API_BASE}/api/resume/version/${versionId}`);
      if (versionResponse.ok) {
        const versionData = await versionResponse.json();
        if (versionData.success && versionData.data) {
          // 3. 同步到 chrome.storage.local
          chrome.storage.local.set({ resumeData: versionData.data }, () => {
            console.log('[简历助手] 已同步选中版本到本地缓存');
          });

          log('已设置为填写模板', 'success');
          updateStatus('简历已就绪，可以开始填写');
          hideVersionModal();
        } else {
          log('加载版本数据失败', 'error');
        }
      }
    } catch (error) {
      log('设置失败: ' + error.message, 'error');
    }
  }

  // 删除版本
  async function deleteVersion(versionId) {
    try {
      const response = await fetch(`${API_BASE}/api/resume/version/${versionId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        log('删除成功', 'success');
        await loadVersions();
      } else {
        log('删除失败', 'error');
      }
    } catch (error) {
      log('删除失败: ' + error.message, 'error');
    }
  }

  // 开始填写
  startBtn.addEventListener('click', async () => {
    fillingState.isRunning = true;
    fillingState.isPaused = false;
    fillingState.isRestart = false;  // 确保是开始填写模式
    fillingState.currentIndex = 0;  // 重置索引，从头开始

    startBtn.style.display = 'none';
    pauseBtn.style.display = 'block';

    log('开始自动填写...', 'info');
    updateStatus('正在填写...');

    await startAutoFilling();
  });

  // 暂停
  pauseBtn.addEventListener('click', () => {
    fillingState.isPaused = true;
    pauseBtn.style.display = 'none';
    continueBtn.style.display = 'block';

    // 更新里程碑显示暂停状态
    const detailFill = shadowRoot?.getElementById('detail-fill');
    if (detailFill) {
      detailFill.textContent = '⏸️ 已暂停，点击继续按钮恢复';
    }
    updateStatus('已暂停');
  });

  // 继续
  continueBtn.addEventListener('click', () => {
    fillingState.isPaused = false;
    continueBtn.style.display = 'none';
    pauseBtn.style.display = 'block';

    // 更新里程碑显示继续状态
    const detailFill = shadowRoot?.getElementById('detail-fill');
    if (detailFill) {
      detailFill.textContent = '继续填写中...';
    }
    updateStatus('正在填写...');
  });

  // 进度切换
  logToggle.addEventListener('click', () => {
    logArea.classList.toggle('show');
    logToggle.textContent = logArea.classList.contains('show') ? '隐藏进度' : '显示进度';
  });

  // 关闭按钮
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    floatingPopup.style.display = 'none';
  });

  // 重新填写按钮 - 停止当前填写并立即开始新的填写
  restartBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    console.log('[简历助手] 重新填写：停止当前填写并开始新的填写');

    // 立即停止当前填写过程
    fillingState.isRunning = false;
    fillingState.isPaused = false;
    fillingState.currentIndex = 0;
    fillingState.isRestart = true;  // 标记为重新填写模式

    // 清除可视化反馈
    if (visualFeedback) {
      visualFeedback.clearAll();
    }

    // 清除所有 rf-* 高亮类
    document.querySelectorAll('.rf-highlighted, .rf-filling, .rf-completed, .rf-failed, .rf-skipped').forEach(el => {
      el.classList.remove('rf-highlighted', 'rf-filling', 'rf-completed', 'rf-failed', 'rf-skipped');
    });

    // 清除状态标签
    document.querySelectorAll('.rf-status-label').forEach(el => el.remove());

    // 重置表单元素值
    if (fillingState.formElements && fillingState.formElements.length > 0) {
      fillingState.formElements.forEach(formEl => {
        try {
          const domEl = formEl.element;
          if (!domEl) return;

          if (domEl.tagName === 'INPUT' && (domEl.type === 'text' || domEl.type === 'email' || domEl.type === 'tel' || domEl.type === 'number' || domEl.type === 'password')) {
            domEl.value = '';
            domEl.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (domEl.tagName === 'TEXTAREA') {
            domEl.value = '';
            domEl.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (domEl.tagName === 'SELECT') {
            domEl.selectedIndex = 0;
            domEl.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (domEl.tagName === 'INPUT' && domEl.type === 'checkbox') {
            domEl.checked = false;
          } else if (domEl.tagName === 'INPUT' && domEl.type === 'radio') {
            const radioGroup = document.querySelectorAll(`input[name="${domEl.name}"]`);
            radioGroup.forEach(r => r.checked = false);
          }
        } catch (e) {
          console.log('[简历助手] 清除表单值失败:', e);
        }
      });
    }

    // 重置按钮状态 - 显示暂停按钮，隐藏开始和继续按钮
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'block';
    continueBtn.style.display = 'none';
    restartBtn.style.display = 'block';

    // 重置里程碑显示
    if (shadowRoot) {
      // 隐藏所有里程碑
      ['identify', 'map', 'fill', 'complete'].forEach(m => {
        const el = shadowRoot.getElementById(`milestone-${m}`);
        if (el) el.style.display = 'none';
      });
      // 显示识别里程碑
      const identifyEl = shadowRoot.getElementById('milestone-identify');
      if (identifyEl) {
        identifyEl.style.display = 'flex';
        identifyEl.classList.remove('success', 'error');
        identifyEl.classList.add('active');
        const detailEl = shadowRoot.getElementById('detail-identify');
        if (detailEl) detailEl.textContent = '正在重新识别表单...';
      }
      // 隐藏进度摘要
      const summaryEl = shadowRoot.getElementById('progressSummary');
      if (summaryEl) summaryEl.style.display = 'none';
    }

    updateStatus('正在重新填写...');

    // 等待当前填写循环停止
    await new Promise(resolve => setTimeout(resolve, 100));

    // 设置状态并立即开始新的填写
    fillingState.isRunning = true;
    fillingState.isPaused = false;
    fillingState.currentIndex = 0;
    fillingState.isRestart = true;  // 确保标志被设置

    // 立即开始新的填写
    await startAutoFilling();
  });

  // 初始化检查
  (async () => {
    // 获取并显示扩展版本号
    try {
      const manifest = chrome.runtime.getManifest();
      const versionEl = shadowRoot?.getElementById('extVersion');
      if (versionEl && manifest.version) {
        versionEl.textContent = manifest.version;
      }
    } catch (e) {
      console.log('[简历助手] 获取版本号失败:', e);
    }

    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) {
        log('后端服务已连接', 'success');
      }
    } catch (error) {
      log('后端服务未启动', 'error');
      updateStatus('请先启动后端服务');
    }

    // 检查是否有缓存的简历数据
    chrome.storage.local.get(['resumeData'], (result) => {
      if (result.resumeData) {
        updateStatus('简历已就绪，可以开始填写');
      }
    });
  })();

  // 监听填写进度
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fillingProgress') {
      updateProgress(message.current, message.total);
    } else if (message.action === 'fillingComplete') {
      fillingState.isRunning = false;
      $('startBtn').style.display = 'block';
      $('startBtn').textContent = '开始填写';
      $('pauseBtn').style.display = 'none';
      $('continueBtn').style.display = 'none';
      $('restartBtn').style.display = 'block';
      log('✅ 填写完成！', 'success');
      updateStatus('✅ 填写完成！可以点击"重新填写"再次执行');
      progress.textContent = progress.textContent.replace('已填', '完成');
    }
  });
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================== 级联下拉框检测 ==================

/**
 * 检测级联下拉框
 * @param {Array} elements - 表单元素列表
 * @returns {Array} 级联组列表
 */
function detectCascadingSelects(elements) {
  if (!cascadingSelect) {
    cascadingSelect = new CascadingSelect();
  }
  return cascadingSelect.detect(elements);
}

/**
 * 查找元素所属的级联组
 * @param {Object} element - 表单元素
 * @param {Array} cascadeGroups - 级联组列表
 * @returns {Object|null} 级联组信息
 */
function findCascadeGroupForElement(element, cascadeGroups) {
  for (const group of cascadeGroups) {
    for (let i = 0; i < group.levels.length; i++) {
      if (group.levels[i].element === element) {
        return {
          groupId: group.groupId,
          type: group.type,
          typeName: group.typeName,
          level: group.levels[i].level,
          totalLevels: group.levels.length,
          isFirstLevel: i === 0,
          isLastLevel: i === group.levels.length - 1
        };
      }
    }
  }
  return null;
}

/**
 * 展开所有下拉框和折叠区域，触发选项加载
 * 对于原生 select，触发 focus 和 mousedown 事件
 * 对于自定义下拉组件，点击打开下拉面板
 * 对于折叠区域，点击展开
 */
async function expandAllSelects() {
  console.log('[简历助手] 正在展开下拉框和折叠区域...');

  // 1. 处理原生 select 元素
  document.querySelectorAll('select').forEach(select => {
    if (select.disabled) return;

    // 触发 focus 事件
    select.dispatchEvent(new Event('focus', { bubbles: true }));

    // 检查是否需要点击来加载选项（某些网站需要）
    const hasEmptyOptions = select.options.length <= 1;
    if (hasEmptyOptions) {
      // 触发 mousedown/mouseup 事件模拟点击
      select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      select.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
  });

  // 2. 处理常见的自定义下拉组件
  const customSelectSelectors = [
    '.el-select',                    // Element UI
    '.ant-select',                   // Ant Design
    '.ivu-select',                   // iView
    '.select2-container',            // Select2
    '.chosen-container',             // Chosen
    '[role="combobox"]',             // ARIA combobox
    '[data-toggle="dropdown"]',      // Bootstrap dropdown
    '.dropdown-toggle',              // 通用下拉
    '.ui-dropdown',                  // jQuery UI
    '.custom-select',                // 自定义 select
  ];

  customSelectSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      try {
        // 点击打开下拉面板
        el.click();
      } catch (e) {
        // 忽略错误
      }
    });
  });

  // 3. 处理折叠区域 (OPT-002)
  const collapseSelectors = [
    '.el-collapse-item__header',     // Element UI 折叠面板
    '.ant-collapse-header',          // Ant Design 折叠面板
    '[data-toggle="collapse"]',      // Bootstrap collapse
    '.collapse-header',              // 通用折叠头
    '.accordion-header',             // 手风琴头
    '[aria-expanded="false"]',       // 未展开的可折叠元素
    '.expand-btn',                   // 展开按钮
    '.show-more',                    // 显示更多
    '.view-more',                    // 查看更多
    '.section-toggle',               // 区域切换
    '.form-section-header',          // 表单区域头
  ];

  let expandedCount = 0;
  for (const selector of collapseSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      try {
        // 检查是否已经展开
        const isExpanded = el.getAttribute('aria-expanded') === 'true' ||
                          el.classList.contains('expanded') ||
                          el.classList.contains('active');

        if (!isExpanded) {
          el.click();
          expandedCount++;
        }
      } catch (e) {
        // 忽略错误
      }
    }
  }

  // 4. 处理特殊的"点击加载更多"按钮
  const loadMoreSelectors = [
    '.load-more',
    '.more-options',
    '.show-all',
    '[data-action="load-more"]',
  ];

  for (const selector of loadMoreSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (el.textContent.includes('更多') || el.textContent.includes('展开')) {
          el.click();
          expandedCount++;
        }
      }
    } catch (e) {
      // 忽略错误
    }
  }

  // 额外检查：遍历所有按钮，查找包含"更多"或"展开"的按钮
  try {
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      if (btn.textContent.includes('更多') || btn.textContent.includes('展开')) {
        btn.click();
        expandedCount++;
      }
    }
  } catch (e) {
    // 忽略错误
  }

  // 5. OPT-002: 处理级联选择器（需要触发展开以加载选项）
  const cascaderSelectors = [
    '.el-cascader',                   // Element UI 级联
    '.ant-cascader-picker',           // Ant Design 级联
    '[role="listbox"][aria-haspopup]', // 通用级联
  ];

  for (const selector of cascaderSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      try {
        // 查找输入框或触发器
        const trigger = el.querySelector('input, .el-input__inner, .ant-cascader-input') || el;
        if (trigger && !trigger.disabled) {
          trigger.click();
          // 等待选项加载
          await waitForCascaderOptions(el);
          expandedCount++;
        }
      } catch (e) {
        // 忽略错误
      }
    }
  }

  // 6. OPT-002: 处理弹窗选择器（需要触发打开弹窗）
  const modalTriggerSelectors = [
    '[data-toggle="modal"]',          // Bootstrap modal
    '.modal-trigger',                 // 通用弹窗触发器
    '.popup-trigger',                 // 弹窗触发器
    '.selector-trigger',              // 选择器触发器
    '.city-selector',                 // 城市选择器
    '.industry-selector',             // 行业选择器
    '.school-selector',               // 学校选择器
  ];

  for (const selector of modalTriggerSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      try {
        if (!el.disabled) {
          el.click();
          await new Promise(resolve => setTimeout(resolve, 300));
          expandedCount++;
        }
      } catch (e) {
        // 忽略错误
      }
    }
  }

  // 等待展开后的内容加载
  if (expandedCount > 0) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[简历助手] 下拉框和折叠区域展开完成，展开 ${expandedCount} 个项`);
}

/**
 * OPT-002: 等待级联选择器选项加载
 * @param {HTMLElement} cascader - 级联选择器元素
 * @param {number} timeout - 超时时间（毫秒）
 */
async function waitForCascaderOptions(cascader, timeout = 2000) {
  return new Promise(resolve => {
    const startTime = Date.now();

    const checkOptions = () => {
      // 检查 Element UI 级联面板
      const elPanel = document.querySelector('.el-cascader__dropdown, .el-cascader-menus');
      if (elPanel && elPanel.querySelectorAll('.el-cascader-node').length > 0) {
        return true;
      }

      // 检查 Ant Design 级联面板
      const antPanel = document.querySelector('.ant-cascader-dropdown, .ant-cascader-menus');
      if (antPanel && antPanel.querySelectorAll('.ant-cascader-menu-item').length > 0) {
        return true;
      }

      // 检查通用选项
      const genericOptions = document.querySelectorAll('[role="option"], [role="listitem"]');
      if (genericOptions.length > 0) {
        return true;
      }

      // 超时检查
      if (Date.now() - startTime > timeout) {
        console.log('[简历助手] 级联选择器选项加载超时');
        return true; // 超时也算完成
      }

      return false;
    };

    const interval = setInterval(() => {
      if (checkOptions()) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

/**
 * OPT-002: 关闭所有遗留的下拉面板
 * 在展开选项后调用，关闭不需要的下拉面板
 */
function closeAllDropdowns() {
  const closeSelectors = [
    '.el-select__wrapper',            // Element UI select wrapper
    '.el-cascader',                   // Element UI cascader
    '.ant-select-selector',           // Ant Design select
    '.ant-cascader-picker',           // Ant Design cascader
  ];

  for (const selector of closeSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      try {
        // 点击外部区域关闭下拉框
        el.dispatchEvent(new MouseEvent('blur', { bubbles: true }));
      } catch (e) {
        // 忽略错误
      }
    }
  }

  // 点击 body 关闭所有下拉框
  document.body.click();
}

// 识别表单元素
async function identifyFormElements() {
  const elements = [];
  const seenElements = new Set(); // 避免重复添加
  const radioGroups = new Map(); // 记录 radio 组

  // 先展开所有下拉框和折叠区域，触发选项加载
  await expandAllSelects();

  // 不需要填写的 input 类型
  const skipInputTypes = ['hidden', 'password', 'submit', 'reset', 'button', 'image', 'file'];

  // 应该跳过的元素特征（搜索框、按钮等）
  const skipPatterns = {
    // 跳过包含这些关键词的 id/name/placeholder
    keywords: ['search', '搜索', 'query', 'keyword', '关键字', 'filter', '筛选', 'moka-version', 'version'],
    // 跳过这些类名
    classNames: ['search', 'search-input', 'navbar-search', 'op-search']
  };

  // 跳过弹窗/对话框中的元素
  const popupSelectors = ['.el-dialog', '.el-message-box', '.el-modal', '.ant-modal', '[role="dialog"]'];

  /**
   * 检查元素是否在弹窗内
   */
  function isInPopup(element) {
    for (const selector of popupSelectors) {
      if (element.closest(selector)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查元素是否应该跳过
   */
  function shouldSkipElement(input) {
    // 检查是否在弹窗内
    if (isInPopup(input)) {
      return true;
    }

    // 检查 id
    const id = (input.id || '').toLowerCase();
    for (const kw of skipPatterns.keywords) {
      if (id.includes(kw.toLowerCase())) return true;
    }

    // 检查 name
    const name = (input.name || '').toLowerCase();
    for (const kw of skipPatterns.keywords) {
      if (name.includes(kw.toLowerCase())) return true;
    }

    // 检查 class
    const className = (input.className || '').toLowerCase();
    for (const cn of skipPatterns.classNames) {
      if (className.includes(cn.toLowerCase())) return true;
    }

    // 检查 placeholder（搜索框）
    const placeholder = (input.placeholder || '').toLowerCase();
    if (placeholder.includes('搜索') || placeholder.includes('职位关键字') || placeholder.includes('search')) {
      return true;
    }

    // 跳过 display:none 的元素
    const style = window.getComputedStyle(input);
    if (style.display === 'none') return true;

    // 跳过 opacity:0 的隐藏元素（Ant Design 的 input 常有此样式）
    // 但如果是 ant-select 内的 selector，不应该跳过
    if (style.opacity === '0' && !input.closest('.ant-select-selector, .el-input')) return true;

    // 跳过 visibility:hidden 的元素
    if (style.visibility === 'hidden') return true;

    // 跳过 type="button" 或 role="button"
    if (input.type === 'button' || input.getAttribute('role') === 'button') return true;

    // 跳过 readonly 且在 ant-select 内的隐藏 input（这些是下拉框的隐藏 input，由 ant-select 识别处理）
    if (input.readOnly && input.hasAttribute('unselectable') && input.closest('.ant-select')) return true;

    return false;
  }

  // ================== 先识别 Element UI 组件（优先级更高） ==================
  // 识别 el-select 下拉框
  document.querySelectorAll('.el-select').forEach(selectWrapper => {
    if (seenElements.has(selectWrapper)) return;

    const input = selectWrapper.querySelector('.el-input__inner');
    if (!input) return;
    if (input.disabled || selectWrapper.classList.contains('is-disabled')) return;
    if (isInPopup(selectWrapper)) return;

    seenElements.add(selectWrapper);
    seenElements.add(input);

    const label = extractElementUILabel(selectWrapper);

    elements.push({
      type: 'element-ui-select',
      tagName: 'EL-SELECT',
      name: input.name || selectWrapper.getAttribute('data-name') || '',
      id: input.id || selectWrapper.id || '',
      label: label,
      placeholder: input.placeholder || '',
      value: input.value || '',
      element: input,
      wrapper: selectWrapper
    });
  });

  // 识别 el-cascader 级联选择器
  document.querySelectorAll('.el-cascader').forEach(cascaderWrapper => {
    if (seenElements.has(cascaderWrapper)) return;
    if (isInPopup(cascaderWrapper)) return;

    const input = cascaderWrapper.querySelector('.el-input__inner');
    if (!input) return;
    if (cascaderWrapper.classList.contains('is-disabled')) return;

    seenElements.add(cascaderWrapper);
    if (input) seenElements.add(input);

    const label = extractElementUILabel(cascaderWrapper);

    elements.push({
      type: 'element-ui-cascader',
      tagName: 'EL-CASCADER',
      name: cascaderWrapper.getAttribute('data-name') || '',
      id: cascaderWrapper.id || '',
      label: label,
      placeholder: input.placeholder || '',
      value: input.value || '',
      element: input,
      wrapper: cascaderWrapper
    });
  });

  // 识别 el-date-editor 日期选择器
  document.querySelectorAll('.el-date-editor').forEach(dateWrapper => {
    if (seenElements.has(dateWrapper)) return;
    if (dateWrapper.classList.contains('is-disabled')) return;
    if (isInPopup(dateWrapper)) return;

    seenElements.add(dateWrapper);

    const inputs = dateWrapper.querySelectorAll('.el-input__inner, .el-range-input');
    const label = extractElementUILabel(dateWrapper);

    if (dateWrapper.classList.contains('el-date-editor--daterange')) {
      elements.push({
        type: 'element-ui-daterange',
        tagName: 'EL-DATE-RANGE',
        name: dateWrapper.getAttribute('data-name') || '',
        id: dateWrapper.id || '',
        label: label,
        value: '',
        element: inputs[0] || dateWrapper,
        elements: inputs,
        wrapper: dateWrapper
      });
    } else {
      const input = inputs[0];
      if (input) seenElements.add(input);

      elements.push({
        type: 'element-ui-date',
        tagName: 'EL-DATE',
        name: input?.name || dateWrapper.getAttribute('data-name') || '',
        id: input?.id || dateWrapper.id || '',
        label: label,
        placeholder: input?.placeholder || '',
        value: input?.value || '',
        element: input || dateWrapper,
        wrapper: dateWrapper
      });
    }
  });

  // ================== 识别自定义级联选择器（如智联招聘的 s-cascader） ==================
  // 必须在识别 el-input 之前，因为自定义级联选择器使用 el-input 作为触发器
  document.querySelectorAll('.el-input').forEach(inputWrapper => {
    if (seenElements.has(inputWrapper)) return;
    if (inputWrapper.classList.contains('is-disabled')) return;
    if (isInPopup(inputWrapper)) return;

    // 跳过已经处理过的标准 Element UI 组件
    if (inputWrapper.closest('.el-select, .el-cascader, .el-date-editor, .el-input-number')) return;

    const input = inputWrapper.querySelector('.el-input__inner');
    if (!input) return;
    if (seenElements.has(input)) return;

    // 通过标签判断是否为级联选择器
    const label = extractElementUILabel(inputWrapper);
    const isCascaderLabel = label && ['省', '市', '区', '县', '地址', '居住地', '籍贯', '户口', '现居', '现住'].some(kw => label.includes(kw));

    if (isCascaderLabel) {
      seenElements.add(inputWrapper);
      seenElements.add(input);

      elements.push({
        type: 'custom-cascader',
        tagName: 'CUSTOM-CASCADER',
        name: input.name || '',
        id: input.id || '',
        label: label,
        placeholder: input.placeholder || '',
        value: input.value || '',
        element: input,
        wrapper: inputWrapper,
        isCustomCascader: true
      });

      console.log(`[CustomCascader] 识别到自定义级联选择器: ${label}`);
    }
  });

  // 识别 el-input 输入框
  document.querySelectorAll('.el-input').forEach(inputWrapper => {
    if (seenElements.has(inputWrapper)) return;
    if (inputWrapper.classList.contains('is-disabled')) return;
    if (isInPopup(inputWrapper)) return;

    // 跳过已经处理过的 el-select, el-cascader, el-date-editor
    if (inputWrapper.closest('.el-select, .el-cascader, .el-date-editor')) return;

    const input = inputWrapper.querySelector('.el-input__inner');
    if (!input) return;
    if (seenElements.has(input)) return;

    seenElements.add(inputWrapper);
    seenElements.add(input);

    const label = extractElementUILabel(inputWrapper);

    elements.push({
      type: 'element-ui-input',
      tagName: 'EL-INPUT',
      name: input.name || '',
      id: input.id || '',
      label: label,
      placeholder: input.placeholder || '',
      value: input.value || '',
      element: input,
      wrapper: inputWrapper
    });
  });

  // ================== 识别 Ant Design 组件 ==================
  // 识别 ant-select 下拉框
  document.querySelectorAll('.ant-select').forEach(selectWrapper => {
    if (seenElements.has(selectWrapper)) return;
    if (selectWrapper.classList.contains('ant-select-disabled')) return;
    if (isInPopup(selectWrapper)) return;

    // 查找内部的隐藏 input（用于触发选择器）
    const input = selectWrapper.querySelector('input.ant-select-selection-search-input, input[type="search"]');
    // 查找 selector（用于点击打开下拉框）
    const selector = selectWrapper.querySelector('.ant-select-selector');

    // 标记已处理
    seenElements.add(selectWrapper);
    if (input) seenElements.add(input);
    if (selector) seenElements.add(selector);

    // 提取标签 - 从 form-item 或 aria-label
    const formItem = selectWrapper.closest('.ant-form-item');
    let label = '';
    if (formItem) {
      const labelEl = formItem.querySelector('.ant-form-item-label label');
      if (labelEl) label = labelEl.textContent.trim();
    }
    // 如果没有找到 label，尝试从 aria-label 或 title 获取
    if (!label) {
      label = selectWrapper.getAttribute('aria-label') || selectWrapper.getAttribute('title') || '';
    }

    // 获取当前显示值
    const selectionItem = selectWrapper.querySelector('.ant-select-selection-item');
    const currentValue = selectionItem ? selectionItem.textContent.trim() : '';

    // 获取 placeholder
    const placeholderEl = selectWrapper.querySelector('.ant-select-selection-placeholder');
    const placeholder = placeholderEl ? placeholderEl.textContent.trim() : '';

    elements.push({
      type: 'ant-select',
      tagName: 'ANT-SELECT',
      name: input?.name || '',
      id: input?.id || selectWrapper.id || '',
      label: label,
      placeholder: placeholder,
      value: currentValue,
      element: selector || input || selectWrapper, // 优先使用 selector
      wrapper: selectWrapper
    });

    console.log(`[AntDesign] 识别到下拉框: ${label}, id: ${input?.id || selectWrapper.id}`);
  });

  // 识别 ant-cascader 级联选择器
  document.querySelectorAll('.ant-cascader').forEach(cascaderWrapper => {
    if (seenElements.has(cascaderWrapper)) return;
    if (cascaderWrapper.classList.contains('ant-cascader-disabled')) return;
    if (isInPopup(cascaderWrapper)) return;

    const input = cascaderWrapper.querySelector('input, .ant-cascader-input');
    if (input && seenElements.has(input)) return;

    seenElements.add(cascaderWrapper);
    if (input) seenElements.add(input);

    // 提取标签
    const formItem = cascaderWrapper.closest('.ant-form-item');
    const label = formItem ? formItem.querySelector('.ant-form-item-label label')?.textContent.trim() : '';

    // 获取当前显示值
    const pickerLabel = cascaderWrapper.querySelector('.ant-cascader-picker-label');
    const currentValue = pickerLabel ? pickerLabel.textContent.trim() : '';

    elements.push({
      type: 'ant-cascader',
      tagName: 'ANT-CASCADER',
      name: input?.name || '',
      id: input?.id || cascaderWrapper.id || '',
      label: label,
      placeholder: input?.placeholder || '',
      value: currentValue,
      element: input || cascaderWrapper.querySelector('.ant-cascader-picker'),
      wrapper: cascaderWrapper
    });

    console.log(`[AntDesign] 识别到级联选择器: ${label}`);
  });

  // 识别 ant-picker 日期选择器
  document.querySelectorAll('.ant-picker').forEach(pickerWrapper => {
    if (seenElements.has(pickerWrapper)) return;
    if (pickerWrapper.classList.contains('ant-picker-disabled')) return;
    if (isInPopup(pickerWrapper)) return;

    // 跳过已处理的 cascader
    if (pickerWrapper.closest('.ant-cascader')) return;

    const input = pickerWrapper.querySelector('input');
    if (input && seenElements.has(input)) return;

    seenElements.add(pickerWrapper);
    if (input) seenElements.add(input);

    // 提取标签
    const formItem = pickerWrapper.closest('.ant-form-item');
    const label = formItem ? formItem.querySelector('.ant-form-item-label label')?.textContent.trim() : '';

    const isRange = pickerWrapper.classList.contains('ant-picker-range');

    elements.push({
      type: isRange ? 'ant-daterange' : 'ant-date',
      tagName: isRange ? 'ANT-DATE-RANGE' : 'ANT-DATE',
      name: input?.name || '',
      id: input?.id || pickerWrapper.id || '',
      label: label,
      placeholder: input?.placeholder || '',
      value: input?.value || '',
      element: input || pickerWrapper,
      wrapper: pickerWrapper
    });

    console.log(`[AntDesign] 识别到日期选择器: ${label}`);
  });

  // 识别 ant-input 输入框（不在其他组件内的）
  document.querySelectorAll('.ant-input, .ant-input-affix-wrapper').forEach(inputWrapper => {
    if (seenElements.has(inputWrapper)) return;
    if (inputWrapper.classList.contains('ant-input-disabled')) return;
    if (isInPopup(inputWrapper)) return;

    // 跳过已处理的组件
    if (inputWrapper.closest('.ant-select, .ant-cascader, .ant-picker')) return;

    const input = inputWrapper.tagName === 'INPUT' ? inputWrapper : inputWrapper.querySelector('input');
    if (input && seenElements.has(input)) return;

    seenElements.add(inputWrapper);
    if (input) seenElements.add(input);

    // 提取标签
    const formItem = inputWrapper.closest('.ant-form-item');
    const label = formItem ? formItem.querySelector('.ant-form-item-label label')?.textContent.trim() : '';

    elements.push({
      type: 'ant-input',
      tagName: 'ANT-INPUT',
      name: input?.name || '',
      id: input?.id || '',
      label: label,
      placeholder: input?.placeholder || '',
      value: input?.value || '',
      element: input || inputWrapper,
      wrapper: inputWrapper
    });

    console.log(`[AntDesign] 识别到输入框: ${label}, id: ${input?.id || ''}`);
  });

  // 识别 ant-radio-group 单选按钮组
  document.querySelectorAll('.ant-radio-group').forEach(radioGroup => {
    if (seenElements.has(radioGroup)) return;
    if (isInPopup(radioGroup)) return;

    seenElements.add(radioGroup);

    // 标记内部所有 radio input，避免原生 input 识别器重复处理
    const radioInputs = radioGroup.querySelectorAll('input[type="radio"]');
    radioInputs.forEach(radioInput => seenElements.add(radioInput));

    // 提取标签
    const formItem = radioGroup.closest('.ant-form-item');
    const label = formItem ? formItem.querySelector('.ant-form-item-label label')?.textContent.trim() : '';

    const radios = radioGroup.querySelectorAll('.ant-radio-wrapper');
    const options = Array.from(radios).map(r => ({
      value: r.querySelector('input')?.value || r.querySelector('.ant-radio')?.textContent.trim() || '',
      text: r.textContent.trim(),
      checked: r.querySelector('.ant-radio')?.classList.contains('ant-radio-checked') || false,
      element: r
    }));

    const checkedRadio = options.find(o => o.checked);

    elements.push({
      type: 'ant-radio-group',
      tagName: 'ANT-RADIO-GROUP',
      name: radioGroup.getAttribute('name') || '',
      id: radioGroup.id || '',
      label: label,
      value: checkedRadio?.value || '',
      options: options,
      element: radioGroup,
      wrapper: radioGroup
    });

    console.log(`[AntDesign] 识别到单选按钮组: ${label}, options: ${options.length}个`);
  });

  // 识别 ant-checkbox-group 复选框组
  document.querySelectorAll('.ant-checkbox-group').forEach(checkboxGroup => {
    if (seenElements.has(checkboxGroup)) return;
    if (isInPopup(checkboxGroup)) return;

    seenElements.add(checkboxGroup);

    // 标记内部所有 checkbox input，避免原生 input 识别器重复处理
    const checkboxInputs = checkboxGroup.querySelectorAll('input[type="checkbox"]');
    checkboxInputs.forEach(checkboxInput => seenElements.add(checkboxInput));

    // 提取标签
    const formItem = checkboxGroup.closest('.ant-form-item');
    const label = formItem ? formItem.querySelector('.ant-form-item-label label')?.textContent.trim() : '';

    const checkboxes = checkboxGroup.querySelectorAll('.ant-checkbox-wrapper');
    const options = Array.from(checkboxes).map(c => ({
      value: c.querySelector('input')?.value || c.textContent.trim(),
      text: c.textContent.trim(),
      checked: c.querySelector('.ant-checkbox')?.classList.contains('ant-checkbox-checked') || false,
      element: c
    }));

    const checkedValues = options.filter(o => o.checked).map(o => o.value);

    elements.push({
      type: 'ant-checkbox-group',
      tagName: 'ANT-CHECKBOX-GROUP',
      name: checkboxGroup.getAttribute('name') || '',
      id: checkboxGroup.id || '',
      label: label,
      value: checkedValues,
      options: options,
      element: checkboxGroup,
      wrapper: checkboxGroup
    });

    console.log(`[AntDesign] 识别到复选框组: ${label}, options: ${options.length}个`);
  });

  // ================== 识别 Vant 组件（移动端） ==================
  // 识别 van-field 输入框
  document.querySelectorAll('.van-field').forEach(fieldWrapper => {
    if (seenElements.has(fieldWrapper)) return;
    if (fieldWrapper.classList.contains('van-field--disabled')) return;
    if (isInPopup(fieldWrapper)) return;

    const input = fieldWrapper.querySelector('input, textarea');
    if (input && seenElements.has(input)) return;

    seenElements.add(fieldWrapper);
    if (input) seenElements.add(input);

    const label = fieldWrapper.querySelector('.van-field__label')?.textContent.trim() || '';

    elements.push({
      type: 'vant-field',
      tagName: 'VANT-FIELD',
      name: input?.name || '',
      id: input?.id || '',
      label: label,
      placeholder: input?.placeholder || '',
      value: input?.value || '',
      element: input || fieldWrapper,
      wrapper: fieldWrapper
    });
  });

  // 识别 van-picker 选择器
  document.querySelectorAll('.van-picker').forEach(pickerWrapper => {
    if (seenElements.has(pickerWrapper)) return;
    if (isInPopup(pickerWrapper)) return;

    seenElements.add(pickerWrapper);

    const label = pickerWrapper.querySelector('.van-field__label')?.textContent.trim() || '';

    elements.push({
      type: 'vant-picker',
      tagName: 'VANT-PICKER',
      name: '',
      id: pickerWrapper.id || '',
      label: label,
      value: pickerWrapper.querySelector('.van-field__value')?.textContent.trim() || '',
      element: pickerWrapper,
      wrapper: pickerWrapper
    });
  });

  // ================== 识别 iView 组件 ==================
  // 识别 ivu-select 下拉框
  document.querySelectorAll('.ivu-select').forEach(selectWrapper => {
    if (seenElements.has(selectWrapper)) return;
    if (selectWrapper.classList.contains('ivu-select-disabled')) return;
    if (isInPopup(selectWrapper)) return;

    const input = selectWrapper.querySelector('input');
    if (input && seenElements.has(input)) return;

    seenElements.add(selectWrapper);
    if (input) seenElements.add(input);

    const formItem = selectWrapper.closest('.ivu-form-item');
    const label = formItem ? formItem.querySelector('.ivu-form-item-label')?.textContent.trim() : '';

    elements.push({
      type: 'ivu-select',
      tagName: 'IVU-SELECT',
      name: input?.name || '',
      id: input?.id || selectWrapper.id || '',
      label: label,
      placeholder: input?.placeholder || '',
      value: selectWrapper.querySelector('.ivu-select-selected-value')?.textContent.trim() || '',
      element: input || selectWrapper.querySelector('.ivu-select-selection'),
      wrapper: selectWrapper
    });
  });

  // 识别 ivu-input 输入框
  document.querySelectorAll('.ivu-input-wrapper').forEach(inputWrapper => {
    if (seenElements.has(inputWrapper)) return;
    if (inputWrapper.classList.contains('ivu-input-wrapper-disabled')) return;
    if (isInPopup(inputWrapper)) return;

    // 跳过已处理的组件
    if (inputWrapper.closest('.ivu-select, .ivu-cascader')) return;

    const input = inputWrapper.querySelector('input, textarea');
    if (input && seenElements.has(input)) return;

    seenElements.add(inputWrapper);
    if (input) seenElements.add(input);

    const formItem = inputWrapper.closest('.ivu-form-item');
    const label = formItem ? formItem.querySelector('.ivu-form-item-label')?.textContent.trim() : '';

    elements.push({
      type: 'ivu-input',
      tagName: 'IVU-INPUT',
      name: input?.name || '',
      id: input?.id || '',
      label: label,
      placeholder: input?.placeholder || '',
      value: input?.value || '',
      element: input || inputWrapper,
      wrapper: inputWrapper
    });
  });

  // ================== 然后识别原生表单元素 ==================
  // 识别input元素
  document.querySelectorAll('input').forEach(input => {
    // 跳过不需要处理的类型
    if (skipInputTypes.includes(input.type)) return;
    // 跳过已禁用的元素
    if (input.disabled) return;
    // 跳过已经处理过的元素（Element UI 等）
    if (seenElements.has(input)) return;
    // 跳过搜索框等干扰元素
    if (shouldSkipElement(input)) return;

    // 特殊处理 radio：按 name 分组，只添加一次
    if (input.type === 'radio') {
      const groupName = input.name || input.id || `radio_${elements.length}`;
      if (!radioGroups.has(groupName)) {
        radioGroups.set(groupName, {
          type: 'radio',
          tagName: 'INPUT',
          name: input.name || '',
          id: input.id || '',
          label: findLabel(input),
          value: input.value || '',
          checked: input.checked,
          options: [], // 收集所有选项
          element: input,
          elements: [input] // 保存所有同组元素
        });
        seenElements.add(input);
      } else {
        // 添加到已有组
        const group = radioGroups.get(groupName);
        group.options.push({ value: input.value, text: findLabel(input), checked: input.checked });
        group.elements.push(input);
        if (input.checked) {
          group.checked = true;
          group.value = input.value;
        }
        seenElements.add(input);
      }
      return;
    }

    // 特殊处理 checkbox：也按 name 分组
    if (input.type === 'checkbox') {
      const groupName = input.name || input.id || `checkbox_${elements.length}`;
      if (!radioGroups.has(groupName)) {
        radioGroups.set(groupName, {
          type: 'checkbox',
          tagName: 'INPUT',
          name: input.name || '',
          id: input.id || '',
          label: findLabel(input),
          value: input.value || '',
          checked: input.checked,
          options: [{ value: input.value, text: findLabel(input), checked: input.checked }],
          element: input,
          elements: [input]
        });
        seenElements.add(input);
      } else {
        const group = radioGroups.get(groupName);
        group.options.push({ value: input.value, text: findLabel(input), checked: input.checked });
        group.elements.push(input);
        seenElements.add(input);
      }
      return;
    }

    seenElements.add(input);
    elements.push({
      type: input.type || 'text',
      tagName: 'INPUT',
      name: input.name || '',
      id: input.id || '',
      placeholder: input.placeholder || '',
      label: findLabel(input),
      value: input.value || '',
      // 添加额外属性用于特殊类型处理
      min: input.min || '',
      max: input.max || '',
      step: input.step || '',
      pattern: input.pattern || '',
      autocomplete: input.autocomplete || '',
      element: input
    });
  });

  // 将 radio/checkbox 组添加到元素列表
  radioGroups.forEach(group => {
    elements.push(group);
  });

  // 识别select元素
  document.querySelectorAll('select').forEach(select => {
    if (seenElements.has(select)) return;
    if (select.disabled) return;
    seenElements.add(select);

    // 收集 optgroup 信息
    const optgroups = [];
    select.querySelectorAll('optgroup').forEach(optgroup => {
      const groupOptions = Array.from(optgroup.options).map(opt => ({ value: opt.value, text: opt.text }));
      if (groupOptions.length > 0) {
        optgroups.push({
          label: optgroup.label || '',
          options: groupOptions
        });
      }
    });

    // 检测是否是级联选择器的一部分（如省市区）
    const label = findLabel(select);
    const isCascaderLabel = label && ['省', '市', '区', '县', '籍贯', '户口', '现居', '地址', '居住地'].some(kw => label.includes(kw));

    // 检测是否有级联关联的 select（通过 onchange 或相邻 select）
    const parentDd = select.closest('dd');
    const parentDl = select.closest('dl');
    let cascadeGroup = null;

    if (isCascaderLabel && parentDd) {
      // 查找同一容器内的其他 select
      const siblingSelects = parentDd.querySelectorAll('select');
      if (siblingSelects.length > 1) {
        // 这是一个级联组
        cascadeGroup = {
          isCascade: true,
          levels: Array.from(siblingSelects).map((s, idx) => ({
            level: idx + 1,
            select: s,
            name: s.name || '',
            id: s.id || ''
          }))
        };
        console.log(`[Cascader] 检测到原生级联选择器: ${label}, ${siblingSelects.length} 级`);

        // 标记所有相关 select 为已处理
        siblingSelects.forEach(s => seenElements.add(s));
      }
    }

    elements.push({
      type: 'select',
      tagName: 'SELECT',
      name: select.name || '',
      id: select.id || '',
      label: label,
      value: select.value || '',
      options: Array.from(select.options).map(opt => ({ value: opt.value, text: opt.text })),
      optgroups: optgroups.length > 0 ? optgroups : null,
      multiple: select.multiple,
      element: select,
      cascadeGroup: cascadeGroup
    });
  });

  // 识别textarea元素
  document.querySelectorAll('textarea').forEach(textarea => {
    if (seenElements.has(textarea)) return;
    if (textarea.disabled) return;
    seenElements.add(textarea);

    elements.push({
      type: 'textarea',
      tagName: 'TEXTAREA',
      name: textarea.name || '',
      id: textarea.id || '',
      placeholder: textarea.placeholder || '',
      label: findLabel(textarea),
      value: textarea.value || '',
      element: textarea
    });
  });

  // 识别 contenteditable 元素（富文本编辑器）
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    if (seenElements.has(el)) return;
    if (el.getAttribute('contenteditable') === 'false') return;
    seenElements.add(el);

    // 排除已处理的表单元素
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;

    elements.push({
      type: 'contenteditable',
      tagName: el.tagName,
      name: el.getAttribute('data-name') || el.getAttribute('data-field') || '',
      id: el.id || '',
      label: findLabel(el),
      value: el.textContent || el.innerHTML || '',
      element: el
    });
  });

  // ================== 识别 Element UI 组件 ==================
  // 识别 el-select 下拉框（内部是 input 元素）
  document.querySelectorAll('.el-select').forEach(selectWrapper => {
    if (seenElements.has(selectWrapper)) return;

    const input = selectWrapper.querySelector('.el-input__inner');
    if (!input) return;
    if (input.disabled || selectWrapper.classList.contains('is-disabled')) return;

    seenElements.add(selectWrapper);
    seenElements.add(input);

    // 提取标签
    const label = extractElementUILabel(selectWrapper);

    elements.push({
      type: 'element-ui-select',
      tagName: 'EL-SELECT',
      name: input.name || selectWrapper.getAttribute('data-name') || '',
      id: input.id || selectWrapper.id || '',
      label: label,
      placeholder: input.placeholder || '',
      value: input.value || '',
      element: input,
      wrapper: selectWrapper
    });
  });

  // 识别 el-cascader 级联选择器
  document.querySelectorAll('.el-cascader').forEach(cascaderWrapper => {
    if (seenElements.has(cascaderWrapper)) return;

    const input = cascaderWrapper.querySelector('.el-input__inner');
    if (!input) return;
    if (cascaderWrapper.classList.contains('is-disabled')) return;

    seenElements.add(cascaderWrapper);
    if (input) seenElements.add(input);

    const label = extractElementUILabel(cascaderWrapper);

    elements.push({
      type: 'element-ui-cascader',
      tagName: 'EL-CASCADER',
      name: cascaderWrapper.getAttribute('data-name') || '',
      id: cascaderWrapper.id || '',
      label: label,
      placeholder: input.placeholder || '',
      value: input.value || '',
      element: input,
      wrapper: cascaderWrapper
    });
  });

  // 识别 el-date-editor 日期选择器
  document.querySelectorAll('.el-date-editor').forEach(dateWrapper => {
    if (seenElements.has(dateWrapper)) return;
    if (dateWrapper.classList.contains('is-disabled')) return;

    seenElements.add(dateWrapper);

    const inputs = dateWrapper.querySelectorAll('.el-input__inner, .el-range-input');
    const label = extractElementUILabel(dateWrapper);

    if (dateWrapper.classList.contains('el-date-editor--daterange')) {
      // 日期范围选择器
      elements.push({
        type: 'element-ui-daterange',
        tagName: 'EL-DATE-RANGE',
        name: dateWrapper.getAttribute('data-name') || '',
        id: dateWrapper.id || '',
        label: label,
        value: '',
        element: inputs[0] || dateWrapper,
        elements: inputs,
        wrapper: dateWrapper
      });
    } else {
      // 单日期选择器
      const input = inputs[0];
      if (input) seenElements.add(input);

      elements.push({
        type: 'element-ui-date',
        tagName: 'EL-DATE',
        name: input?.name || dateWrapper.getAttribute('data-name') || '',
        id: input?.id || dateWrapper.id || '',
        label: label,
        placeholder: input?.placeholder || '',
        value: input?.value || '',
        element: input || dateWrapper,
        wrapper: dateWrapper
      });
    }
  });

  // 识别 el-radio-group 单选按钮组
  document.querySelectorAll('.el-radio-group').forEach(radioGroup => {
    if (seenElements.has(radioGroup)) return;

    const radios = radioGroup.querySelectorAll('.el-radio');
    if (radios.length === 0) return;

    seenElements.add(radioGroup);
    radios.forEach(r => {
      const input = r.querySelector('input');
      if (input) seenElements.add(input);
    });

    const label = extractElementUILabel(radioGroup);
    const options = Array.from(radios).map(r => ({
      value: r.querySelector('input')?.value || '',
      text: r.querySelector('.el-radio__label')?.textContent.trim() || '',
      checked: r.classList.contains('is-checked'),
      element: r
    }));

    const checkedOption = options.find(o => o.checked);

    elements.push({
      type: 'element-ui-radio',
      tagName: 'EL-RADIO-GROUP',
      name: radioGroup.getAttribute('data-name') || '',
      id: radioGroup.id || '',
      label: label,
      value: checkedOption?.text || '',
      checked: !!checkedOption,
      options: options,
      element: radioGroup,
      wrapper: radioGroup
    });
  });

  // 识别 el-checkbox-group 复选框组
  document.querySelectorAll('.el-checkbox-group').forEach(checkboxGroup => {
    if (seenElements.has(checkboxGroup)) return;

    const checkboxes = checkboxGroup.querySelectorAll('.el-checkbox');
    if (checkboxes.length === 0) return;

    seenElements.add(checkboxGroup);
    checkboxes.forEach(c => {
      const input = c.querySelector('input');
      if (input) seenElements.add(input);
    });

    const label = extractElementUILabel(checkboxGroup);
    const options = Array.from(checkboxes).map(c => ({
      value: c.querySelector('input')?.value || '',
      text: c.querySelector('.el-checkbox__label')?.textContent.trim() || '',
      checked: c.classList.contains('is-checked'),
      element: c
    }));

    const checkedValues = options.filter(o => o.checked).map(o => o.text);

    elements.push({
      type: 'element-ui-checkbox',
      tagName: 'EL-CHECKBOX-GROUP',
      name: checkboxGroup.getAttribute('data-name') || '',
      id: checkboxGroup.id || '',
      label: label,
      value: checkedValues,
      options: options,
      element: checkboxGroup,
      wrapper: checkboxGroup
    });
  });

  // 识别 el-switch 开关
  document.querySelectorAll('.el-switch').forEach(switchWrapper => {
    if (seenElements.has(switchWrapper)) return;
    if (switchWrapper.classList.contains('is-disabled')) return;

    seenElements.add(switchWrapper);

    const input = switchWrapper.querySelector('input');
    const label = extractElementUILabel(switchWrapper);

    elements.push({
      type: 'element-ui-switch',
      tagName: 'EL-SWITCH',
      name: switchWrapper.getAttribute('data-name') || '',
      id: switchWrapper.id || '',
      label: label,
      value: switchWrapper.classList.contains('is-checked'),
      element: switchWrapper,
      wrapper: switchWrapper
    });
  });

  // 识别 el-input-number 数字输入框
  document.querySelectorAll('.el-input-number').forEach(numberWrapper => {
    if (seenElements.has(numberWrapper)) return;
    if (numberWrapper.classList.contains('is-disabled')) return;

    const input = numberWrapper.querySelector('.el-input__inner');
    if (!input) return;

    seenElements.add(numberWrapper);
    seenElements.add(input);

    const label = extractElementUILabel(numberWrapper);

    elements.push({
      type: 'element-ui-number',
      tagName: 'EL-INPUT-NUMBER',
      name: input.name || numberWrapper.getAttribute('data-name') || '',
      id: input.id || numberWrapper.id || '',
      label: label,
      value: input.value || '',
      min: numberWrapper.getAttribute('min') || '',
      max: numberWrapper.getAttribute('max') || '',
      element: input,
      wrapper: numberWrapper
    });
  });

  // 识别 el-rate 评分
  document.querySelectorAll('.el-rate').forEach(rateWrapper => {
    if (seenElements.has(rateWrapper)) return;

    seenElements.add(rateWrapper);

    const items = rateWrapper.querySelectorAll('.el-rate__item');
    const currentValue = Array.from(items).filter((item, idx) =>
      item.querySelector('.el-rate__icon')?.classList.contains('is-active')
    ).length;

    const label = extractElementUILabel(rateWrapper);

    elements.push({
      type: 'element-ui-rate',
      tagName: 'EL-RATE',
      name: rateWrapper.getAttribute('data-name') || '',
      id: rateWrapper.id || '',
      label: label,
      value: currentValue,
      max: items.length,
      element: rateWrapper,
      wrapper: rateWrapper
    });
  });

  // 检测级联下拉框
  const cascadeGroups = detectCascadingSelects(elements);

  // 为元素添加级联组信息
  elements.forEach(el => {
    const groupInfo = findCascadeGroupForElement(el, cascadeGroups);
    if (groupInfo) {
      el.cascadeGroup = groupInfo;
    }
  });

  return elements;
}

// 查找标签文本
function findLabel(element) {
  // 0. 最高优先级：placeholder（很多现代表单只用 placeholder）
  if (element.placeholder) {
    const placeholder = element.placeholder.trim();
    // 过滤掉无效的 placeholder
    if (placeholder && !['请选择', '请输入', '请填写', '请输入内容', 'Please select', 'Please enter'].includes(placeholder)) {
      return placeholder;
    }
  }

  // 1. 尝试通过 for 属性查找 label
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return cleanLabelText(label);
  }

  // 2. 尝试查找父级 label
  const parentLabel = element.closest('label');
  if (parentLabel) {
    return cleanLabelText(parentLabel, element);
  }

  // 3. 特殊处理：Moka 招聘系统等现代表单框架
  // 查找父级容器中的标签元素
  const container = element.closest('[class*="Item"], [class*="item"], [class*="Field"], [class*="field"], [class*="Row"], [class*="row"]');
  if (container) {
    // Moka 系统的标签结构
    const labelEl = container.querySelector('[class*="Label"], [class*="label"], .sd-Input-label, label');
    if (labelEl && !labelEl.contains(element)) {
      const text = cleanLabelText(labelEl);
      if (text) return text;
    }
  }

  // 4. 特殊处理：Ant Design / Element UI 等框架的表单项结构
  const formItem = element.closest('.ant-form-item, .el-form-item, .form-item, .FormItem, [class*="formItem"]');
  if (formItem) {
    const labelEl = formItem.querySelector('.ant-form-item-label label, .el-form-item__label, label, .label');
    if (labelEl && !labelEl.contains(element)) {
      const text = cleanLabelText(labelEl);
      if (text) return text;
    }
  }

  // 5. 尝试查找前面的兄弟元素中的 label 或文本
  let prev = element.previousElementSibling;
  while (prev) {
    // 跳过隐藏元素
    if (prev.style?.display === 'none' || prev.getAttribute('aria-hidden') === 'true') {
      prev = prev.previousElementSibling;
      continue;
    }
    if (prev.tagName === 'LABEL') {
      return cleanLabelText(prev);
    }
    // 检查是否是包含文本的 span/div/p/b/strong
    if (['SPAN', 'DIV', 'P', 'B', 'STRONG', 'I', 'EM', 'LABEL', 'TH', 'TD'].includes(prev.tagName)) {
      const text = cleanLabelText(prev);
      if (text && text.length > 0 && text.length < 50) {
        return text;
      }
    }
    prev = prev.previousElementSibling;
  }

  // 6. 尝试查找父元素的前一个兄弟元素
  let parent = element.parentElement;
  for (let i = 0; i < 3 && parent; i++) { // 最多向上查找3层
    const parentPrev = parent.previousElementSibling;
    if (parentPrev && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parentPrev.tagName)) {
      const text = cleanLabelText(parentPrev);
      if (text && text.length > 0 && text.length < 50) {
        return text;
      }
    }
    parent = parent.parentElement;
  }

  // 7. 尝试查找包裹元素的文本（如 td/th 中的文本）
  const cell = element.closest('td, th');
  if (cell) {
    // 查找同行的前一个单元格
    const row = cell.parentElement;
    const cellIndex = Array.from(row.children).indexOf(cell);
    if (cellIndex > 0) {
      const prevCell = row.children[cellIndex - 1];
      const text = cleanLabelText(prevCell);
      if (text && text.length < 50) {
        return text;
      }
    }
  }

  // 8. 尝试查找 form-group 或类似结构中的 label
  const formGroup = element.closest('.form-group, .form-row, .input-group, [class*="form"], [class*="field"]');
  if (formGroup) {
    const labelEl = formGroup.querySelector('label, .label, [class*="label"]');
    if (labelEl && !labelEl.contains(element)) {
      return cleanLabelText(labelEl);
    }
    // 尝试查找第一个文本子元素
    const firstText = formGroup.querySelector('span, div, p, b, strong');
    if (firstText && !firstText.contains(element)) {
      const text = cleanLabelText(firstText);
      if (text && text.length < 50) {
        return text;
      }
    }
  }

  // 9. 特殊处理：Radio/Checkbox 组标签
  if (element.type === 'radio' || element.type === 'checkbox') {
    const enclosingLabel = element.closest('label');
    if (enclosingLabel) {
      const text = cleanLabelText(enclosingLabel, element);
      if (text) return text;
    }
    // 检查相邻的文本节点
    let sibling = element.nextSibling;
    while (sibling) {
      if (sibling.nodeType === Node.TEXT_NODE) {
        const text = sibling.textContent.trim();
        if (text && text.length < 50) return text;
      }
      if (sibling.nodeType === Node.ELEMENT_NODE) {
        const text = sibling.textContent.trim();
        if (text && text.length < 50) return text;
      }
      sibling = sibling.nextSibling;
    }
  }

  // 10. 尝试查找 aria-label 属性
  if (element.getAttribute('aria-label')) {
    return element.getAttribute('aria-label');
  }

  // 11. 尝试查找 aria-labelledby 属性
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) {
      return cleanLabelText(labelEl);
    }
  }

  // 12. 尝试查找 title 属性
  if (element.title) {
    return element.title;
  }

  // 13. 尝试查找 data-label 或 data-placeholder 属性
  if (element.getAttribute('data-label')) {
    return element.getAttribute('data-label');
  }
  if (element.getAttribute('data-placeholder')) {
    return element.getAttribute('data-placeholder');
  }

  // 14. 尝试查找 name 属性作为最后的回退
  if (element.name) {
    // 将 name 转换为可读的标签
    return element.name.replace(/[_-]/g, ' ').replace(/([A-Z])/g, ' $1').trim();
  }

  return '';
}

// 清理 label 文本，移除多余内容
function cleanLabelText(labelEl, excludeElement = null) {
  if (!labelEl) return '';

  // 克隆节点以避免修改原始 DOM
  const clone = labelEl.cloneNode(true);

  // 移除不需要的子元素
  clone.querySelectorAll('input, select, textarea, button, script, style, noscript, .help-text, .error, [class*="help"], [class*="error"]').forEach(el => el.remove());

  // 如果有排除元素，移除其文本
  if (excludeElement) {
    const text = clone.textContent || '';
    const excludeText = excludeElement.value || excludeElement.textContent || '';
    return text.replace(excludeText, '').trim();
  }

  // 获取文本并清理
  let text = clone.textContent || '';

  // 移除常见的后缀符号
  text = text.replace(/[：:*\s]+$/, '').replace(/^[：:*\s]+/, '');

  // 移除多余的空白
  text = text.replace(/\s+/g, ' ').trim();

  // 限制长度
  if (text.length > 100) {
    text = text.substring(0, 100);
  }

  return text;
}

// ================== 格式化辅助函数 ==================

/**
 * 格式化日期为 input[type="date"] 所需的 YYYY-MM-DD 格式
 */
function formatDateForInput(value) {
  if (!value) return '';

  // 尝试解析各种日期格式
  const datePatterns = [
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,  // 2024-01-15 或 2024/01/15
    /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/,   // 2024年1月15日
  ];

  for (const pattern of datePatterns) {
    const match = value.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // 尝试使用 Date 对象解析
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return value;
}

/**
 * 格式化月份为 input[type="month"] 所需的 YYYY-MM 格式
 */
function formatMonthForInput(value) {
  if (!value) return '';

  const patterns = [
    /^(\d{4})[-/](\d{1,2})$/,          // 2024-01 或 2024/01
    /^(\d{4})年(\d{1,2})月?$/,          // 2024年1月
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      return `${year}-${month}`;
    }
  }

  return value;
}

/**
 * 智能匹配下拉框选项
 * 根据选项格式自动调整填入值（如月份 "07" vs "7"）
 * @param {Array} options - 选项列表 [{value, text}, ...]
 * @param {string} targetValue - 目标值
 * @param {string} fieldLabel - 字段标签（用于判断是否为月份/日期字段）
 * @returns {Object|null} - 匹配的选项或 null
 */
function smartMatchOption(options, targetValue, fieldLabel = '') {
  if (!options || options.length === 0 || !targetValue) return null;

  const target = String(targetValue).trim();
  const labelLower = (fieldLabel || '').toLowerCase();

  // 判断是否为月份/日期相关字段
  const isMonthField = labelLower.includes('月') || labelLower.includes('month') ||
                       labelLower.includes('出生') || labelLower.includes('birth');
  const isDateField = labelLower.includes('日') || labelLower.includes('date') ||
                      labelLower.includes('号');

  // 1. 精确匹配（value 或 text 完全相等）
  let match = options.find(opt => opt.value === target || opt.text === target);
  if (match) return match;

  // 2. 包含匹配
  match = options.find(opt => opt.text.includes(target) || target.includes(opt.text));
  if (match) return match;

  // 3. 月份/日期智能格式匹配
  if (isMonthField || isDateField) {
    // 提取目标数字
    const targetNum = parseInt(target, 10);
    if (!isNaN(targetNum) && targetNum >= 1 && targetNum <= 31) {
      // 检测选项格式：是补零格式（"07"）还是非补零格式（"7"）
      const hasZeroPadded = options.some(opt => {
        const val = opt.value || opt.text;
        return /^\d{2}$/.test(val) && parseInt(val, 10) === targetNum;
      });
      const hasNonZeroPadded = options.some(opt => {
        const val = opt.value || opt.text;
        return /^\d{1}$/.test(val) && parseInt(val, 10) === targetNum;
      });

      // 根据选项格式调整目标值
      let adjustedTarget;
      if (hasZeroPadded && !hasNonZeroPadded) {
        // 选项使用补零格式，调整目标为 "07"
        adjustedTarget = String(targetNum).padStart(2, '0');
      } else if (!hasZeroPadded && hasNonZeroPadded) {
        // 选项使用非补零格式，调整目标为 "7"
        adjustedTarget = String(targetNum);
      } else {
        // 两种格式都有或都没有，尝试两种
        adjustedTarget = target;
      }

      // 尝试匹配调整后的值
      match = options.find(opt => opt.value === adjustedTarget || opt.text === adjustedTarget);
      if (match) return match;

      // 尝试数字匹配
      match = options.find(opt => {
        const optNum = parseInt(opt.value || opt.text, 10);
        return !isNaN(optNum) && optNum === targetNum;
      });
      if (match) return match;
    }
  }

  // 4. 中文数字匹配（一月/二月 等）
  const chineseNumMap = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
    '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12
  };
  if (isMonthField) {
    // 检查目标是否为中文数字
    for (const [cn, num] of Object.entries(chineseNumMap)) {
      if (target.includes(cn) || target === String(num)) {
        // 尝试匹配数字
        match = options.find(opt => {
          const optNum = parseInt(opt.value || opt.text, 10);
          return !isNaN(optNum) && optNum === num;
        });
        if (match) return match;
      }
    }
  }

  // 5. 模糊匹配（去除空格、标点后比较）
  const normalizeStr = (s) => String(s || '').replace(/[\s\-\/\.:：]/g, '').toLowerCase();
  const normalizedTarget = normalizeStr(target);
  match = options.find(opt => normalizeStr(opt.text) === normalizedTarget ||
                               normalizeStr(opt.value) === normalizedTarget);
  if (match) return match;

  return null;
}

/**
 * 从字符串中提取数字
 */
function extractNumber(value) {
  if (typeof value === 'number') return value;
  if (!value) return null;

  // 移除非数字字符（保留小数点和负号）
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);

  return isNaN(num) ? null : num;
}

/**
 * 格式化电话号码
 */
function formatPhoneNumber(value) {
  if (!value) return '';

  // 只保留数字和常见分隔符
  let phone = String(value).replace(/[^\d\s-+()]/g, '');

  // 如果是中国手机号，标准化格式
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    // 可选：格式化为 138-1234-5678
    // phone = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    phone = digits;
  }

  return phone;
}

/**
 * 格式化 URL
 */
function formatUrl(value) {
  if (!value) return '';

  let url = value.trim();

  // 确保有协议
  if (url && !url.match(/^https?:\/\//)) {
    url = 'https://' + url;
  }

  return url;
}

// 开始自动填写
async function startAutoFilling() {
  fillingState.isRunning = true;
  fillingState.isPaused = false;
  fillingState.currentIndex = 0;

  let resumeData = null;

  // 通过 background script 代理加载简历数据（解决跨域问题）
  try {
    console.log('[简历助手] 正在从后端加载简历数据...');
    const result = await safeSendMessageWithResponse({ action: 'api_loadResume' }, 15000);
    console.log('[简历助手] 后端响应:', result);

    if (result && result.success && result.data?.data) {
      resumeData = result.data.data;
      // 同步到本地缓存
      chrome.storage.local.set({ resumeData: resumeData });
      console.log('[简历助手] 从后端加载最新简历数据成功');
    } else {
      console.log('[简历助手] 后端响应失败:', result?.error || '未知错误');
    }
  } catch (e) {
    console.log('[简历助手] 后端请求失败:', e.message);
  }

  // 回退到本地缓存
  if (!resumeData) {
    console.log('[简历助手] 尝试从本地缓存加载...');
    const result = await chrome.storage.local.get(['resumeData']);
    resumeData = result.resumeData?.data || result.resumeData;
  }

  if (!resumeData) {
    alert('❌ 没有可用的简历数据，请先上传简历');
    return;
  }

  console.log('[简历助手] 简历数据已加载:', resumeData.name || '未知');

  fillingState.resumeData = resumeData;

  // ================== 关键修复：先点击编辑按钮，再识别表单 ==================
  // 邮储银行等网站需要先点击编辑按钮才能显示输入框
  console.log('[简历助手] 检查是否需要点击编辑按钮...');
  const editClicked = await clickEditButtonIfNeeded();
  if (editClicked) {
    console.log('[简历助手] 已点击编辑按钮，等待表单加载...');
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  // 识别表单
  fillingState.formElements = await identifyFormElements();
  console.log('[简历助手] 识别到表单元素数量:', fillingState.formElements.length);

  // 如果第一次没识别到，可能是编辑按钮还没生效，再试一次
  if (fillingState.formElements.length === 0) {
    console.log('[简历助手] 未识别到表单元素，再次尝试点击编辑按钮...');
    const retryEditClicked = await clickEditButtonIfNeeded();
    if (retryEditClicked) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      fillingState.formElements = await identifyFormElements();
      console.log('[简历助手] 重试后识别到表单元素数量:', fillingState.formElements.length);
    }
  }

  if (fillingState.formElements.length === 0) {
    alert('❌ 未识别到任何表单元素，请确认页面有需要填写的表单');
    return;
  }

  // 使用可视化反馈标记已识别的元素
  if (visualFeedback) {
    visualFeedback.markIdentified(fillingState.formElements);
  }

  // 打印识别到的元素列表（调试用）
  console.log('[简历助手] 表单元素列表:');
  fillingState.formElements.forEach((el, idx) => {
    console.log(`  [${idx}] ${el.tagName} - label: "${el.label}" name: "${el.name}" id: "${el.id}"`);
  });

  // ================== 问题26：逐元素映射填写模式 ==================
  // 用户选择的方案C：逐个元素调用LLM映射后填写
  // 暂时关闭，待调试完成后开启
  const SEQUENTIAL_MAPPING_MODE = false; // 设为 true 启用逐元素映射模式

  // 初始化填写报告（使用全局函数）
  resetFillingReport(fillingState.formElements.length);

  if (SEQUENTIAL_MAPPING_MODE) {
    console.log('[简历助手] 使用逐元素映射填写模式');
    await fillFormsSequentially(fillingState.formElements, fillingState.resumeData);
    return;
  }

  // ================== 原有批量映射模式（保留作为备选） ==================
  // 通过 background script 代理请求字段映射（解决跨域问题）
  try {
    // ================== 显示 LLM 映射进度提示 ==================
    const progressEl = shadowRoot?.getElementById('progress');
    const statusEl = shadowRoot?.getElementById('status');
    if (progressEl) progressEl.textContent = '🔄 正在分析表单字段...';
    if (statusEl) statusEl.textContent = '正在调用 AI 进行字段映射，请稍候...';

    console.log('[简历助手] 正在请求LLM字段映射...');

    // 为表单元素添加显式索引，确保映射正确
    const formStructureWithIndex = fillingState.formElements.map((el, index) => ({
      index: index,  // 显式添加索引
      type: el.type,
      tagName: el.tagName,
      name: el.name,
      id: el.id,
      label: el.label,
      placeholder: el.placeholder,
      // OPT-001: 添加options字段，帮助LLM更准确匹配
      options: el.options || null,
      // 添加radio/checkbox的选项
      choices: el.choices || null
    }));

    console.log('[简历助手] 表单结构（带索引）:', formStructureWithIndex);

    const result = await safeSendMessageWithResponse({
      action: 'api_mapping',
      data: {
        resumeData: fillingState.resumeData,
        formStructure: formStructureWithIndex
      }
    }, 60000); // 批量映射可能需要更长时间

    console.log('[简历助手] 映射结果:', result);
    console.log('[简历助手] result.success:', result.success);
    console.log('[简历助手] result.data:', result.data);
    console.log('[简历助手] result.data?.data:', result.data?.data);
    console.log('[简历助手] result.data?.success:', result.data?.success);
    console.log('[简历助手] typeof result.data:', typeof result.data);
    console.log('[简历助手] Array.isArray(result.data):', Array.isArray(result.data));

    // 数据结构分析：
    // background 代理返回: { success: HTTP_OK, status: 200, data: 后端响应 }
    // 后端响应: { success: true, message: "...", data: [映射数组] }
    // 所以映射数组在 result.data.data 中

    let mappingData = null;

    if (result && result.success && result.data?.data && Array.isArray(result.data.data)) {
      // 标准情况：HTTP OK + 后端 success + data 数组
      console.log('[简历助手] 使用 result.data.data 调用 fillForms');
      mappingData = result.data.data;
    } else if (result && result.success && result.data?.success && result.data?.data) {
      // 后端也返回 success: true
      console.log('[简历助手] 后端返回 success，使用 result.data.data');
      mappingData = result.data.data;
    } else if (result && result.data && Array.isArray(result.data)) {
      // 直接是数组
      console.log('[简历助手] result.data 直接是数组');
      mappingData = result.data;
    } else if (result && result.data?.data && Array.isArray(result.data.data)) {
      // 不管 success，直接用 data
      console.log('[简历助手] 忽略 success，直接使用 result.data.data');
      mappingData = result.data.data;
    } else if (result && result.data) {
      // 最后尝试：直接用 result.data
      console.log('[简历助手] 使用 result.data 调用 fillForms (兜底)');
      mappingData = result.data;
    }

    if (mappingData) {
      console.log('[简历助手] 映射数据:', mappingData);
      // 映射完成，更新状态
      const statusEl = shadowRoot?.getElementById('status');
      if (statusEl) statusEl.textContent = '✅ 字段映射完成，开始填写...';
      fillForms(mappingData);
    } else {
      console.log('[简历助手] 映射失败，条件不满足');
      const statusEl = shadowRoot?.getElementById('status');
      if (statusEl) statusEl.textContent = '❌ 字段映射失败';
      alert('❌ 字段映射失败: ' + (result?.error || result?.data?.message || '未知错误'));
    }
  } catch (error) {
    console.error('[简历助手] 字段映射失败:', error);
    const statusEl = shadowRoot?.getElementById('status');
    if (statusEl) statusEl.textContent = '❌ 字段映射失败: ' + error.message;
    alert('❌ 字段映射失败: ' + error.message);
  }
}

/**
 * 逐元素映射填写（问题26）
 * 识别所有元素后，逐个调用LLM映射并填写
 * @param {Array} formElements - 表单元素列表
 * @param {Object} resumeData - 简历数据
 */
async function fillFormsSequentially(formElements, resumeData) {
  console.log('[简历助手] 开始逐元素映射填写，元素数量:', formElements.length);

  const total = formElements.length;
  let filledCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // 初始化里程碑状态 - 显示识别完成、映射和填写里程碑
  const currentShadowRoot = floatingPopup?.shadowRoot || shadowRoot;
  if (currentShadowRoot) {
    // 识别里程碑设为成功
    const milestoneIdentify = currentShadowRoot.getElementById('milestone-identify');
    if (milestoneIdentify) {
      milestoneIdentify.style.display = 'flex';
      milestoneIdentify.classList.remove('active', 'error');
      milestoneIdentify.classList.add('success');
    }
    const detailIdentify = currentShadowRoot.getElementById('detail-identify');
    if (detailIdentify) {
      detailIdentify.textContent = `✅ 已识别 ${total} 个表单元素`;
    }

    // 显示映射里程碑
    const milestoneMap = currentShadowRoot.getElementById('milestone-map');
    if (milestoneMap) {
      milestoneMap.style.display = 'flex';
      milestoneMap.classList.remove('success', 'error');
      milestoneMap.classList.add('active');
    }
    const detailMap = currentShadowRoot.getElementById('detail-map');
    if (detailMap) {
      detailMap.textContent = '正在逐字段映射...';
    }

    // 显示填写里程碑
    const milestoneFill = currentShadowRoot.getElementById('milestone-fill');
    if (milestoneFill) {
      milestoneFill.style.display = 'flex';
      milestoneFill.classList.remove('success', 'error');
      milestoneFill.classList.add('active');
    }
  }

  // 更新进度显示
  const updateProgressDisplay = (current, filled, failed, skipped, total) => {
    const currentShadowRoot = floatingPopup?.shadowRoot || shadowRoot;
    if (currentShadowRoot) {
      const detailFill = currentShadowRoot.getElementById('detail-fill');
      if (detailFill) {
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;
        detailFill.textContent = `正在映射填写... ${current}/${total} (${percent}%)`;
      }

      const summaryEl = currentShadowRoot.getElementById('progressSummary');
      if (summaryEl) {
        summaryEl.textContent = `进度: ${filled} 成功, ${skipped} 跳过, ${failed} 失败`;
      }

      // 强制触发重绘
      const progressEl = currentShadowRoot.getElementById('progress');
      if (progressEl) {
        void progressEl.offsetHeight;
      }
    }
  };

  // 遍历每个元素
  for (let i = 0; i < total; i++) {
    // 检查暂停状态
    while (fillingState.isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!fillingState.isRunning) return;
    }

    if (!fillingState.isRunning) {
      console.log('[简历助手] 填写已停止');
      return;
    }

    const element = formElements[i];
    const domElement = element.element;

    console.log(`[简历助手] [${i}/${total}] 处理字段: "${element.label}" (${element.type})`);

    // 构建字段信息
    const fieldInfo = {
      index: i,
      type: element.type,
      tagName: element.tagName,
      name: element.name,
      id: element.id,
      label: element.label,
      placeholder: element.placeholder,
      options: element.options || null,
      choices: element.choices || null
    };

    // 调用单字段映射 API
    let mappedValue = '';
    try {
      const result = await safeSendMessageWithResponse({
        action: 'api_mapping_single',
        data: {
          resumeData: resumeData,
          fieldInfo: fieldInfo
        }
      }, 30000); // 30秒超时

      if (result && result.success && result.data?.data) {
        mappedValue = result.data.data.value || '';
        console.log(`[简历助手] [${i}] 映射结果: "${mappedValue}"`);
      } else if (result && result.data?.value !== undefined) {
        mappedValue = result.data.value || '';
        console.log(`[简历助手] [${i}] 映射结果(直接): "${mappedValue}"`);
      } else {
        console.log(`[简历助手] [${i}] 映射失败，使用空值`);
      }
    } catch (error) {
      console.error(`[简历助手] [${i}] 映射请求失败:`, error.message);
      // 映射失败时继续处理下一个，不中断整个流程
    }

    // 更新进度（映射完成）
    updateProgressDisplay(i + 1, filledCount, failedCount, skippedCount, total);

    // 如果没有映射值，跳过填写
    if (!mappedValue) {
      console.log(`[简历助手] [${i}] 无映射值，跳过`);
      skippedCount++;
      if (visualFeedback && domElement) {
        visualFeedback.markSkipped(domElement, '无映射值');
      }
      continue;
    }

    // 确定用于视觉反馈的元素（统一使用 wrapper 或 domElement）
    const feedbackElement = element.wrapper || domElement;

    // 标记为填写中
    if (visualFeedback && feedbackElement) {
      visualFeedback.markFilling(feedbackElement);
    }

    // 填写该元素
    let filled = false;
    let fillResult = null;
    let fillError = null;
    const elementType = element.type;

    try {
      // Ant Design 组件处理
      if (elementType === 'ant-select' && element.wrapper) {
        fillResult = await fillAntSelect(element.wrapper, mappedValue, { timeout: 5000, fuzzyMatch: true });
        filled = fillResult.success;
        if (!filled) element.fillReason = fillResult.reason;
      } else if (elementType === 'ant-cascader' && element.wrapper) {
        fillResult = await fillAntCascader(element.wrapper, mappedValue, { timeout: 5000, delayBetween: 300 });
        filled = fillResult.success;
        if (!filled) element.fillReason = fillResult.reason;
      } else if ((elementType === 'ant-date' || elementType === 'ant-daterange') && element.wrapper) {
        fillResult = await fillAntPicker(element.wrapper, mappedValue);
        filled = fillResult.success;
        if (!filled) element.fillReason = fillResult.reason;
      } else if (elementType === 'ant-radio-group' && element.wrapper) {
        fillResult = fillAntRadioGroup(element.wrapper, mappedValue);
        filled = fillResult.success;
        if (!filled) element.fillReason = fillResult.reason;
      } else if (elementType === 'ant-checkbox-group' && element.wrapper) {
        fillResult = fillAntCheckboxGroup(element.wrapper, mappedValue);
        filled = fillResult.success;
        if (!filled) element.fillReason = fillResult.reason;
      } else if (domElement) {
        // 原生表单元素
        if (domElement.tagName === 'INPUT') {
          const inputType = domElement.type?.toLowerCase() || 'text';
          if (inputType === 'radio' || inputType === 'checkbox') {
            // 处理 radio/checkbox
            const inputElements = document.querySelectorAll(`input[name="${domElement.name}"]`);
            for (const input of inputElements) {
              if (input.value === mappedValue || input.nextSibling?.textContent?.includes(mappedValue)) {
                input.click();
                filled = true;
                break;
              }
            }
          } else {
            // 普通输入框
            domElement.value = mappedValue;
            domElement.dispatchEvent(new Event('input', { bubbles: true }));
            domElement.dispatchEvent(new Event('change', { bubbles: true }));
            filled = true;
          }
        } else if (domElement.tagName === 'SELECT') {
          // 下拉框
          const options = domElement.options;
          for (let j = 0; j < options.length; j++) {
            if (options[j].value === mappedValue || options[j].text === mappedValue ||
                options[j].text.includes(mappedValue) || mappedValue.includes(options[j].text)) {
              domElement.selectedIndex = j;
              domElement.dispatchEvent(new Event('change', { bubbles: true }));
              filled = true;
              break;
            }
          }
        } else if (domElement.tagName === 'TEXTAREA') {
          domElement.value = mappedValue;
          domElement.dispatchEvent(new Event('input', { bubbles: true }));
          domElement.dispatchEvent(new Event('change', { bubbles: true }));
          filled = true;
        }
      }
    } catch (error) {
      console.error(`[简历助手] [${i}] 填写出错:`, error);
      fillError = error;
      element.fillReason = error.message;
      // 记录填写出错
      recordFieldStatus(i, element, 'failed', {
        readSuccess: true,
        mapSuccess: true,
        mapValue: mappedValue,
        fillSuccess: false,
        reason: error.message
      });
    }

    // 更新状态
    if (filled) {
      filledCount++;
      if (visualFeedback && feedbackElement) {
        visualFeedback.markCompleted(feedbackElement);
      }
      console.log(`[简历助手] [${i}] ✅ 填写成功: "${element.label}" = "${mappedValue}"`);
      // 记录成功（可选，报告中只输出问题字段）
      recordFieldStatus(i, element, 'success', {
        readSuccess: true,
        mapSuccess: true,
        mapValue: mappedValue,
        fillSuccess: true
      });
    } else {
      failedCount++;
      // 获取失败原因（优先使用组件返回的原因，其次使用 catch 块捕获的错误）
      const failReason = element.fillReason || fillResult?.reason || fillError?.message || '填写操作失败';
      if (visualFeedback && feedbackElement) {
        visualFeedback.markFailed(feedbackElement, '❌ ' + failReason);
      }
      console.log(`[简历助手] [${i}] ❌ 填写失败: "${element.label}" - 原因: ${failReason}`);
      // 记录失败（如果之前没有记录过）
      const alreadyRecorded = fillingReport.fields.some(f => f.index === i);
      if (!alreadyRecorded) {
        recordFieldStatus(i, element, 'failed', {
          readSuccess: true,
          mapSuccess: true,
          mapValue: mappedValue,
          fillSuccess: false,
          reason: failReason
        });
      }
    }

    // 更新进度
    updateProgressDisplay(i + 1, filledCount, failedCount, skippedCount, total);

    // 添加小延迟
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // 填写完成
  console.log('[简历助手] ========== 逐元素映射填写完成 ==========');
  console.log(`[简历助手] 成功: ${filledCount}, 跳过: ${skippedCount}, 失败: ${failedCount}`);

  // 更新最终状态
  fillingState.isRunning = false;
  fillingState.isPaused = false;
  fillingState.isRestart = false;  // 重置重新填写标志
  safeSendMessage({ action: 'fillingComplete' });

  // 更新按钮状态和里程碑
  requestAnimationFrame(() => {
    try {
      const currentShadowRoot = floatingPopup?.shadowRoot || shadowRoot;
      if (!currentShadowRoot) return;

      const startBtn = currentShadowRoot.getElementById('startBtn');
      const pauseBtn = currentShadowRoot.getElementById('pauseBtn');
      const continueBtn = currentShadowRoot.getElementById('continueBtn');
      const restartBtn = currentShadowRoot.getElementById('restartBtn');
      const statusEl = currentShadowRoot.getElementById('status');

      if (startBtn) { startBtn.style.display = 'block'; startBtn.textContent = '开始填写'; }
      if (pauseBtn) pauseBtn.style.display = 'none';
      if (continueBtn) continueBtn.style.display = 'none';
      if (restartBtn) restartBtn.style.display = 'block';
      if (statusEl) statusEl.textContent = '✅ 填写完成！';

      // 隐藏所有里程碑，只显示完成里程碑
      ['identify', 'map', 'fill', 'complete'].forEach(m => {
        const el = currentShadowRoot.getElementById(`milestone-${m}`);
        if (el) el.style.display = 'none';
      });

      const milestoneComplete = currentShadowRoot.getElementById('milestone-complete');
      if (milestoneComplete) {
        milestoneComplete.style.display = 'flex';
        milestoneComplete.classList.remove('active', 'error');
        milestoneComplete.classList.add('success');
      }

      const detailComplete = currentShadowRoot.getElementById('detail-complete');
      if (detailComplete) {
        detailComplete.textContent = `✅ 已完成: 成功 ${filledCount}, 跳过 ${skippedCount}, 失败 ${failedCount}`;
      }
    } catch (e) {
      console.error('[简历助手] 更新按钮状态失败:', e);
    }
  });
}

// 填写表单
async function fillForms(mapping) {
  console.log('[简历助手] 开始填写表单，映射数据:', mapping);
  console.log('[简历助手] 表单元素数量:', fillingState.formElements.length);

  // ================== 移除所有危险操作 ==================
  // 不再自动点击编辑按钮、不再自动切换导航
  // 只填写当前可见的表单元素

  let filledCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const total = fillingState.formElements.length;

  // 将映射数组转换为按索引查找的 Map
  // LLM 返回格式: [{"index": 0, "value": "xxx"}, ...]
  const mappingMap = new Map();
  if (mapping && Array.isArray(mapping)) {
    mapping.forEach(item => {
      if (item && typeof item.index === 'number') {
        mappingMap.set(item.index, item.value);
      }
    });
  }
  console.log('[简历助手] 映射Map大小:', mappingMap.size);

  // 调试：打印所有映射关系
  console.log('[简历助手] 映射关系详情:');
  for (let idx = 0; idx < total; idx++) {
    const el = fillingState.formElements[idx];
    const val = mappingMap.get(idx);
    console.log(`  [${idx}] "${el?.label || el?.name || '未知'}" => "${val || '(无映射)'}"`);
  }

  // 更新进度显示 - 填写中只显示进度百分比，完成后显示详细数量
  const updateProgressDisplay = (filled, failed, skipped, total, isComplete = false) => {
    if (shadowRoot) {
      // 更新里程碑详情
      const detailFill = shadowRoot.getElementById('detail-fill');
      if (detailFill) {
        const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
        if (isComplete) {
          detailFill.textContent = `✅ 完成: ${percent}% (${filled}/${total})`;
        } else {
          detailFill.textContent = `正在填写... ${percent}%`;
        }
      }

      // 更新进度摘要 - 填写中隐藏详细数量
      const summaryEl = shadowRoot.getElementById('progressSummary');
      if (summaryEl) {
        const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
        if (isComplete) {
          // 完成后显示详细数量
          summaryEl.style.display = 'flex';
          summaryEl.innerHTML = `
            <div class="stat">
              <span>完成:</span>
              <span class="stat-value">${percent}%</span>
            </div>
            <div style="display: flex; gap: 12px;">
              <div class="stat">
                <span>✅</span>
                <span class="stat-value stat-success">${filled}</span>
              </div>
              ${failed > 0 ? `<div class="stat"><span>❌</span><span class="stat-value stat-fail">${failed}</span></div>` : ''}
              ${skipped > 0 ? `<div class="stat"><span>⏭️</span><span class="stat-value stat-skip">${skipped}</span></div>` : ''}
            </div>
          `;
        } else {
          // 填写中只显示进度
          summaryEl.style.display = 'flex';
          summaryEl.innerHTML = `
            <div class="stat">
              <span>进度:</span>
              <span class="stat-value">${percent}%</span>
            </div>
          `;
        }
      }

      // 更新状态
      const statusEl = shadowRoot.getElementById('status');
      if (statusEl) {
        if (isComplete) {
          statusEl.textContent = `✅ 填写完成`;
        } else {
          statusEl.textContent = `正在填写...`;
        }
      }
    }
  };

  // ================== 级联选择框处理 ==================
  // 支持自定义级联选择器（如智联招聘的 s-cascader）
  const processedCascadeElements = new Set();
  console.log('[简历助手] 级联选择框将尝试自动填写');

  // ================== 普通元素处理 ==================

  for (let i = fillingState.currentIndex; i < total; i++) {
    // 检查是否暂停
    while (fillingState.isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!fillingState.isRunning) return; // 如果停止了，直接返回
    }

    if (!fillingState.isRunning) return; // 如果停止了，直接返回

    const element = fillingState.formElements[i];
    const domElement = element?.element;

    // 使用 mappingMap 获取映射值（按索引查找，而不是按顺序）
    const mappedValue = mappingMap.get(i);

    // 调试日志
    console.log(`[简历助手] [${i}] 处理元素:`, {
      label: element?.label,
      name: element?.name,
      currentValue: element?.value,
      mappedValue: mappedValue
    });

    if (!element) {
      console.log(`[简历助手] [${i}] 跳过: 无元素`);
      skippedCount++;
      if (visualFeedback && domElement) {
        visualFeedback.markSkipped(domElement, '⏭️ 无元素');
      }
      continue;
    }

    // 跳过已处理的级联元素
    if (processedCascadeElements.has(element)) {
      console.log(`[简历助手] [${i}] 跳过: 已在级联组中处理 - "${element.label}"`);
      continue;
    }

    if (!mappedValue) {
      console.log(`[简历助手] [${i}] 无映射值 - "${element.label || element.name}"`);
      skippedCount++;
      // 记录报告
      recordFieldStatus(i, element, 'no_mapping', {
        readSuccess: true,
        mapSuccess: false,
        fillSuccess: false,
        reason: 'LLM未返回映射值'
      });
      if (visualFeedback && domElement) {
        visualFeedback.markNoMapping(domElement);
      }
      continue;
    }

    // 不覆盖已有内容（radio/checkbox 除外）- 但重新填写模式下要覆盖
    if (element.type !== 'radio' && element.type !== 'checkbox' && !fillingState.isRestart) {
      // 检查是否是占位符值（如"请选择"、"--请选择--"等）
      const isPlaceholderValue = (val) => {
        if (!val) return false;
        const placeholderPatterns = [
          '请选择', '--请选择--', '请输入', '--请输入--',
          '请填写', '选择', '输入', '填写',
          'select', 'choose', 'input', 'enter'
        ];
        const valLower = val.toLowerCase().trim();
        return placeholderPatterns.some(p => valLower === p.toLowerCase() || valLower === `--${p.toLowerCase()}--`);
      };

      if (element.value && element.value !== element.placeholder && !isPlaceholderValue(element.value)) {
        console.log(`[简历助手] [${i}] 跳过: 已有内容 - "${element.label}": "${element.value}"`);
        skippedCount++;
        // 记录跳过
        recordFieldStatus(i, element, 'skipped', {
          readSuccess: true,
          mapSuccess: true,
          mapValue: mappedValue,
          fillSuccess: false,
          reason: `已有内容: ${element.value}`
        });
        if (visualFeedback && domElement) {
          visualFeedback.markSkipped(domElement, '⏭️ 已有内容');
        }
        continue;
      }
    }

    // Radio/Checkbox 检查是否已有选中项 - 但重新填写模式下要覆盖
    if (element.type === 'radio' && element.checked && !fillingState.isRestart) {
      console.log(`[简历助手] [${i}] 跳过: Radio 已有选中项 - "${element.label}"`);
      skippedCount++;
      if (visualFeedback && domElement) {
        visualFeedback.markSkipped(domElement, '⏭️ 已选中');
      }
      continue;
    }
    // Checkbox 不跳过，因为可以多选

    // 标记为填写中（使用统一的 feedbackEl 逻辑）
    const feedbackEl = element.wrapper || domElement;
    if (visualFeedback && feedbackEl) {
      visualFeedback.markFilling(feedbackEl);
    }

    // ================== 初始化填写状态 ==================
    let filled = false;

    // ================== 优先使用 element.type 判断组件类型 ==================
    // element.type 在 identifyFormElements 中已经设置好了
    const elementType = element.type;
    console.log(`[简历助手] [${i}] 元素类型: ${elementType}, 标签: "${element.label}"`);

    // ================== Ant Design 组件处理 ==================
    if (elementType === 'ant-select' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 Ant Design 下拉框...`);
      try {
        const result = await fillAntSelect(element.wrapper, mappedValue, {
          timeout: 5000,
          fuzzyMatch: true
        });
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ Ant Design 下拉框填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        } else {
          element.fillReason = result.reason; // 保存失败原因
          console.log(`[简历助手] [${i}] ⚠️ Ant Design 下拉框填写失败: ${result.reason}`);
        }
      } catch (error) {
        element.fillReason = error.message; // 保存失败原因
        console.error(`[简历助手] [${i}] Ant Design 下拉框填写出错:`, error);
      }
    } else if (elementType === 'ant-cascader' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 Ant Design 级联选择器...`);
      try {
        const result = await fillAntCascader(element.wrapper, mappedValue, {
          timeout: 5000,
          delayBetween: 300
        });
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ Ant Design 级联选择器填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        } else {
          element.fillReason = result.reason; // 保存失败原因
          console.log(`[简历助手] [${i}] ⚠️ Ant Design 级联选择器填写失败: ${result.reason}`);
        }
      } catch (error) {
        element.fillReason = error.message; // 保存失败原因
        console.error(`[简历助手] [${i}] Ant Design 级联选择器填写出错:`, error);
      }
    } else if ((elementType === 'ant-date' || elementType === 'ant-daterange') && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 Ant Design 日期选择器...`);
      try {
        const result = await fillAntPicker(element.wrapper, mappedValue);
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ Ant Design 日期选择器填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        } else {
          element.fillReason = result.reason; // 保存失败原因
          console.log(`[简历助手] [${i}] ⚠️ Ant Design 日期选择器填写失败: ${result.reason}`);
        }
      } catch (error) {
        element.fillReason = error.message; // 保存失败原因
        console.error(`[简历助手] [${i}] Ant Design 日期选择器填写出错:`, error);
      }
    } else if (elementType === 'ant-radio-group' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 Ant Design 单选按钮组...`);
      try {
        const result = fillAntRadioGroup(element.wrapper, mappedValue);
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ Ant Design 单选按钮组填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        } else {
          element.fillReason = result.reason; // 保存失败原因
          console.log(`[简历助手] [${i}] ⚠️ Ant Design 单选按钮组填写失败: ${result.reason}`);
        }
      } catch (error) {
        element.fillReason = error.message; // 保存失败原因
        console.error(`[简历助手] [${i}] Ant Design 单选按钮组填写出错:`, error);
      }
    } else if (elementType === 'ant-checkbox-group' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 Ant Design 复选框组...`);
      try {
        const result = fillAntCheckboxGroup(element.wrapper, mappedValue);
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ Ant Design 复选框组填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        } else {
          element.fillReason = result.reason; // 保存失败原因
          console.log(`[简历助手] [${i}] ⚠️ Ant Design 复选框组填写失败: ${result.reason}`);
        }
      } catch (error) {
        element.fillReason = error.message; // 保存失败原因
        console.error(`[简历助手] [${i}] Ant Design 复选框组填写出错:`, error);
      }
    } else if (elementType === 'ant-input') {
      console.log(`[简历助手] [${i}] 尝试填写 Ant Design 输入框...`);
      // 找到实际的 input 元素
      let inputEl = element.element;
      if (element.wrapper && element.wrapper.tagName !== 'INPUT') {
        inputEl = element.wrapper.querySelector('input') || element.wrapper;
      }
      if (inputEl && inputEl.tagName === 'INPUT') {
        // 多次尝试设置值，确保框架能够正确接收
        for (let attempt = 0; attempt < 3 && !filled; attempt++) {
          console.log(`[简历助手] [${i}] ant-input 尝试 #${attempt + 1}`);
          triggerDataSync(inputEl, mappedValue);

          // 等待框架响应
          await new Promise(r => setTimeout(r, 100));
          const actualValue = inputEl.value;
          console.log(`[简历助手] [${i}] ant-input 设置后实际值: "${actualValue}"`);

          if (actualValue === mappedValue || actualValue.includes(mappedValue) || mappedValue.includes(actualValue)) {
            filled = true;
            console.log(`[简历助手] [${i}] ✅ Ant Design 输入框填写成功: "${element.label}" = "${mappedValue}"`);
            if (visualFeedback && feedbackEl) {
              visualFeedback.markCompleted(feedbackEl);
            }
          } else if (attempt < 2) {
            console.log(`[简历助手] [${i}] ⚠️ 值可能被框架重置，准备重试`);
          }
        }

        if (!filled) {
          element.fillReason = `值设置失败: 期望"${mappedValue}", 实际"${inputEl.value}"`;
          console.log(`[简历助手] [${i}] ❌ Ant Design 输入框填写失败: ${element.fillReason}`);
        }
      } else {
        // 回退：直接设置值
        if (element.wrapper) {
          element.wrapper.value = mappedValue;
          element.wrapper.dispatchEvent(new Event('input', { bubbles: true }));
          filled = true;
        }
      }
    }

    // ================== Vant 和 iView 组件处理 ==================
    if (!filled && elementType === 'vant-field' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 Vant 输入框...`);
      try {
        const result = fillVantField(element.wrapper, mappedValue);
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ Vant 输入框填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        }
      } catch (error) {
        console.error(`[简历助手] [${i}] Vant 输入框填写出错:`, error);
      }
    }

    if (!filled && elementType === 'ivu-select' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 iView 下拉框...`);
      try {
        const result = await fillIviewSelect(element.wrapper, mappedValue, {
          timeout: 5000,
          fuzzyMatch: true
        });
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ iView 下拉框填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        }
      } catch (error) {
        console.error(`[简历助手] [${i}] iView 下拉框填写出错:`, error);
      }
    }

    if (!filled && elementType === 'ivu-input' && element.wrapper) {
      console.log(`[简历助手] [${i}] 尝试填写 iView 输入框...`);
      try {
        const result = fillIviewInput(element.wrapper, mappedValue);
        if (result.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ iView 输入框填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        }
      } catch (error) {
        console.error(`[简历助手] [${i}] iView 输入框填写出错:`, error);
      }
    }

    // ================== 如果 Ant Design/Vant/iView 处理失败，继续检测 Element UI 组件 ==================
    if (!filled) {
      const elUIMatch = domElement ? identifyElementUIComponent(domElement) : null;
      if (elUIMatch) {
        console.log(`[简历助手] [${i}] 检测到 Element UI 组件: ${elUIMatch.type}, 标签: "${element.label}"`);

      // 特殊处理：下拉选择框需要先点击打开
      if (elUIMatch.type === 'el-select') {
        console.log(`[简历助手] [${i}] 尝试填写 Element UI 下拉框...`);
        try {
          const elUIResult = await smartFillElementUI(domElement, mappedValue, {
            timeout: 5000,
            fuzzyMatch: true
          });

          if (elUIResult.success) {
            filled = true;
            console.log(`[简历助手] [${i}] ✅ Element UI 下拉框填写成功: "${element.label}" = "${mappedValue}"`);
            await confirmSelectionIfNeeded(domElement);
            if (visualFeedback && elUIMatch.wrapper) {
              visualFeedback.markCompleted(elUIMatch.wrapper);
            }
          } else {
            console.log(`[简历助手] [${i}] ⚠️ Element UI 下拉框填写失败: ${elUIResult.reason}，尝试其他方式...`);
            // 不设置 filled，继续尝试其他方式
          }
        } catch (error) {
          console.error(`[简历助手] [${i}] Element UI 下拉框填写出错:`, error);
          // 继续尝试其他方式
        }
      } else {
        // 其他 Element UI 组件
        try {
          const elUIResult = await smartFillElementUI(domElement, mappedValue, {
            timeout: 3000,
            fuzzyMatch: true
          });

          if (elUIResult.success) {
            filled = true;
            console.log(`[简历助手] [${i}] ✅ Element UI 填写成功: "${element.label}" = "${mappedValue}"`);
            await confirmSelectionIfNeeded(domElement);
            if (visualFeedback && elUIMatch.wrapper) {
              visualFeedback.markCompleted(elUIMatch.wrapper);
            }
          } else {
            console.log(`[简历助手] [${i}] ⚠️ Element UI 填写失败: ${elUIResult.reason}`);
          }
        } catch (error) {
          console.error(`[简历助手] [${i}] Element UI 填写出错:`, error);
        }
      }
      } // 闭合 if (elUIMatch)

      if (filled) {
        filledCount++;
        fillingState.currentIndex = i + 1;
        updateProgressDisplay(filledCount, failedCount, skippedCount, total);
        safeSendMessage({
          action: 'fillingProgress',
          current: i + 1,
          total: total
        });
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }
    } // 闭合 if (!filled)

    // ================== 如果 Element UI 失败，尝试原生方式 ==================
    console.log(`[简历助手] [${i}] 尝试原生方式填写: ${element.tagName}, 类型: ${element.type}`);

    // 根据元素类型填写
    if (element.tagName === 'INPUT') {
      if (element.type === 'radio') {
        // Radio 单选框组处理 - 遍历所有选项找到匹配的
        const targetValue = mappedValue.toLowerCase().trim();
        for (const radioEl of element.elements || [element.element]) {
          const radioLabel = (findLabel(radioEl) || '').toLowerCase().trim();
          const radioValue = (radioEl.value || '').toLowerCase().trim();
          if (radioLabel === targetValue || radioValue === targetValue ||
              radioLabel.includes(targetValue) || targetValue.includes(radioLabel)) {
            radioEl.checked = true;
            radioEl.dispatchEvent(new Event('change', { bubbles: true }));
            radioEl.dispatchEvent(new Event('click', { bubbles: true }));
            filled = true;
            console.log(`[简历助手] [${i}] ✅ 选中 Radio: "${element.label}" = ${mappedValue}`);
            if (visualFeedback) {
              visualFeedback.markCompleted(radioEl);
            }
            break;
          }
        }
        if (!filled) {
          console.log(`[简历助手] [${i}] ❌ Radio 无匹配选项: "${element.label}" 想要 "${mappedValue}"`);
          failedCount++;
          if (visualFeedback && domElement) {
            visualFeedback.markFailed(domElement, '❌ 无匹配选项');
          }
        }
      } else if (element.type === 'checkbox') {
        // Checkbox 复选框组处理 - 支持多选
        const targetValues = Array.isArray(mappedValue) ? mappedValue : [mappedValue];
        for (const targetValue of targetValues) {
          const target = (targetValue || '').toLowerCase().trim();
          for (const checkboxEl of element.elements || [element.element]) {
            const cbLabel = (findLabel(checkboxEl) || '').toLowerCase().trim();
            const cbValue = (checkboxEl.value || '').toLowerCase().trim();
            if (cbLabel === target || cbValue === target ||
                cbLabel.includes(target) || target.includes(cbLabel)) {
              checkboxEl.checked = true;
              checkboxEl.dispatchEvent(new Event('change', { bubbles: true }));
              checkboxEl.dispatchEvent(new Event('click', { bubbles: true }));
              filled = true;
              console.log(`[简历助手] [${i}] ✅ 选中 Checkbox: "${cbLabel || cbValue}" = ${targetValue}`);
              if (visualFeedback) {
                visualFeedback.markCompleted(checkboxEl);
              }
              break;
            }
          }
        }
        if (!filled) {
          console.log(`[简历助手] [${i}] ❌ Checkbox 无匹配选项: "${element.label}" 想要 "${mappedValue}"`);
          failedCount++;
          if (visualFeedback && domElement) {
            visualFeedback.markFailed(domElement, '❌ 无匹配选项');
          }
        }
      } else {
        // 其他 input 类型处理
        let fillValue = mappedValue;

        // 特殊类型格式化处理
        if (element.type === 'date') {
          // 日期格式化为 YYYY-MM-DD
          fillValue = formatDateForInput(mappedValue);
        } else if (element.type === 'month') {
          // 月份格式化为 YYYY-MM
          fillValue = formatMonthForInput(mappedValue);
        } else if (element.type === 'number' || element.type === 'range') {
          // 数字处理：提取数字，检查范围
          const num = extractNumber(mappedValue);
          if (num !== null) {
            if (element.min && num < parseFloat(element.min)) {
              fillValue = element.min;
            } else if (element.max && num > parseFloat(element.max)) {
              fillValue = element.max;
            } else {
              fillValue = String(num);
            }
          }
        } else if (element.type === 'tel') {
          // 电话号码格式化
          fillValue = formatPhoneNumber(mappedValue);
        } else if (element.type === 'email') {
          // 邮箱格式化（转小写，去除空格）
          fillValue = mappedValue.toLowerCase().trim();
        } else if (element.type === 'url') {
          // URL 处理（确保有协议）
          fillValue = formatUrl(mappedValue);
        }

        element.element.value = fillValue;
        element.element.dispatchEvent(new Event('input', { bubbles: true }));
        element.element.dispatchEvent(new Event('change', { bubbles: true }));
        // 对于某些框架（如 React/Vue）可能需要触发 blur 事件
        element.element.dispatchEvent(new Event('blur', { bubbles: true }));
        filled = true;
        console.log(`[简历助手] [${i}] ✅ 填写(${element.type}): "${element.label || element.name}" = "${fillValue}"`);
        if (visualFeedback && domElement) {
          visualFeedback.markCompleted(domElement);
        }
      }
    } else if (element.tagName === 'SELECT') {
      // 下拉框处理 - 使用智能匹配
      const option = smartMatchOption(element.options, mappedValue, element.label);
      if (option) {
        element.element.value = option.value;
        element.element.dispatchEvent(new Event('change', { bubbles: true }));
        filled = true;
        console.log(`[简历助手] [${i}] ✅ 选择: "${element.label}" = "${option.text}" (${option.value})`);

        // 尝试确认选择（v1.5.0 新增）
        await confirmSelectionIfNeeded(element.element);

        if (visualFeedback && domElement) {
          visualFeedback.markCompleted(domElement);
        }
      } else {
        console.log(`[简历助手] [${i}] ❌ 下拉框无匹配选项: "${element.label}" 想要 "${mappedValue}"`);
        console.log(`[简历助手] 可用选项:`, element.options?.map(o => `${o.text}(${o.value})`));
        failedCount++;
        if (visualFeedback && domElement) {
          visualFeedback.markFailed(domElement, '❌ 无匹配选项');
        }
      }
    } else if (element.tagName === 'TEXTAREA') {
      element.element.value = mappedValue;
      element.element.dispatchEvent(new Event('input', { bubbles: true }));
      element.element.dispatchEvent(new Event('change', { bubbles: true }));
      filled = true;
      console.log(`[简历助手] [${i}] ✅ 填写文本域: "${element.label || element.name}"`);
      if (visualFeedback && domElement) {
        visualFeedback.markCompleted(domElement);
      }
    } else if (element.tagName === 'CUSTOM-CASCADER' || element.type === 'custom-cascader') {
      // 自定义级联选择器处理
      try {
        const cascaderResult = await fillCustomCascader(element.wrapper, mappedValue, {
          timeout: 5000,
          delayBetween: 300
        });

        if (cascaderResult.success) {
          filled = true;
          console.log(`[简历助手] [${i}] ✅ 自定义级联选择器填写成功: "${element.label}" = "${mappedValue}"`);
          if (visualFeedback && element.wrapper) {
            visualFeedback.markCompleted(element.wrapper);
          }
        } else {
          console.log(`[简历助手] [${i}] ❌ 自定义级联选择器填写失败: ${cascaderResult.reason}`);
          failedCount++;
          if (visualFeedback && domElement) {
            visualFeedback.markFailed(domElement, '❌ ' + cascaderResult.reason);
          }
        }
      } catch (error) {
        console.error(`[简历助手] [${i}] 自定义级联选择器填写出错:`, error);
        failedCount++;
        if (visualFeedback && domElement) {
          visualFeedback.markFailed(domElement, '❌ ' + error.message);
        }
      }
    } else if (element.type === 'contenteditable') {
      // Contenteditable 富文本编辑器处理
      element.element.textContent = mappedValue;
      element.element.dispatchEvent(new Event('input', { bubbles: true }));
      element.element.dispatchEvent(new Event('change', { bubbles: true }));
      // 某些富文本编辑器需要触发 blur 或自定义事件
      element.element.dispatchEvent(new Event('blur', { bubbles: true }));
      filled = true;
      console.log(`[简历助手] [${i}] ✅ 填写富文本: "${element.label || element.name}"`);
      if (visualFeedback && domElement) {
        visualFeedback.markCompleted(domElement);
      }
    }

    if (filled) {
      filledCount++;
      // 记录成功
      recordFieldStatus(i, element, 'success', {
        readSuccess: true,
        mapSuccess: true,
        mapValue: mappedValue,
        fillSuccess: true
      });
      // 确保成功状态已更新（防止某些分支遗漏）
      const feedbackEl = element.wrapper || domElement;
      if (visualFeedback && feedbackEl) {
        visualFeedback.markCompleted(feedbackEl);
      }
    } else {
      failedCount++;
      // 获取失败原因（检查是否有组件返回的原因）
      const failReason = element.fillReason || '填写操作失败';
      // 记录失败（如果之前没有记录过）
      const alreadyRecorded = fillingReport.fields.some(f => f.index === i);
      if (!alreadyRecorded) {
        recordFieldStatus(i, element, 'failed', {
          readSuccess: true,
          mapSuccess: true,
          mapValue: mappedValue,
          fillSuccess: false,
          reason: failReason
        });
      }
      // 确保失败状态已更新（防止某些分支遗漏）
      const feedbackEl = element.wrapper || domElement;
      if (visualFeedback && feedbackEl) {
        visualFeedback.markFailed(feedbackEl, '❌ ' + failReason);
      }
    }

    // 更新当前索引
    fillingState.currentIndex = i + 1;

    // 更新进度显示（使用实际成功数量）
    updateProgressDisplay(filledCount, failedCount, skippedCount, total);

    // 同时发送消息通知background
    safeSendMessage({
      action: 'fillingProgress',
      current: i + 1,
      total: total
    });

    // 添加小延迟，让用户能看到填写过程
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // 输出统计
  console.log('[简历助手] ========== 填写完成 ==========');
  console.log(`[简历助手] 总计: ${fillingState.formElements.length} 个字段`);
  console.log(`[简历助手] 成功: ${filledCount}, 跳过: ${skippedCount}, 失败: ${failedCount}`);

  // ================== 移除多条目自动填写 ==================
  // 不再自动切换导航填写教育经历、工作经历等
  // 用户需要手动切换到对应页面后再次点击"开始填写"
  console.log('[简历助手] 多条目经历需要用户手动切换页面后填写');

  // ================== OPT-003: 填写结果校验 ==================
  await verifyFillingResults(filledCount, failedCount, skippedCount);

  // ================== 输出填写报告 ==================
  // 供 MCP 或用户分析填写效果
  outputFillingReport();

  // 通知popup完成
  fillingState.isRunning = false;
  fillingState.isPaused = false;
  fillingState.isRestart = false;  // 重置重新填写标志

  // 发送完成消息
  console.log('[简历助手] 发送 fillingComplete 消息');
  safeSendMessage({ action: 'fillingComplete' });

  // 问题24修复：使用 requestAnimationFrame 确保 DOM 更新
  // 并使用正确的 shadowRoot 引用
  requestAnimationFrame(() => {
    try {
      // 使用全局 floatingPopup 变量获取正确的 shadowRoot
      const currentShadowRoot = floatingPopup?.shadowRoot || shadowRoot;

      if (!currentShadowRoot) {
        console.error('[简历助手] 无法找到 shadowRoot');
        return;
      }

      const startBtn = currentShadowRoot.getElementById('startBtn');
      const pauseBtn = currentShadowRoot.getElementById('pauseBtn');
      const continueBtn = currentShadowRoot.getElementById('continueBtn');
      const restartBtn = currentShadowRoot.getElementById('restartBtn');
      const statusEl = currentShadowRoot.getElementById('status');
      const progressEl = currentShadowRoot.getElementById('progress');

      console.log('[简历助手] 按钮元素状态:');
      console.log(`  startBtn: ${startBtn ? 'found' : 'not found'}`);
      console.log(`  pauseBtn: ${pauseBtn ? 'found' : 'not found'}`);
      console.log(`  continueBtn: ${continueBtn ? 'found' : 'not found'}`);
      console.log(`  restartBtn: ${restartBtn ? 'found' : 'not found'}`);

      if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.textContent = '开始填写';
        console.log('[简历助手] startBtn 已更新');
      }
      if (pauseBtn) {
        pauseBtn.style.display = 'none';
        console.log('[简历助手] pauseBtn 已隐藏');
      }
      if (continueBtn) {
        continueBtn.style.display = 'none';
        console.log('[简历助手] continueBtn 已隐藏');
      }
      if (restartBtn) {
        restartBtn.style.display = 'block';
        console.log('[简历助手] restartBtn 已显示');
      }
      if (statusEl) {
        statusEl.textContent = '✅ 填写完成！可以点击"重新填写"再次执行';
        console.log('[简历助手] statusEl 已更新');
      }
      if (progressEl && progressEl.textContent) {
        progressEl.textContent = progressEl.textContent.replace('已填', '完成');
      }

      // 更新里程碑状态 - 先隐藏所有里程碑，再显示完成里程碑
      ['identify', 'map', 'fill', 'complete'].forEach(m => {
        const el = currentShadowRoot.getElementById(`milestone-${m}`);
        if (el) el.style.display = 'none';
      });

      const milestoneComplete = currentShadowRoot.getElementById('milestone-complete');
      if (milestoneComplete) {
        milestoneComplete.style.display = 'flex';
        milestoneComplete.classList.remove('active', 'error');
        milestoneComplete.classList.add('success');
      }

      const detailComplete = currentShadowRoot.getElementById('detail-complete');
      if (detailComplete) {
        detailComplete.textContent = `✅ 已完成: 成功 ${filledCount}, 跳过 ${skippedCount}, 失败 ${failedCount}`;
      }

      console.log('[简历助手] ✅ 填写完成，按钮状态已更新');
    } catch (error) {
      console.error('[简历助手] 更新按钮状态失败:', error);
    }
  });
}

/**
 * 校验填写结果 (OPT-003)
 * @param {number} filledCount - 成功填写数
 * @param {number} failedCount - 失败数
 * @param {number} skippedCount - 跳过数
 */
async function verifyFillingResults(filledCount, failedCount, skippedCount) {
  console.log('[简历助手] 开始校验填写结果...');

  // 收集已填写的字段
  const filledFields = [];
  for (const el of fillingState.formElements) {
    const domEl = el.element;
    if (!domEl) continue;

    let currentValue = '';
    if (el.type === 'select') {
      currentValue = domEl.value || (domEl.options[domEl.selectedIndex]?.text || '');
    } else if (el.type === 'radio' || el.type === 'checkbox') {
      // 获取选中的值
      const checked = domEl.closest('form')?.querySelector(`input[name="${el.name}"]:checked`);
      currentValue = checked?.value || '';
    } else {
      currentValue = domEl.value || '';
    }

    if (currentValue) {
      filledFields.push({
        label: el.label,
        name: el.name,
        type: el.type,
        value: currentValue,
        required: domEl.required || domEl.closest('.is-required') !== null
      });
    }
  }

  if (filledFields.length === 0) {
    console.log('[简历助手] 没有已填写的字段，跳过校验');
    return;
  }

  // ================== 显示验证进度提示 ==================
  const statusEl = shadowRoot?.getElementById('status');
  const progressEl = shadowRoot?.getElementById('progress');
  if (statusEl) statusEl.textContent = '🔄 正在校验填写结果...';
  if (progressEl) progressEl.textContent = progressEl.textContent + ' (校验中...)';

  try {
    const result = await safeSendMessageWithResponse({
      action: 'api_verify',
      data: {
        formData: filledFields,
        resumeData: fillingState.resumeData
      }
    }, 30000);

    if (result && result.success && result.data?.data?.issues) {
      const issues = result.data.data.issues;
      if (issues.length > 0) {
        console.log('[简历助手] 校验发现 %d 个问题:', issues.length);
        issues.forEach((issue, i) => {
          console.log(`  [${i + 1}] ${issue.type}: ${issue.field} - ${issue.message}`);
        });

        // 在状态栏显示警告
        if (statusEl) statusEl.textContent = `⚠️ 填写完成，发现 ${issues.length} 个问题`;
        console.warn(`[简历助手] ⚠️ 填写完成，但发现 ${issues.length} 个问题，请检查`);
      } else {
        console.log('[简历助手] ✅ 校验通过，未发现问题');
        if (statusEl) statusEl.textContent = '✅ 填写完成，校验通过';
      }
    } else {
      if (statusEl) statusEl.textContent = '✅ 填写完成';
    }
  } catch (error) {
    console.log('[简历助手] 校验请求失败:', error.message);
    if (statusEl) statusEl.textContent = '✅ 填写完成（校验跳过）';
  }
}

// 暂停填写
function pauseFilling() {
  fillingState.isPaused = true;
  safeSendMessage({ action: 'fillingPaused' });
}

// 继续填写
function continueFilling() {
  fillingState.isPaused = false;
  safeSendMessage({ action: 'fillingResumed' });
}

console.log('简历自动填写助手 - Content Script 已加载');

// ================== 扩展更新通知 ==================

/**
 * 显示扩展更新通知，提示用户刷新页面
 */
function showUpdateNotification(previousVersion, currentVersion) {
  // 检查是否已经显示过通知（避免重复显示）
  if (document.getElementById('resume-filler-update-notification')) {
    return;
  }

  // 创建通知容器
  const notification = document.createElement('div');
  notification.id = 'resume-filler-update-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 16px;
    animation: slideDown 0.3s ease;
  `;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    #resume-filler-update-notification:hover {
      box-shadow: 0 8px 32px rgba(102, 126, 234, 0.6);
    }
    #resume-filler-refresh-btn {
      background: white;
      color: #667eea;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    #resume-filler-refresh-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 12px rgba(255, 255, 255, 0.3);
    }
    #resume-filler-close-btn {
      background: transparent;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.7;
      padding: 4px;
      line-height: 1;
    }
    #resume-filler-close-btn:hover {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);

  // 添加内容
  notification.innerHTML = `
    <span>🔄 简历助手已更新 (v${previousVersion} → v${currentVersion})</span>
    <button id="resume-filler-refresh-btn">刷新页面</button>
    <button id="resume-filler-close-btn">×</button>
  `;

  document.body.appendChild(notification);

  // 绑定事件
  document.getElementById('resume-filler-refresh-btn').addEventListener('click', () => {
    window.location.reload();
  });

  document.getElementById('resume-filler-close-btn').addEventListener('click', () => {
    notification.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => notification.remove(), 300);
  });

  // 10秒后自动消失
  setTimeout(() => {
    if (document.getElementById('resume-filler-update-notification')) {
      notification.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => notification.remove(), 300);
    }
  }, 10000);
}

// ================== 刷新提示弹窗 ==================

/**
 * 显示刷新提示弹窗（首次注入或扩展更新后）
 */
function showRefreshPrompt() {
  // 检查是否已经显示过
  if (document.getElementById('resume-filler-refresh-prompt')) {
    return;
  }

  // 创建提示容器
  const prompt = document.createElement('div');
  prompt.id = 'resume-filler-refresh-prompt';
  prompt.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    animation: fadeIn 0.3s ease;
  `;

  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    .resume-filler-prompt-content {
      background: white;
      border-radius: 12px;
      padding: 24px 32px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .resume-filler-prompt-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .resume-filler-prompt-title {
      font-size: 18px;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }
    .resume-filler-prompt-desc {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .resume-filler-prompt-buttons {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .resume-filler-btn-refresh {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .resume-filler-btn-refresh:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .resume-filler-btn-later {
      background: #f5f5f5;
      color: #666;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .resume-filler-btn-later:hover {
      background: #e8e8e8;
    }
  `;
  document.head.appendChild(style);

  // 添加内容
  prompt.innerHTML = `
    <div class="resume-filler-prompt-content">
      <div class="resume-filler-prompt-icon">🔄</div>
      <div class="resume-filler-prompt-title">需要刷新页面</div>
      <div class="resume-filler-prompt-desc">
        检测到简历助手需要更新。<br>
        请刷新页面后使用完整功能。
      </div>
      <div class="resume-filler-prompt-buttons">
        <button class="resume-filler-btn-refresh" id="prompt-refresh-btn">立即刷新</button>
        <button class="resume-filler-btn-later" id="prompt-later-btn">稍后再说</button>
      </div>
    </div>
  `;

  document.body.appendChild(prompt);

  // 绑定事件
  document.getElementById('prompt-refresh-btn').addEventListener('click', () => {
    window.location.reload();
  });

  document.getElementById('prompt-later-btn').addEventListener('click', () => {
    prompt.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => prompt.remove(), 300);
  });

  // 点击背景关闭
  prompt.addEventListener('click', (e) => {
    if (e.target === prompt) {
      prompt.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => prompt.remove(), 300);
    }
  });
}

// ================== 初始化 ==================

// 页面加载时检查版本更新
console.log('[简历助手] Content Script 已加载，版本:', SCRIPT_VERSION);
checkVersionUpdate();

// 初始化可视化反馈模块
function initVisualFeedback() {
  if (visualFeedback) return visualFeedback;

  // VisualFeedback 类现在在同一个文件中定义
  visualFeedback = new VisualFeedback();
  visualFeedback.init();

  return visualFeedback;
}

// 在页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initVisualFeedback();
  });
} else {
  initVisualFeedback();
}

// ================== 折叠区域监听模块 ==================

/**
 * FormObserver 类
 * 监听 DOM 变化，检测折叠区域展开和新增表单元素
 */
class FormObserver {
  constructor() {
    this.observer = null;
    this.knownElements = new Set();
    this.onNewElements = null;
    this.isObserving = false;
    // 已知的折叠区域选择器
    this.collapseSelectors = [
      '.collapse', '.collapsible', '.accordion',
      '.el-collapse', '.ant-collapse', '.van-collapse',
      '[data-toggle="collapse"]', '[data-collapse]',
      'details'  // HTML5 原生折叠元素
    ];
  }

  /**
   * 开始监听 DOM 变化
   * @param {Function} callback - 发现新元素时的回调函数
   */
  start(callback) {
    if (this.isObserving) {
      console.log('[FormObserver] 已在监听中');
      return;
    }

    this.onNewElements = callback;
    this.isObserving = true;

    // 记录当前已知的表单元素
    this.recordKnownElements();

    // 创建 MutationObserver
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    // 开始监听
    this.observer.observe(document.body, {
      childList: true,      // 监听子元素变化
      subtree: true,        // 监听所有后代元素
      attributes: true,     // 监听属性变化
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'open', 'expanded', 'aria-expanded']
    });

    // 监听折叠区域点击事件
    this.attachCollapseListeners();

    console.log('[FormObserver] 开始监听 DOM 变化');
  }

  /**
   * 停止监听
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.isObserving = false;
    console.log('[FormObserver] 已停止监听');
  }

  /**
   * 记录当前已知的表单元素
   */
  recordKnownElements() {
    const formElements = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    formElements.forEach(el => {
      this.knownElements.add(this.getElementKey(el));
    });
    console.log(`[FormObserver] 已记录 ${this.knownElements.size} 个已知元素`);
  }

  /**
   * 获取元素的唯一标识
   * @param {HTMLElement} element - 元素
   * @returns {string} 唯一标识
   */
  getElementKey(element) {
    return element.id || element.name || `${element.tagName}_${element.getBoundingClientRect().top}_${element.getBoundingClientRect().left}`;
  }

  /**
   * 处理 DOM 变化
   * @param {MutationRecord[]} mutations - 变化记录
   */
  handleMutations(mutations) {
    const newElements = [];

    for (const mutation of mutations) {
      // 处理子元素变化
      if (mutation.type === 'childList') {
        const addedElements = this.checkNewElements(mutation.addedNodes);
        newElements.push(...addedElements);
      }

      // 处理属性变化（折叠展开等）
      if (mutation.type === 'attributes') {
        const expandedElements = this.checkVisibilityChange(mutation.target);
        newElements.push(...expandedElements);
      }
    }

    // 如果发现新元素，触发回调
    if (newElements.length > 0 && this.onNewElements) {
      // 去重
      const uniqueElements = [...new Set(newElements)];
      console.log(`[FormObserver] 发现 ${uniqueElements.length} 个新表单元素`);
      this.onNewElements(uniqueElements);
    }
  }

  /**
   * 检查新增节点中的表单元素
   * @param {NodeList} nodes - 新增节点列表
   * @returns {Array} 新发现的表单元素
   */
  checkNewElements(nodes) {
    const newElements = [];

    nodes.forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      // 检查是否是表单元素
      if (this.isFormElement(node)) {
        const key = this.getElementKey(node);
        if (!this.knownElements.has(key)) {
          this.knownElements.add(key);
          newElements.push(node);
        }
      }

      // 检查子元素
      const childForms = node.querySelectorAll ? node.querySelectorAll('input, select, textarea, [contenteditable="true"]') : [];
      childForms.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.knownElements.has(key)) {
          this.knownElements.add(key);
          newElements.push(el);
        }
      });
    });

    return newElements;
  }

  /**
   * 检查元素是否为表单元素
   * @param {HTMLElement} element - 元素
   * @returns {boolean}
   */
  isFormElement(element) {
    const tagName = element.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) {
      return true;
    }
    if (element.getAttribute('contenteditable') === 'true') {
      return true;
    }
    return false;
  }

  /**
   * 检查元素可见性变化
   * @param {HTMLElement} element - 元素
   * @returns {Array} 新显示的表单元素
   */
  checkVisibilityChange(element) {
    const newElements = [];

    // 检查是否从隐藏变为可见
    const wasHidden = element.getAttribute('data-was-hidden') === 'true';
    const isNowVisible = this.isElementVisible(element);

    if (wasHidden && isNowVisible) {
      // 元素变为可见，检查其中的表单元素
      const formElements = element.querySelectorAll ? element.querySelectorAll('input, select, textarea, [contenteditable="true"]') : [];
      formElements.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.knownElements.has(key)) {
          this.knownElements.add(key);
          newElements.push(el);
        }
      });
    }

    // 更新隐藏状态标记
    element.setAttribute('data-was-hidden', !isNowVisible);

    // 检查折叠区域展开
    if (this.isCollapseExpanded(element)) {
      const formElements = element.querySelectorAll ? element.querySelectorAll('input, select, textarea, [contenteditable="true"]') : [];
      formElements.forEach(el => {
        const key = this.getElementKey(el);
        if (!this.knownElements.has(key)) {
          this.knownElements.add(key);
          newElements.push(el);
        }
      });
    }

    return newElements;
  }

  /**
   * 检查元素是否可见
   * @param {HTMLElement} element - 元素
   * @returns {boolean}
   */
  isElementVisible(element) {
    if (element.hidden) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;

    return true;
  }

  /**
   * 检查折叠区域是否展开
   * @param {HTMLElement} element - 元素
   * @returns {boolean}
   */
  isCollapseExpanded(element) {
    // HTML5 details 元素
    if (element.tagName === 'DETAILS' && element.open) {
      return true;
    }

    // Element UI collapse
    if (element.classList.contains('el-collapse-item__wrap') &&
        !element.classList.contains('is-hidden')) {
      return true;
    }

    // Ant Design collapse
    if (element.classList.contains('ant-collapse-content') &&
        element.classList.contains('ant-collapse-content-active')) {
      return true;
    }

    // 通用 aria-expanded
    const expanded = element.getAttribute('aria-expanded');
    if (expanded === 'true') {
      return true;
    }

    return false;
  }

  /**
   * 为折叠区域添加点击监听
   */
  attachCollapseListeners() {
    // 监听折叠区域标题点击
    this.collapseSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(collapse => {
        // 找到触发元素
        const trigger = collapse.querySelector('.collapse-header, .accordion-header, .el-collapse-item__header, .ant-collapse-header, summary');
        if (trigger && !trigger.hasAttribute('data-rf-listener')) {
          trigger.setAttribute('data-rf-listener', 'true');
          trigger.addEventListener('click', () => {
            // 延迟检查，等待动画完成
            setTimeout(() => {
              this.checkCollapseContent(collapse);
            }, 500);
          });
        }
      });
    });
  }

  /**
   * 检查折叠区域内容中的表单元素
   * @param {HTMLElement} collapse - 折叠区域元素
   */
  checkCollapseContent(collapse) {
    const newElements = [];

    // 查找内容区域
    const contentSelectors = [
      '.collapse-content', '.accordion-content',
      '.el-collapse-item__wrap', '.ant-collapse-content',
      '.van-collapse-item__content'
    ];

    contentSelectors.forEach(selector => {
      const contents = collapse.querySelectorAll(selector);
      contents.forEach(content => {
        if (this.isElementVisible(content)) {
          const formElements = content.querySelectorAll('input, select, textarea, [contenteditable="true"]');
          formElements.forEach(el => {
            const key = this.getElementKey(el);
            if (!this.knownElements.has(key)) {
              this.knownElements.add(key);
              newElements.push(el);
            }
          });
        }
      });
    });

    // 如果发现新元素，触发回调
    if (newElements.length > 0 && this.onNewElements) {
      console.log(`[FormObserver] 折叠展开发现 ${newElements.length} 个新表单元素`);
      this.onNewElements(newElements);
    }
  }

  /**
   * 重置已知元素列表
   */
  reset() {
    this.knownElements.clear();
    this.recordKnownElements();
  }
}

// 创建全局实例
let formObserver = null;

/**
 * 获取或创建 FormObserver 实例
 * @returns {FormObserver}
 */
function getFormObserver() {
  if (!formObserver) {
    formObserver = new FormObserver();
  }
  return formObserver;
}

/**
 * 启动表单监听
 * @param {Function} onNewElements - 发现新元素时的回调
 */
function startFormObserver(onNewElements) {
  const observer = getFormObserver();
  observer.start(onNewElements);
  return observer;
}

/**
 * 停止表单监听
 */
function stopFormObserver() {
  if (formObserver) {
    formObserver.stop();
  }
}

// 导出 FormObserver（如果需要）
if (typeof window !== 'undefined') {
  window.FormObserver = FormObserver;
}

// ================== JSON结构输出模块 ==================

/**
 * 导出表单结构为 JSON 格式
 * @param {Array} formElements - 表单元素列表（来自 identifyFormElements）
 * @returns {Object} JSON 结构对象
 */
function exportFormStructure(formElements) {
  const structure = {
    url: window.location.href,
    scanTime: new Date().toISOString(),
    totalElements: formElements.length,
    elements: []
  };

  formElements.forEach((el, index) => {
    const domEl = el.element;
    const isVisible = isElementVisible(domEl);
    const isInCollapse = isInCollapsedArea(domEl);

    structure.elements.push({
      index: index,
      label: el.label || '',
      type: el.type || '',
      tagName: el.tagName || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
      hasValue: !!(el.value && el.value !== el.placeholder),
      isVisible: isVisible,
      isCollapsed: isInCollapse,
      // 额外信息
      required: domEl ? domEl.required : false,
      disabled: domEl ? domEl.disabled : false,
      // 如果是 select，列出选项
      options: el.options ? el.options.map(opt => ({
        value: opt.value || '',
        text: opt.text || ''
      })) : null
    });
  });

  return structure;
}

/**
 * 检查元素是否可见
 * @param {HTMLElement} element - 元素
 * @returns {boolean}
 */
function isElementVisible(element) {
  if (!element) return false;

  // 检查隐藏属性
  if (element.hidden) return false;
  if (element.type === 'hidden') return false;

  // 检查样式
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;

  // 检查尺寸
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

/**
 * 检查元素是否在折叠区域内
 * @param {HTMLElement} element - 元素
 * @returns {boolean}
 */
function isInCollapsedArea(element) {
  if (!element) return false;

  // 常见折叠区域选择器
  const collapseSelectors = [
    '.collapse:not(.show)',           // Bootstrap
    '.accordion-collapse:not(.show)', // Bootstrap accordion
    '.el-collapse-item__wrap.is-hidden', // Element UI
    '.ant-collapse-content-hidden',   // Ant Design
    'details:not([open])'             // HTML5 details
  ];

  for (const selector of collapseSelectors) {
    const collapsed = element.closest(selector);
    if (collapsed) {
      return true;
    }
  }

  return false;
}

/**
 * 下载表单结构 JSON 文件
 * @param {Array} formElements - 表单元素列表
 * @param {string} filename - 文件名（可选）
 */
function downloadFormStructure(formElements, filename = 'web_form_structure.json') {
  const structure = exportFormStructure(formElements);
  const json = JSON.stringify(structure, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
  console.log('[简历助手] 表单结构已导出:', filename);
}

/**
 * 在控制台打印表单结构
 * @param {Array} formElements - 表单元素列表
 */
function logFormStructure(formElements) {
  const structure = exportFormStructure(formElements);
  console.log('[简历助手] 表单结构:');
  console.log(JSON.stringify(structure, null, 2));
  return structure;
}

// ================== 弹窗选择器自动确认模块 ==================

/**
 * PopupHandler 类
 * 处理弹窗选择器的自动确认
 */
class PopupHandler {
  constructor() {
    // 确认按钮文本列表
    this.confirmTexts = ['确定', '确认', '选择', '完成', '提交', 'OK', 'Apply', 'Confirm', 'Submit', 'Done'];
    // 取消按钮文本列表（用于跳过）
    this.cancelTexts = ['取消', '关闭', 'Cancel', 'Close', 'Dismiss'];
    // 已处理的弹窗
    this.processedPopups = new Set();
  }

  /**
   * 检测元素是否在弹窗选择器内
   * @param {HTMLElement} element - 元素
   * @returns {HTMLElement|null} 弹窗元素或 null
   */
  isPopupSelector(element) {
    const popupSelectors = [
      '.el-dialog', '.el-message-box',
      '.ant-modal', '.ant-modal-root',
      '.modal', '.modal-dialog',
      '[role="dialog"]',
      '.van-popup', '.van-dialog',
      '.ivu-modal'
    ];

    for (const selector of popupSelectors) {
      const popup = element.closest(selector);
      if (popup) {
        return popup;
      }
    }

    return null;
  }

  /**
   * 查找确认按钮
   * @param {HTMLElement} popup - 弹窗元素
   * @returns {HTMLElement|null} 确认按钮或 null
   */
  findConfirmButton(popup) {
    // 优先查找主要按钮
    const primarySelectors = [
      '.el-dialog__footer .el-button--primary',
      '.ant-modal-confirm-btns .ant-btn-primary',
      '.modal-footer .btn-primary',
      '.van-dialog__confirm',
      '.ivu-modal-footer .ivu-btn-primary'
    ];

    for (const selector of primarySelectors) {
      const btn = popup.querySelector(selector);
      if (btn) {
        return btn;
      }
    }

    // 遍历所有按钮，查找确认文本
    const buttons = popup.querySelectorAll('button, .btn, [role="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      // 检查是否是确认按钮
      if (this.confirmTexts.some(t => text.includes(t))) {
        // 确保不是取消按钮
        if (!this.cancelTexts.some(t => text.includes(t))) {
          return btn;
        }
      }
    }

    return null;
  }

  /**
   * 自动确认弹窗
   * @param {HTMLElement} popup - 弹窗元素
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {Promise<boolean>} 是否成功
   */
  async autoConfirm(popup, delay = 100) {
    if (!popup) return false;

    // 生成弹窗ID，避免重复处理
    const popupId = this.getPopupId(popup);
    if (this.processedPopups.has(popupId)) {
      console.log('[PopupHandler] 弹窗已处理，跳过');
      return false;
    }

    // 延迟等待选择完成
    await new Promise(resolve => setTimeout(resolve, delay));

    // 查找确认按钮
    const confirmBtn = this.findConfirmButton(popup);
    if (confirmBtn) {
      console.log('[PopupHandler] 找到确认按钮，准备点击');
      confirmBtn.click();
      this.processedPopups.add(popupId);
      return true;
    }

    console.log('[PopupHandler] 未找到确认按钮');
    return false;
  }

  /**
   * 获取弹窗唯一ID
   * @param {HTMLElement} popup - 弹窗元素
   * @returns {string}
   */
  getPopupId(popup) {
    return popup.id || popup.className || `popup_${Date.now()}`;
  }

  /**
   * 监听弹窗出现
   * @param {Function} onPopup - 弹窗出现时的回调
   */
  watchForPopups(onPopup) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 检查是否是弹窗
              const popup = this.isPopupSelector(node);
              if (popup) {
                console.log('[PopupHandler] 检测到弹窗出现');
                if (onPopup) {
                  onPopup(popup);
                }
              }
              // 检查子元素
              const popups = node.querySelectorAll ? node.querySelectorAll('.el-dialog, .ant-modal, [role="dialog"]') : [];
              popups.forEach(p => {
                console.log('[PopupHandler] 检测到嵌套弹窗');
                if (onPopup) {
                  onPopup(p);
                }
              });
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  /**
   * 清理已处理的弹窗记录
   */
  clearProcessed() {
    this.processedPopups.clear();
  }
}

// 创建全局实例
let popupHandler = null;

/**
 * 获取或创建 PopupHandler 实例
 * @returns {PopupHandler}
 */
function getPopupHandler() {
  if (!popupHandler) {
    popupHandler = new PopupHandler();
  }
  return popupHandler;
}

/**
 * 自动确认弹窗选择器
 * @param {HTMLElement} element - 触发元素（可选）
 * @param {number} delay - 延迟时间
 * @returns {Promise<boolean>}
 */
async function autoConfirmPopup(element = null, delay = 100) {
  const handler = getPopupHandler();

  // 如果提供了元素，检查其所在弹窗
  if (element) {
    const popup = handler.isPopupSelector(element);
    if (popup) {
      return handler.autoConfirm(popup, delay);
    }
  }

  // 否则查找当前页面上的弹窗
  const popupSelectors = ['.el-dialog:not([style*="display: none"])',
    '.ant-modal:not([style*="display: none"])',
    '[role="dialog"]:not([style*="display: none"])'];

  for (const selector of popupSelectors) {
    const popup = document.querySelector(selector);
    if (popup) {
      return handler.autoConfirm(popup, delay);
    }
  }

  return false;
}

// 导出
if (typeof window !== 'undefined') {
  window.exportFormStructure = exportFormStructure;
  window.downloadFormStructure = downloadFormStructure;
  window.logFormStructure = logFormStructure;
  window.PopupHandler = PopupHandler;
  window.autoConfirmPopup = autoConfirmPopup;
}

// ================== 状态管理模块 ==================

/**
 * StateManager 类
 * 管理填写状态的保存和恢复
 */
class StateManager {
  constructor() {
    this.storageKey = 'resume-filler-state';
    this.version = 1; // 状态版本号，用于兼容性检查
  }

  /**
   * 保存状态到 sessionStorage
   * @param {Object} state - 要保存的状态
   */
  save(state) {
    try {
      const data = {
        version: this.version,
        url: window.location.href,
        domain: window.location.hostname,
        path: window.location.pathname,
        timestamp: Date.now(),
        // 填写状态
        isRunning: state.isRunning || false,
        isPaused: state.isPaused || false,
        currentIndex: state.currentIndex || 0,
        totalCount: state.totalCount || 0,
        filledCount: state.filledCount || 0,
        skippedCount: state.skippedCount || 0,
        failedCount: state.failedCount || 0,
        // 简历版本ID（如果有）
        versionId: state.versionId || null
      };

      sessionStorage.setItem(this.storageKey, JSON.stringify(data));
      console.log('[StateManager] 状态已保存:', data);
    } catch (e) {
      console.error('[StateManager] 保存状态失败:', e);
    }
  }

  /**
   * 从 sessionStorage 加载状态
   * @returns {Object|null} 恢复的状态或 null
   */
  load() {
    try {
      const data = sessionStorage.getItem(this.storageKey);
      if (!data) return null;

      const parsed = JSON.parse(data);
      console.log('[StateManager] 加载状态:', parsed);

      // 版本兼容性检查
      if (parsed.version !== this.version) {
        console.log('[StateManager] 状态版本不匹配，清理旧状态');
        this.clear();
        return null;
      }

      // 检查是否同一网站
      if (parsed.domain !== window.location.hostname) {
        console.log('[StateManager] 不同网站，清理状态');
        this.clear();
        return null;
      }

      // 检查状态是否过期（超过30分钟）
      const age = Date.now() - (parsed.timestamp || 0);
      if (age > 30 * 60 * 1000) {
        console.log('[StateManager] 状态已过期，清理');
        this.clear();
        return null;
      }

      return parsed;
    } catch (e) {
      console.error('[StateManager] 加载状态失败:', e);
      return null;
    }
  }

  /**
   * 清除保存的状态
   */
  clear() {
    try {
      sessionStorage.removeItem(this.storageKey);
      console.log('[StateManager] 状态已清除');
    } catch (e) {
      console.error('[StateManager] 清除状态失败:', e);
    }
  }

  /**
   * 检查是否有保存的状态
   * @returns {boolean}
   */
  hasState() {
    const state = this.load();
    return state !== null && state.isRunning;
  }

  /**
   * 获取状态摘要
   * @returns {Object|null}
   */
  getSummary() {
    const state = this.load();
    if (!state) return null;

    return {
      progress: `已填 ${state.filledCount}/${state.totalCount}`,
      isPaused: state.isPaused,
      age: Math.round((Date.now() - state.timestamp) / 1000), // 秒
      path: state.path
    };
  }
}

// 创建全局实例
let stateManager = null;

/**
 * 获取或创建 StateManager 实例
 * @returns {StateManager}
 */
function getStateManager() {
  if (!stateManager) {
    stateManager = new StateManager();
  }
  return stateManager;
}

/**
 * 保存填写状态
 * @param {Object} state - 状态对象
 */
function saveFillingState(state) {
  const manager = getStateManager();
  manager.save(state);
}

/**
 * 恢复填写状态
 * @returns {Object|null}
 */
function restoreFillingState() {
  const manager = getStateManager();
  return manager.load();
}

/**
 * 清除填写状态
 */
function clearFillingState() {
  const manager = getStateManager();
  manager.clear();
}

/**
 * 检查并提示恢复状态
 */
function checkAndPromptRestore() {
  const manager = getStateManager();
  const state = manager.load();

  if (!state || !state.isRunning) return false;

  // 检查是否是暂停状态
  if (state.isPaused && state.currentIndex < state.totalCount) {
    const summary = manager.getSummary();
    console.log('[StateManager] 发现未完成的填写:', summary);

    // 返回状态信息，由调用方决定是否提示用户
    return {
      shouldRestore: true,
      state: state,
      summary: summary
    };
  }

  return false;
}

/**
 * 在页面刷新前保存状态
 */
function setupBeforeUnloadHandler() {
  window.addEventListener('beforeunload', (e) => {
    // 只有在填写进行中或暂停时才保存
    if (fillingState.isRunning || fillingState.isPaused) {
      saveFillingState({
        isRunning: fillingState.isRunning,
        isPaused: fillingState.isPaused,
        currentIndex: fillingState.currentIndex,
        totalCount: fillingState.formElements.length,
        filledCount: fillingState.filledCount || 0,
        skippedCount: fillingState.skippedCount || 0,
        failedCount: fillingState.failedCount || 0,
        versionId: fillingState.resumeData?.version_id || null
      });
    }
  });
}

/**
 * 页面加载时恢复状态（如果需要）
 */
function restoreStateOnLoad() {
  const restoreInfo = checkAndPromptRestore();

  if (restoreInfo && restoreInfo.shouldRestore) {
    console.log('[StateManager] 可以恢复上次未完成的填写');
    console.log('[StateManager] 进度:', restoreInfo.summary.progress);
    console.log('[StateManager] 提示用户是否继续');

    // 这里可以显示一个提示框询问用户是否继续
    // 暂时通过日志提示
    // 实际使用时可以在浮动弹窗中显示"继续上次填写"按钮
  }
}

// 导出 StateManager
if (typeof window !== 'undefined') {
  window.StateManager = StateManager;
  window.saveFillingState = saveFillingState;
  window.restoreFillingState = restoreFillingState;
  window.clearFillingState = clearFillingState;
}

// ================== 错误处理模块 ==================

/**
 * 错误类型枚举
 */
const ErrorType = {
  NETWORK: 'NETWORK',           // 网络错误
  PARSE: 'PARSE',               // 解析错误
  FILL: 'FILL',                 // 填写错误
  VALIDATION: 'VALIDATION',     // 验证错误
  UNKNOWN: 'UNKNOWN'            // 未知错误
};

/**
 * 错误信息配置
 */
const ErrorMessages = {
  [ErrorType.NETWORK]: {
    title: '网络错误',
    message: '无法连接到服务器，请检查网络连接',
    solution: '请确保后端服务已启动（运行 start.bat）'
  },
  [ErrorType.PARSE]: {
    title: '解析错误',
    message: '简历解析失败',
    solution: '请检查简历格式是否正确，支持 DOCX、TXT、XLSX 格式'
  },
  [ErrorType.FILL]: {
    title: '填写错误',
    message: '表单填写过程中出现错误',
    solution: '请检查页面是否正常加载，或尝试手动填写'
  },
  [ErrorType.VALIDATION]: {
    title: '验证错误',
    message: '数据验证失败',
    solution: '请检查简历信息是否完整'
  },
  [ErrorType.UNKNOWN]: {
    title: '未知错误',
    message: '发生了未预期的错误',
    solution: '请刷新页面重试，或联系技术支持'
  }
};

/**
 * ErrorHandler 类
 * 统一错误处理
 */
class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 50; // 最多保存50条错误记录
  }

  /**
   * 记录错误
   * @param {string} type - 错误类型
   * @param {string} message - 错误消息
   * @param {Object} details - 详细信息
   */
  log(type, message, details = {}) {
    const error = {
      type,
      message,
      details,
      timestamp: new Date().toISOString(),
      url: window.location.href
    };

    this.errors.push(error);

    // 限制错误记录数量
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // 输出到控制台
    console.error(`[ErrorHandler] ${ErrorMessages[type]?.title || type}: ${message}`, details);

    return error;
  }

  /**
   * 获取用户友好的错误提示
   * @param {string} type - 错误类型
   * @returns {Object} 错误提示信息
   */
  getUserMessage(type) {
    const config = ErrorMessages[type] || ErrorMessages[ErrorType.UNKNOWN];
    return {
      title: config.title,
      message: config.message,
      solution: config.solution
    };
  }

  /**
   * 显示错误提示（可集成到浮动弹窗）
   * @param {string} type - 错误类型
   * @param {string} customMessage - 自定义消息（可选）
   */
  showError(type, customMessage = null) {
    const config = this.getUserMessage(type);
    const message = customMessage || config.message;

    // 可以集成到浮动弹窗的状态显示
    console.warn(`[简历助手] ${config.title}: ${message}`);
    console.warn(`[简历助手] 建议: ${config.solution}`);

    return {
      title: config.title,
      message: message,
      solution: config.solution
    };
  }

  /**
   * 获取所有错误记录
   * @returns {Array}
   */
  getErrors() {
    return [...this.errors];
  }

  /**
   * 清除错误记录
   */
  clear() {
    this.errors = [];
  }
}

// 创建全局错误处理器
let errorHandler = null;

function getErrorHandler() {
  if (!errorHandler) {
    errorHandler = new ErrorHandler();
  }
  return errorHandler;
}

// ================== 性能优化模块 ==================

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function}
 */
function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要执行的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function}
 */
function throttle(func, limit = 100) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 批量 DOM 操作优化
 * @param {Array} operations - 操作列表
 * @param {number} batchSize - 每批处理数量
 */
async function batchOperations(operations, batchSize = 10) {
  for (let i = 0; i < operations.length; i += batchSize) {
    const batch = operations.slice(i, i + batchSize);
    batch.forEach(op => {
      try {
        op();
      } catch (e) {
        console.error('[batchOperations] 操作失败:', e);
      }
    });
    // 让出主线程
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * 性能监控
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {};
  }

  /**
   * 开始计时
   * @param {string} name - 计时名称
   */
  start(name) {
    this.metrics[name] = {
      start: performance.now(),
      end: null,
      duration: null
    };
  }

  /**
   * 结束计时
   * @param {string} name - 计时名称
   * @returns {number} 耗时（毫秒）
   */
  end(name) {
    if (!this.metrics[name]) return null;

    this.metrics[name].end = performance.now();
    this.metrics[name].duration = this.metrics[name].end - this.metrics[name].start;

    return this.metrics[name].duration;
  }

  /**
   * 获取性能报告
   * @returns {Object}
   */
  getReport() {
    const report = {};
    Object.keys(this.metrics).forEach(name => {
      if (this.metrics[name].duration !== null) {
        report[name] = `${this.metrics[name].duration.toFixed(2)}ms`;
      }
    });
    return report;
  }

  /**
   * 打印性能报告
   */
  printReport() {
    console.log('[PerformanceMonitor] 性能报告:');
    const report = this.getReport();
    Object.keys(report).forEach(name => {
      console.log(`  ${name}: ${report[name]}`);
    });
  }
}

// 创建全局性能监控器
let performanceMonitor = null;

function getPerformanceMonitor() {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor;
}

// ================== 复杂场景支持 (v1.5.0) ==================

/**
 * 点击编辑按钮（如果需要）
 * @returns {Promise<boolean>} 是否成功进入编辑模式
 */
async function clickEditButtonIfNeeded() {
  // ================== 邮储银行特殊处理 ==================
  // 检查邮储银行特有的编辑按钮结构: .icon-box.icon-box-only 包含"编辑"文本
  const psbcEditBox = document.querySelector('.icon-box.icon-box-only');
  if (psbcEditBox && psbcEditBox.textContent.includes('编辑')) {
    console.log('[复杂场景] 检测到邮储银行编辑按钮，点击进入编辑模式');
    psbcEditBox.click();
    await new Promise(resolve => setTimeout(resolve, 800));

    // 检查是否有确认弹窗
    const dialog = document.querySelector('.el-dialog, .el-message-box');
    if (dialog) {
      // 查找确认按钮（修复：使用有效选择器）
      const buttons = dialog.querySelectorAll('.el-button--primary, button');
      for (const btn of buttons) {
        if (btn.textContent.includes('确定') || btn.textContent.includes('确认')) {
          btn.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
        }
      }
    }

    console.log('[复杂场景] 已进入编辑模式 (邮储银行)');
    return true;
  }

  // 检查是否已有编辑按钮
  const headerEditBtn = document.querySelector('.header .el-button');
  if (headerEditBtn && !headerEditBtn.disabled) {
    // 检查是否包含编辑图标
    if (headerEditBtn.querySelector('.el-icon-edit') || headerEditBtn.textContent.includes('编辑')) {
      headerEditBtn.click();
      await new Promise(resolve => setTimeout(resolve, 300));

      // 检查确认弹窗
      const confirmBtn = document.querySelector('.edit-prompt .el-button--primary');
      if (confirmBtn) {
        confirmBtn.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[复杂场景] 已进入编辑模式');
        return true;
      }
    }
  }

  // 检查页面上的编辑按钮
  const editBtns = document.querySelectorAll('button, .el-button');
  for (const btn of editBtns) {
    if (btn.textContent.includes('编辑') || btn.textContent.includes('Edit')) {
      btn.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    }
  }

  // 检查其他可能的编辑按钮结构（如 zl_font 图标类）
  const otherEditBtns = document.querySelectorAll('[class*="edit"], [class*="Edit"]');
  for (const btn of otherEditBtns) {
    if (btn.textContent.includes('编辑') || btn.textContent.includes('Edit')) {
      btn.click();
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    }
  }

  return false;
}

/**
 * 点击保存按钮（如果存在）
 * @returns {Promise<boolean>} 是否成功保存
 */
async function clickSaveButtonIfNeeded() {
  // 查找保存按钮
  const saveBtns = document.querySelectorAll('button, .el-button');
  for (const btn of saveBtns) {
    const text = btn.textContent.trim();
    if (text === '保存' || text === '确定' || text === '确认' || text === '提交') {
      console.log('[简历助手] 检测到保存按钮，点击保存...');
      btn.click();
      await new Promise(resolve => setTimeout(resolve, 1000)); // 等待保存完成
      return true;
    }
  }
  return false;
}

/**
 * 等待页面保存完成
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<boolean>} 是否保存完成
 */
async function waitForSaveComplete(timeout = 3000) {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = () => {
      // 检查是否有保存成功提示
      const successMsg = document.querySelector('.el-message--success, .ant-message-success');
      if (successMsg) {
        console.log('[简历助手] 检测到保存成功提示');
        resolve(true);
        return;
      }

      // 检查是否还在加载中
      const loading = document.querySelector('.el-loading-mask, .el-loading-spinner');
      if (loading) {
        if (Date.now() - startTime < timeout) {
          setTimeout(check, 200);
          return;
        }
      }

      // 超时或没有加载中，认为保存完成
      if (Date.now() - startTime >= timeout) {
        console.log('[简历助手] 等待保存超时，继续执行');
      }
      resolve(true);
    };

    // 先等待一小段时间让保存操作开始
    setTimeout(check, 500);
  });
}

/**
 * 安全切换到下一个区域（先保存当前区域）
 * @param {string} nextSectionName - 下一个区域名称
 * @returns {Promise<boolean>} 是否成功切换
 */
async function safeNavigateToSection(nextSectionName) {
  // 1. 先尝试保存当前区域
  const saved = await clickSaveButtonIfNeeded();
  if (saved) {
    await waitForSaveComplete();
  }

  // 2. 切换到下一个区域
  return await navigateToSection(nextSectionName);
}

/**
 * 导航到指定表单区域
 * @param {string} sectionName - 区域名称（如"基本信息"、"教育背景"）
 * @returns {Promise<boolean>} 是否成功导航
 */
async function navigateToSection(sectionName) {
  // ================== 邮储银行特殊处理 ==================
  // 检查邮储银行特有的菜单结构: .resume-menu-item
  const psbcMenuItems = document.querySelectorAll('.resume-menu-item');
  if (psbcMenuItems.length > 0) {
    for (const item of psbcMenuItems) {
      const titleEl = item.querySelector('.resume-menu-item__title');
      if (titleEl && titleEl.textContent.includes(sectionName)) {
        // 检查是否已经是活动状态
        if (!item.classList.contains('resume-menu-item--active')) {
          item.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log(`[复杂场景] 已导航到: ${sectionName} (邮储银行)`);
        }
        return true;
      }
    }
  }

  // 通用菜单导航
  const menuItems = document.querySelectorAll('.menu-item, .nav-item, [role="menuitem"]');
  for (const item of menuItems) {
    if (item.textContent.includes(sectionName)) {
      if (!item.classList.contains('active')) {
        item.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[复杂场景] 已导航到: ${sectionName}`);
      }
      return true;
    }
  }
  return false;
}

/**
 * 填写下拉表格选择
 * @param {HTMLElement} element - 触发元素
 * @param {string} value - 要选择的值
 * @returns {Promise<Object>} 填写结果
 */
async function fillTableSelect(element, value) {
  try {
    // 点击触发下拉
    element.click();
    await new Promise(resolve => setTimeout(resolve, 300));

    // 等待表格弹窗出现
    const dialog = await waitForElementUI('.el-dialog__wrapper:not([style*="display: none"])', 3000);
    if (!dialog) {
      return { success: false, reason: '表格弹窗未出现' };
    }

    // 在表格中搜索匹配行
    const rows = dialog.querySelectorAll('.el-table__row');
    for (const row of rows) {
      if (row.textContent.includes(value)) {
        row.click();
        await new Promise(resolve => setTimeout(resolve, 200));

        // 点击确认按钮
        const confirmBtn = dialog.querySelector('.el-button--primary');
        if (confirmBtn) {
          confirmBtn.click();
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`[复杂场景] 表格选择成功: ${value}`);
        return { success: true, value };
      }
    }

    // 关闭弹窗
    const cancelBtn = dialog.querySelector('.el-button:not(.el-button--primary)');
    if (cancelBtn) cancelBtn.click();

    return { success: false, reason: '未找到匹配的表格行' };
  } catch (error) {
    console.error('[复杂场景] 表格选择失败:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * 确认下拉框选择（如果需要）
 * @param {HTMLElement} element - 下拉框元素
 * @returns {Promise<boolean>} 是否需要确认
 */
async function confirmSelectionIfNeeded(element) {
  // 查找确认提示区域
  const container = element.closest('.el-form-item') || element.parentElement;
  if (!container) return false;

  // 检查是否有确认按钮
  const confirmArea = container.querySelector('.pending-select');
  if (confirmArea) {
    const confirmBtn = confirmArea.querySelector('.el-button');
    if (confirmBtn) {
      await new Promise(resolve => setTimeout(resolve, 100));
      confirmBtn.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('[复杂场景] 已确认下拉选择');
      return true;
    }
  }

  return false;
}

/**
 * 填写多条目经历（工作经历、教育经历等）
 * @param {string} sectionName - 区域名称
 * @param {Array} dataArray - 数据数组
 * @param {Object} fieldMapping - 字段映射配置
 * @returns {Promise<Object>} 填写结果
 */
async function fillMultipleEntries(sectionName, dataArray, fieldMapping = {}) {
  const results = { success: 0, failed: 0, details: [] };

  if (!dataArray || dataArray.length === 0) {
    return results;
  }

  // 按时间排序
  // 教育经历：按开始时间正序（最早的在前）
  // 工作/项目经历：按开始时间倒序（最近的在前）
  const sortedData = [...dataArray].sort((a, b) => {
    const aStart = a.startDate || a.start_date || '';
    const bStart = b.startDate || b.start_date || '';

    if (sectionName.includes('教育') || sectionName.includes('education')) {
      // 教育经历：正序（本科 → 硕士 → 博士）
      return aStart.localeCompare(bStart);
    } else {
      // 工作/项目经历：倒序（最近的工作在前）
      return bStart.localeCompare(aStart);
    }
  });

  console.log(`[复杂场景] ${sectionName} 数据已按时间排序，共 ${sortedData.length} 条`);

  // 导航到对应区域
  await navigateToSection(sectionName);
  await clickEditButtonIfNeeded();

  for (let i = 0; i < sortedData.length; i++) {
    const entry = sortedData[i];

    try {
      // 点击添加按钮
      const addBtn = findButtonByText(`添加${sectionName}`, '添加', '新增');
      if (addBtn) {
        addBtn.click();
        await new Promise(resolve => setTimeout(resolve, 400));
      }

      // 填写表单字段
      const formContainer = document.querySelector('.experience-form');
      if (formContainer) {
        for (const [key, value] of Object.entries(entry)) {
          if (!value) continue;

          const fieldConfig = fieldMapping[key] || {};
          const input = findInputByLabel(formContainer, fieldConfig.label || key);

          if (input) {
            await fillSingleField(input, value, fieldConfig);
          }
        }
      }

      // 点击保存按钮
      await new Promise(resolve => setTimeout(resolve, 200));
      const saveBtn = findButtonByText('保存');
      if (saveBtn) {
        saveBtn.click();
        await new Promise(resolve => setTimeout(resolve, 400));
        results.success++;
        results.details.push({ index: i, entry, status: 'success' });
        console.log(`[复杂场景] ${sectionName} 第${i + 1}条保存成功`);
      }
    } catch (error) {
      results.failed++;
      results.details.push({ index: i, entry, status: 'failed', error: error.message });
      console.error(`[复杂场景] ${sectionName} 第${i + 1}条保存失败:`, error);
    }
  }

  return results;
}

/**
 * 根据文本查找按钮
 * @param {string[]} texts - 按钮文本列表
 * @returns {HTMLElement|null}
 */
function findButtonByText(...texts) {
  const buttons = document.querySelectorAll('button, .el-button');
  for (const btn of buttons) {
    for (const text of texts) {
      if (btn.textContent.includes(text)) {
        return btn;
      }
    }
  }
  return null;
}

/**
 * 根据标签查找输入框
 * @param {HTMLElement} container - 容器元素
 * @param {string} labelText - 标签文本
 * @returns {HTMLElement|null}
 */
function findInputByLabel(container, labelText) {
  const formItems = container.querySelectorAll('.el-form-item');
  for (const item of formItems) {
    const label = item.querySelector('.el-form-item__label');
    if (label && label.textContent.includes(labelText)) {
      const input = item.querySelector('input, textarea, .el-select, .el-cascader');
      return input;
    }
  }
  return null;
}

/**
 * 填写单个字段
 * @param {HTMLElement} input - 输入元素
 * @param {string} value - 值
 * @param {Object} config - 配置
 */
async function fillSingleField(input, value, config = {}) {
  const inputType = detectInputType(input);

  switch (inputType) {
    case 'text':
    case 'textarea':
      triggerDataSync(input, value);
      break;

    case 'el-select':
      const selectWrapper = input.closest ? input.closest('.el-select') : input;
      await fillElSelect(selectWrapper, value);
      await confirmSelectionIfNeeded(input);
      break;

    case 'el-cascader':
      const cascaderWrapper = input.closest ? input.closest('.el-cascader') : input;
      await fillElCascader(cascaderWrapper, value);
      break;

    case 'custom-cascader':
      const customCascaderWrapper = input.closest ? input.closest('.el-input') : input;
      await fillCustomCascader(customCascaderWrapper, value);
      break;

    case 'date':
      triggerDataSync(input, value);
      break;

    default:
      triggerDataSync(input, value);
  }
}

/**
 * 检测输入框类型
 * @param {HTMLElement} element - 元素
 * @returns {string} 类型
 */
function detectInputType(element) {
  if (element.tagName === 'TEXTAREA') return 'textarea';
  if (element.classList.contains('el-select')) return 'el-select';
  if (element.classList.contains('el-cascader')) return 'el-cascader';
  if (element.classList.contains('el-date-editor')) return 'date';

  // 检查是否为自定义级联选择器（通过标签判断）
  const elInput = element.closest ? element.closest('.el-input') : null;
  if (elInput && !elInput.closest('.el-select, .el-cascader, .el-date-editor')) {
    const label = extractElementUILabel(elInput);
    if (label && ['省', '市', '区', '县', '地址', '居住地', '籍贯', '户口', '现居', '现住'].some(kw => label.includes(kw))) {
      return 'custom-cascader';
    }
  }

  if (element.tagName === 'INPUT') return 'text';
  return 'unknown';
}

// ================== 初始化集成 ==================

/**
 * 初始化所有优化模块
 */
function initOptimizations() {
  // 设置页面刷新状态保存
  setupBeforeUnloadHandler();

  // 检查是否需要恢复状态
  restoreStateOnLoad();

  console.log('[简历助手] 优化模块已初始化');
}

// 在页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOptimizations);
} else {
  initOptimizations();
}

// 导出错误处理和性能优化模块
if (typeof window !== 'undefined') {
  window.ErrorType = ErrorType;
  window.ErrorHandler = ErrorHandler;
  window.getErrorHandler = getErrorHandler;
  window.debounce = debounce;
  window.throttle = throttle;
  window.batchOperations = batchOperations;
  window.PerformanceMonitor = PerformanceMonitor;
  window.getPerformanceMonitor = getPerformanceMonitor;
}

