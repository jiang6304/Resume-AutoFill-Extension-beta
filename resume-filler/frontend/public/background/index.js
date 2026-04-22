/**
 * 简历自动填写助手 - Background Service Worker
 * 处理后台任务和消息转发
 */

// API 基础地址
const API_BASE = 'http://127.0.0.1:8001';

// 当前版本号（从 manifest 获取）
const CURRENT_VERSION = chrome.runtime.getManifest().version;

// 特殊页面列表
const SPECIAL_PAGES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'https://chrome.google.com/webstore'];

// 判断是否是特殊页面
function isSpecialPage(url) {
  if (!url) return true; // 无 URL 也视为特殊页面
  return SPECIAL_PAGES.some(prefix => url.startsWith(prefix));
}

// API 代理函数 - background script 可以发起跨域请求
async function proxyApiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  console.log('[Background] 代理API请求:', url);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await response.json();
    console.log('[Background] API响应:', endpoint, response.status);
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    console.error('[Background] API请求失败:', error);
    return { success: false, error: error.message };
  }
}

// 根据标签页类型动态设置 popup
async function updatePopupForTab(tabId, url) {
  try {
    if (isSpecialPage(url)) {
      // 特殊页面：启用原生 popup
      await chrome.action.setPopup({ tabId, popup: 'popup/index.html' });
    } else {
      // 普通页面：禁用 popup，让 onClicked 触发
      await chrome.action.setPopup({ tabId, popup: '' });
    }
  } catch (e) {
    console.error('设置 popup 失败:', e);
  }
}

// 监听标签页切换
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await updatePopupForTab(activeInfo.tabId, tab.url);
  } catch (e) {}
});

// 监听标签页更新（URL 变化）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await updatePopupForTab(tabId, changeInfo.url);
  }
});

// 扩展图标点击（仅在 popup 被禁用时触发，即普通页面）
chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 先尝试发送消息检查content script是否已加载
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    // 如果收到响应，说明content script已加载，显示弹窗
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePopup' });
  } catch (error) {
    // 如果失败，说明content script未注入或版本过旧
    console.log('Content script未注入或需要更新，正在注入...');

    try {
      // 注入content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/index.js']
      });

      // 等待脚本初始化
      await new Promise(resolve => setTimeout(resolve, 200));

      // 发送消息要求显示刷新提示
      await chrome.tabs.sendMessage(tab.id, { action: 'showRefreshPrompt' });
    } catch (injectError) {
      console.error('注入content script失败:', injectError);
    }
  }
});

// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background收到消息:', message.action);

  // 处理填写完成通知
  if (message.action === 'fillingComplete') {
    console.log('填写完成');
    sendResponse({ status: 'ok' });
    return true;
  }

  // 处理打开编辑页面
  if (message.action === 'openEditPage') {
    let url = chrome.runtime.getURL('web/index.html');
    const params = [];
    if (message.view) params.push(`view=${message.view}`);
    if (message.version) params.push(`version=${message.version}`);
    if (params.length > 0) url += '?' + params.join('&');
    chrome.tabs.create({ url: url });
    sendResponse({ status: 'ok' });
    return true;
  }

  // 处理版本检查请求
  if (message.action === 'getVersion') {
    sendResponse({ version: CURRENT_VERSION });
    return true;
  }

  // === API 代理请求 ===

  // 加载简历数据
  if (message.action === 'api_loadResume') {
    proxyApiRequest('/api/resume/load')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 字段映射
  if (message.action === 'api_mapping') {
    // 注意：后端期望的字段名是下划线格式
    proxyApiRequest('/api/resume/mapping', {
      method: 'POST',
      body: {
        resume_data: message.data.resumeData,
        form_structure: message.data.formStructure
      }
    })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 问题26：单字段映射（逐元素映射填写）
  if (message.action === 'api_mapping_single') {
    proxyApiRequest('/api/resume/mapping-single', {
      method: 'POST',
      body: {
        resume_data: message.data.resumeData,
        field_info: message.data.fieldInfo
      }
    })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // OPT-003: 填写结果校验
  if (message.action === 'api_verify') {
    proxyApiRequest('/api/resume/verify', {
      method: 'POST',
      body: {
        form_data: message.data.formData,
        resume_data: message.data.resumeData
      }
    })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 获取版本列表
  if (message.action === 'api_getVersions') {
    proxyApiRequest('/api/resume/versions')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 加载指定版本
  if (message.action === 'api_loadVersion') {
    proxyApiRequest(`/api/resume/version/${message.versionId}`)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 删除版本
  if (message.action === 'api_deleteVersion') {
    proxyApiRequest(`/api/resume/version/${message.versionId}`, { method: 'DELETE' })
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // 健康检查
  if (message.action === 'api_health') {
    proxyApiRequest('/health')
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  sendResponse({ status: 'unknown_action' });
  return true;
});

// 扩展安装或更新时的处理
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('简历自动填写助手 - 安装事件:', details.reason);

  if (details.reason === 'install') {
    console.log('首次安装，版本:', CURRENT_VERSION);
    // 存储当前版本
    chrome.storage.local.set({ extensionVersion: CURRENT_VERSION });
  }

  if (details.reason === 'update') {
    const previousVersion = details.previousVersion;
    console.log(`扩展更新: ${previousVersion} → ${CURRENT_VERSION}`);

    // 存储新版本
    chrome.storage.local.set({ extensionVersion: CURRENT_VERSION });

    // 通知所有已打开的标签页刷新
    try {
      const tabs = await chrome.tabs.query({});
      let notifiedCount = 0;

      for (const tab of tabs) {
        // 跳过特殊页面
        if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) {
          continue;
        }

        try {
          // 发送更新通知
          await chrome.tabs.sendMessage(tab.id, {
            action: 'extensionUpdated',
            previousVersion: previousVersion,
            currentVersion: CURRENT_VERSION
          });
          notifiedCount++;
        } catch (e) {
          // 该标签页可能没有注入 content script，忽略
        }
      }

      console.log(`已通知 ${notifiedCount} 个标签页刷新`);
    } catch (e) {
      console.error('通知标签页失败:', e);
    }
  }
});

// 定期检查版本一致性（处理 Service Worker 重启情况）
chrome.storage.local.get(['extensionVersion'], (result) => {
  if (result.extensionVersion && result.extensionVersion !== CURRENT_VERSION) {
    console.log(`检测到版本不一致: 存储=${result.extensionVersion}, 当前=${CURRENT_VERSION}`);
    chrome.storage.local.set({ extensionVersion: CURRENT_VERSION });
  }
});

console.log('简历自动填写助手已加载，版本:', CURRENT_VERSION);
