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

  // 1. 设置值
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
    'value'
  )?.set;

  if (nativeInputValueSetter) {
    // 使用原生 setter 绕过 React 等框架的值保护
    nativeInputValueSetter.call(element, value);
  } else {
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

// 导出
if (typeof window !== 'undefined') {
  window.CascadingSelect = CascadingSelect;
  window.CASCADE_PATTERNS = CASCADE_PATTERNS;
  window.WaitResult = WaitResult;
  window.FailureReasonCode = FailureReasonCode;
  window.FailureReasonMessages = FailureReasonMessages;
  window.parseAddress = parseAddress;
  window.parseEducation = parseEducation;
  window.parseJobInfo = parseJobInfo;
  window.triggerDataSync = triggerDataSync;
  window.triggerSelectChange = triggerSelectChange;
  window.MUNICIPALITIES = MUNICIPALITIES;
  // 新增导出
  window.CustomComponentCascading = CustomComponentCascading;
  window.UIFramework = UIFramework;
  window.detectUIFramework = detectUIFramework;
  window.isElementUIComponent = isElementUIComponent;
  window.isAntDesignComponent = isAntDesignComponent;
}
