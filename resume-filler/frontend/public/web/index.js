/**
 * 简历自动填写助手 - 简历管理页面脚本
 */

const API_BASE = 'http://127.0.0.1:8001';

// 当前视图状态
let currentView = 'edit';

/**
 * 将各种日期格式转换为 HTML date input 要求的 yyyy-MM-dd 格式
 * 支持格式：
 * - "2013-09" -> "2013-09-01"
 * - "2013年9月" -> "2013-09-01"
 * - "2013.09" -> "2013-09-01"
 * - "至今" / "present" -> 返回空（配合"至今"复选框使用）
 * - "2013-09-15" -> "2013-09-15" (保持不变)
 */
function formatDateForInput(dateStr) {
  if (!dateStr) return '';

  const str = String(dateStr).trim();

  // 特殊值：至今/present -> 返回空
  if (str === '至今' || str === 'present' || str === '现在' || str === '目前') {
    return '';
  }

  // 已经是 yyyy-MM-dd 格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // yyyy-MM 格式，补充日期为01
  if (/^\d{4}-\d{2}$/.test(str)) {
    return str + '-01';
  }

  // yyyy.MM 或 yyyy.M 格式
  const dotMatch = str.match(/^(\d{4})\.(\d{1,2})(?:\.(\d{1,2}))?$/);
  if (dotMatch) {
    const year = dotMatch[1];
    const month = dotMatch[2].padStart(2, '0');
    const day = dotMatch[3] ? dotMatch[3].padStart(2, '0') : '01';
    return `${year}-${month}-${day}`;
  }

  // yyyy年MM月 格式
  const cnMatch = str.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/);
  if (cnMatch) {
    const year = cnMatch[1];
    const month = cnMatch[2].padStart(2, '0');
    const day = cnMatch[3] ? cnMatch[3].padStart(2, '0') : '01';
    return `${year}-${month}-${day}`;
  }

  // 尝试解析其他格式
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 无法解析，返回空字符串避免错误
  console.warn('无法解析日期格式:', str);
  return '';
}

/**
 * 检查日期值是否表示"至今"
 */
function isPresent(dateStr) {
  if (!dateStr) return false;
  const str = String(dateStr).trim().toLowerCase();
  return str === '至今' || str === 'present' || str === '现在' || str === '目前';
}

/**
 * 生成时间段HTML（包含"至今"复选框）
 * @param {string} prefix - 字段名前缀，如 "education"、"work"
 * @param {number} count - 计数器
 * @param {object} data - 数据对象，包含 start 和 end
 */
function generateDateRangeHtml(prefix, count, data = {}) {
  const startValue = formatDateForInput(data.start);
  const endValue = formatDateForInput(data.end);
  const isPresentChecked = isPresent(data.end);
  const endDisabled = isPresentChecked ? 'disabled' : '';
  const checkboxChecked = isPresentChecked ? 'checked' : '';

  return `
    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
      <input type="date" name="${prefix}_start_${count}" value="${startValue}" placeholder="开始时间">
      <span style="line-height: 38px;">至</span>
      <input type="date" name="${prefix}_end_${count}" value="${endValue}" placeholder="结束时间" ${endDisabled} class="end-date-input">
      <label style="display: flex; align-items: center; gap: 4px; white-space: nowrap; cursor: pointer;">
        <input type="checkbox" name="${prefix}_present_${count}" ${checkboxChecked}
          class="present-checkbox" data-end-input="${prefix}_end_${count}">
        <span>至今</span>
      </label>
    </div>
  `;
}

/**
 * 切换"至今"状态
 */
function togglePresent(endInputName, isPresent) {
  const endInput = document.querySelector(`input[name="${endInputName}"]`);
  if (endInput) {
    endInput.disabled = isPresent;
    if (isPresent) {
      endInput.value = '';
    }
  }
}

/**
 * 获取结束时间的值（考虑"至今"复选框）
 * @param {string} prefix - 字段名前缀
 * @param {number} count - 计数器
 * @returns {string} - 结束时间值，如果勾选"至今"则返回 "至今"
 */
function getEndValue(prefix, count) {
  const presentCheckbox = document.querySelector(`input[name="${prefix}_present_${count}"]`);
  if (presentCheckbox && presentCheckbox.checked) {
    return '至今';
  }
  const endInput = document.querySelector(`input[name="${prefix}_end_${count}"]`);
  return endInput?.value || '';
}

// 初始化函数 - DOM 加载完成后执行
function initPage() {
  // 顶部导航切换
  document.querySelectorAll('.top-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  // 右侧栏导航点击 - 滚动到对应分类
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      // 切换到编辑视图
      if (currentView !== 'edit') {
        switchView('edit');
      }

      // 获取目标面板
      const sectionId = item.dataset.section;
      const targetPanel = document.getElementById(sectionId);

      if (targetPanel) {
        // 滚动到目标面板
        targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 更新导航激活状态
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });

  // 滚动时自动更新导航激活状态
  const contentArea = document.querySelector('.content-area');
  if (contentArea) {
    contentArea.addEventListener('scroll', updateActiveNavOnScroll);
  }

  // 添加按钮事件监听
  document.getElementById('add-education-btn')?.addEventListener('click', () => addEducation());
  document.getElementById('add-work-btn')?.addEventListener('click', () => addWork());
  document.getElementById('add-internship-btn')?.addEventListener('click', () => addInternship());
  document.getElementById('add-project-btn')?.addEventListener('click', () => addProject());
  document.getElementById('add-school-activity-btn')?.addEventListener('click', () => addSchoolActivity());
  document.getElementById('add-award-btn')?.addEventListener('click', () => addAward());
  document.getElementById('add-language-btn')?.addEventListener('click', () => addLanguageSkill());
  document.getElementById('add-certificate-btn')?.addEventListener('click', () => addCertificate());
  document.getElementById('add-family-btn')?.addEventListener('click', () => addFamilyMember());

  // 保存按钮事件监听
  document.getElementById('save-resume-btn')?.addEventListener('click', () => saveResume());
  document.getElementById('save-version-btn')?.addEventListener('click', () => saveAsVersion());

  // 补充信息功能事件监听（需求22）
  document.getElementById('show-supplement-btn')?.addEventListener('click', toggleSupplementSection);
  document.getElementById('toggle-supplement-btn')?.addEventListener('click', toggleSupplementSection);
  document.getElementById('upload-supplement-btn')?.addEventListener('click', () => {
    document.getElementById('supplement-file-input')?.click();
  });
  document.getElementById('supplement-file-input')?.addEventListener('change', handleSupplementUpload);
  document.getElementById('submit-supplement-btn')?.addEventListener('click', handleSupplementText);

  // 事件委托 - 处理动态创建的"至今"复选框和删除按钮
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('present-checkbox')) {
      const endInputName = e.target.dataset.endInput;
      togglePresent(endInputName, e.target.checked);
    }
  });

  document.addEventListener('click', (e) => {
    // 删除经历条目按钮
    if (e.target.classList.contains('remove-btn')) {
      const itemId = e.target.dataset.itemId;
      if (itemId) {
        document.getElementById(itemId)?.remove();
      }
    }
  });

  // 加载已保存的简历数据
  loadResume();
}

// 滚动时自动更新导航激活状态
function updateActiveNavOnScroll() {
  const panels = document.querySelectorAll('.panel[id$="-panel"]:not(#history-panel)');
  const contentArea = document.querySelector('.content-area');

  if (!contentArea) return;

  const scrollTop = contentArea.scrollTop;
  const offset = 100; // 偏移量

  // 找到当前可见的面板
  for (const panel of panels) {
    const rect = panel.getBoundingClientRect();
    const containerRect = contentArea.getBoundingClientRect();

    if (rect.top <= containerRect.top + offset && rect.bottom > containerRect.top + offset) {
      // 更新导航激活状态
      const sectionId = panel.id;
      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
      });
      break;
    }
  }
}

// 切换视图（修改简历 / 历史简历）
function switchView(viewName) {
  currentView = viewName;

  // 更新顶部导航按钮状态
  document.querySelectorAll('.top-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // 显示对应面板
  if (viewName === 'edit') {
    // 显示右侧栏
    document.getElementById('sidebar').style.display = 'block';
    // 显示底部按钮
    document.getElementById('bottom-actions').style.display = 'block';
    // 隐藏历史面板
    document.getElementById('history-panel').style.display = 'none';
    // 显示所有编辑面板
    document.querySelectorAll('.panel:not(#history-panel)').forEach(p => {
      p.style.display = 'block';
    });
  } else if (viewName === 'history') {
    // 隐藏右侧栏
    document.getElementById('sidebar').style.display = 'none';
    // 隐藏底部按钮
    document.getElementById('bottom-actions').style.display = 'none';
    // 隐藏所有编辑面板
    document.querySelectorAll('.panel:not(#history-panel)').forEach(p => {
      p.style.display = 'none';
    });
    // 显示历史面板
    document.getElementById('history-panel').style.display = 'block';
    loadVersions();
  }
}

// 由于脚本在 body 底部，需要检查文档状态
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  // DOM 已经加载完成，直接执行
  initPage();
}

// 添加教育经历
let educationCount = 0;
function addEducation(data = {}) {
  educationCount++;
  const container = document.getElementById('education-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `education-${educationCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">教育经历 #${educationCount}</span>
      <button class="remove-btn" data-item-id="education-${educationCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>学校名称</label>
        <input type="text" name="education_school_${educationCount}" value="${data.school || ''}" placeholder="请输入学校名称">
      </div>
      <div class="form-group">
        <label>专业</label>
        <input type="text" name="education_major_${educationCount}" value="${data.major || ''}" placeholder="请输入专业">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>学院/院系</label>
        <input type="text" name="education_college_${educationCount}" value="${data.college || ''}" placeholder="请输入学院/院系">
      </div>
      <div class="form-group">
        <label>学历</label>
        <select name="education_degree_${educationCount}">
          <option value="">请选择</option>
          <option value="高中" ${data.degree === '高中' ? 'selected' : ''}>高中</option>
          <option value="大专" ${data.degree === '大专' ? 'selected' : ''}>大专</option>
          <option value="本科" ${data.degree === '本科' ? 'selected' : ''}>本科</option>
          <option value="硕士" ${data.degree === '硕士' ? 'selected' : ''}>硕士</option>
          <option value="博士" ${data.degree === '博士' ? 'selected' : ''}>博士</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>学习形式</label>
        <select name="education_study_mode_${educationCount}">
          <option value="">请选择</option>
          <option value="全日制" ${data.study_mode === '全日制' ? 'selected' : ''}>全日制</option>
          <option value="非全日制" ${data.study_mode === '非全日制' ? 'selected' : ''}>非全日制</option>
          <option value="在职" ${data.study_mode === '在职' ? 'selected' : ''}>在职</option>
        </select>
      </div>
      <div class="form-group">
        <label>时间段</label>
        ${generateDateRangeHtml('education', educationCount, data)}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>成绩/GPA</label>
        <input type="text" name="education_gpa_${educationCount}" value="${data.gpa || ''}" placeholder="请输入成绩/GPA">
      </div>
      <div class="form-group">
        <label>专业排名</label>
        <input type="text" name="education_ranking_${educationCount}" value="${data.ranking || ''}" placeholder="请输入专业排名">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>是否海外经历</label>
        <select name="education_is_overseas_${educationCount}">
          <option value="">请选择</option>
          <option value="是" ${data.is_overseas === '是' ? 'selected' : ''}>是</option>
          <option value="否" ${data.is_overseas === '否' ? 'selected' : ''}>否</option>
        </select>
      </div>
      <div class="form-group">
        <label>辅修/双学位专业</label>
        <input type="text" name="education_minor_major_${educationCount}" value="${data.minor_major || ''}" placeholder="请输入辅修/双学位专业">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>导师姓名</label>
        <input type="text" name="education_supervisor_${educationCount}" value="${data.supervisor || ''}" placeholder="请输入导师姓名">
      </div>
    </div>
    <div class="form-group">
      <label>专业课程</label>
      <textarea name="education_courses_${educationCount}" rows="2" placeholder="请输入专业课程">${data.courses || ''}</textarea>
    </div>
  `;
  container.appendChild(item);
}

// 添加工作经历
let workCount = 0;
function addWork(data = {}) {
  workCount++;
  const container = document.getElementById('work-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `work-${workCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">工作经历 #${workCount}</span>
      <button class="remove-btn" data-item-id="work-${workCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>公司名称</label>
        <input type="text" name="work_company_${workCount}" value="${data.company || ''}" placeholder="请输入公司名称">
      </div>
      <div class="form-group">
        <label>职位</label>
        <input type="text" name="work_position_${workCount}" value="${data.position || ''}" placeholder="请输入职位">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>部门</label>
        <input type="text" name="work_department_${workCount}" value="${data.department || ''}" placeholder="请输入部门">
      </div>
      <div class="form-group">
        <label>工作类型</label>
        <select name="work_work_type_${workCount}">
          <option value="">请选择</option>
          <option value="全职" ${data.work_type === '全职' ? 'selected' : ''}>全职</option>
          <option value="兼职" ${data.work_type === '兼职' ? 'selected' : ''}>兼职</option>
          <option value="实习" ${data.work_type === '实习' ? 'selected' : ''}>实习</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>时间段</label>
      ${generateDateRangeHtml('work', workCount, data)}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>薪资</label>
        <input type="text" name="work_salary_${workCount}" value="${data.salary || ''}" placeholder="请输入薪资">
      </div>
      <div class="form-group">
        <label>下属人数</label>
        <input type="text" name="work_subordinates_${workCount}" value="${data.subordinates || ''}" placeholder="请输入下属人数">
      </div>
    </div>
    <div class="form-group">
      <label>工作内容</label>
      <textarea name="work_description_${workCount}" rows="4" placeholder="请输入工作内容">${data.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>工作成果</label>
      <textarea name="work_achievements_${workCount}" rows="3" placeholder="请输入工作成果">${data.achievements || ''}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>离职原因</label>
        <input type="text" name="work_leaving_reason_${workCount}" value="${data.leaving_reason || ''}" placeholder="请输入离职原因">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>证明人姓名</label>
        <input type="text" name="work_referee_name_${workCount}" value="${data.referee_name || ''}" placeholder="请输入证明人姓名">
      </div>
      <div class="form-group">
        <label>证明人职位</label>
        <input type="text" name="work_referee_position_${workCount}" value="${data.referee_position || ''}" placeholder="请输入证明人职位">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>证明人联系方式</label>
        <input type="text" name="work_referee_contact_${workCount}" value="${data.referee_contact || ''}" placeholder="请输入证明人联系方式">
      </div>
    </div>
  `;
  container.appendChild(item);
}

// 添加实习经历
let internshipCount = 0;
function addInternship(data = {}) {
  internshipCount++;
  const container = document.getElementById('internship-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `internship-${internshipCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">实习经历 #${internshipCount}</span>
      <button class="remove-btn" data-item-id="internship-${internshipCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>公司名称</label>
        <input type="text" name="internship_company_${internshipCount}" value="${data.company || ''}" placeholder="请输入公司名称">
      </div>
      <div class="form-group">
        <label>职位</label>
        <input type="text" name="internship_position_${internshipCount}" value="${data.position || ''}" placeholder="请输入职位">
      </div>
    </div>
    <div class="form-group">
      <label>时间段</label>
      ${generateDateRangeHtml('internship', internshipCount, data)}
    </div>
    <div class="form-group">
      <label>实习内容</label>
      <textarea name="internship_description_${internshipCount}" rows="4" placeholder="请输入实习内容">${data.description || ''}</textarea>
    </div>
  `;
  container.appendChild(item);
}

// 添加项目经历
let projectCount = 0;
function addProject(data = {}) {
  projectCount++;
  const container = document.getElementById('project-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `project-${projectCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">项目经历 #${projectCount}</span>
      <button class="remove-btn" data-item-id="project-${projectCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>项目名称</label>
        <input type="text" name="project_name_${projectCount}" value="${data.name || ''}" placeholder="请输入项目名称">
      </div>
      <div class="form-group">
        <label>角色</label>
        <input type="text" name="project_role_${projectCount}" value="${data.role || ''}" placeholder="请输入您的角色">
      </div>
    </div>
    <div class="form-group">
      <label>时间段</label>
      ${generateDateRangeHtml('project', projectCount, data)}
    </div>
    <div class="form-group">
      <label>项目描述</label>
      <textarea name="project_description_${projectCount}" rows="4" placeholder="请输入项目描述">${data.description || ''}</textarea>
    </div>
  `;
  container.appendChild(item);
}

// 添加在校经历
let schoolActivityCount = 0;
function addSchoolActivity(data = {}) {
  schoolActivityCount++;
  const container = document.getElementById('school-activity-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `school-activity-${schoolActivityCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">在校经历 #${schoolActivityCount}</span>
      <button class="remove-btn" data-item-id="school-activity-${schoolActivityCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>社团/组织名称</label>
        <input type="text" name="school_activity_name_${schoolActivityCount}" value="${data.name || ''}" placeholder="请输入社团/组织名称">
      </div>
      <div class="form-group">
        <label>担任职务</label>
        <input type="text" name="school_activity_role_${schoolActivityCount}" value="${data.role || ''}" placeholder="请输入担任职务">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>经历类型</label>
        <select name="school_activity_type_${schoolActivityCount}">
          <option value="">请选择</option>
          <option value="社团" ${data.activity_type === '社团' ? 'selected' : ''}>社团</option>
          <option value="学生会" ${data.activity_type === '学生会' ? 'selected' : ''}>学生会</option>
          <option value="志愿者" ${data.activity_type === '志愿者' ? 'selected' : ''}>志愿者</option>
          <option value="其他" ${data.activity_type === '其他' ? 'selected' : ''}>其他</option>
        </select>
      </div>
      <div class="form-group">
        <label>时间段</label>
        ${generateDateRangeHtml('school_activity', schoolActivityCount, data)}
      </div>
    </div>
    <div class="form-group">
      <label>活动内容描述</label>
      <textarea name="school_activity_description_${schoolActivityCount}" rows="4" placeholder="请输入活动内容描述">${data.description || ''}</textarea>
    </div>
  `;
  container.appendChild(item);
}

// 添加获奖情况
let awardCount = 0;
function addAward(data = {}) {
  awardCount++;
  const container = document.getElementById('award-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `award-${awardCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">获奖情况 #${awardCount}</span>
      <button class="remove-btn" data-item-id="award-${awardCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>奖励名称</label>
        <input type="text" name="award_name_${awardCount}" value="${data.name || ''}" placeholder="请输入奖励名称">
      </div>
      <div class="form-group">
        <label>奖励等级</label>
        <input type="text" name="award_level_${awardCount}" value="${data.level || ''}" placeholder="请输入奖励等级">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>获奖时间</label>
        <input type="text" name="award_time_${awardCount}" value="${data.time || ''}" placeholder="请输入获奖时间">
      </div>
    </div>
    <div class="form-group">
      <label>奖励描述</label>
      <textarea name="award_description_${awardCount}" rows="3" placeholder="请输入奖励描述">${data.description || ''}</textarea>
    </div>
  `;
  container.appendChild(item);
}

// 添加外语能力
let languageCount = 0;
function addLanguageSkill(data = {}) {
  languageCount++;
  const container = document.getElementById('language-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `language-${languageCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">外语能力 #${languageCount}</span>
      <button class="remove-btn" data-item-id="language-${languageCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>语种</label>
        <input type="text" name="language_language_${languageCount}" value="${data.language || ''}" placeholder="请输入语种">
      </div>
      <div class="form-group">
        <label>证书名称</label>
        <input type="text" name="language_certificate_${languageCount}" value="${data.certificate || ''}" placeholder="请输入证书名称">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>水平</label>
        <input type="text" name="language_level_${languageCount}" value="${data.level || ''}" placeholder="请输入水平">
      </div>
      <div class="form-group">
        <label>成绩</label>
        <input type="text" name="language_score_${languageCount}" value="${data.score || ''}" placeholder="请输入成绩">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>听说能力</label>
        <input type="text" name="language_listening_${languageCount}" value="${data.listening || ''}" placeholder="请输入听说能力">
      </div>
      <div class="form-group">
        <label>读写能力</label>
        <input type="text" name="language_reading_${languageCount}" value="${data.reading || ''}" placeholder="请输入读写能力">
      </div>
    </div>
  `;
  container.appendChild(item);
}

// 添加资格证书
let certificateCount = 0;
function addCertificate(data = {}) {
  certificateCount++;
  const container = document.getElementById('certificate-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `certificate-${certificateCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">资格证书 #${certificateCount}</span>
      <button class="remove-btn" data-item-id="certificate-${certificateCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>证书名称</label>
        <input type="text" name="certificate_name_${certificateCount}" value="${data.name || ''}" placeholder="请输入证书名称">
      </div>
      <div class="form-group">
        <label>获得时间</label>
        <input type="text" name="certificate_time_${certificateCount}" value="${data.time || ''}" placeholder="请输入获得时间">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>证书编号</label>
        <input type="text" name="certificate_number_${certificateCount}" value="${data.number || ''}" placeholder="请输入证书编号">
      </div>
    </div>
    <div class="form-group">
      <label>证书说明</label>
      <textarea name="certificate_description_${certificateCount}" rows="3" placeholder="请输入证书说明">${data.description || ''}</textarea>
    </div>
  `;
  container.appendChild(item);
}

// 添加家庭成员
let familyCount = 0;
function addFamilyMember(data = {}) {
  familyCount++;
  const container = document.getElementById('family-list');
  const item = document.createElement('div');
  item.className = 'experience-item';
  item.id = `family-${familyCount}`;
  item.innerHTML = `
    <div class="experience-item-header">
      <span style="font-weight:500;color:#1890ff;">家庭成员 #${familyCount}</span>
      <button class="remove-btn" data-item-id="family-${familyCount}">🗑️ 删除</button>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>姓名</label>
        <input type="text" name="family_name_${familyCount}" value="${data.name || ''}" placeholder="请输入姓名">
      </div>
      <div class="form-group">
        <label>关系</label>
        <input type="text" name="family_relation_${familyCount}" value="${data.relation || ''}" placeholder="请输入关系">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>电话</label>
        <input type="tel" name="family_phone_${familyCount}" value="${data.phone || ''}" placeholder="请输入电话">
      </div>
      <div class="form-group">
        <label>公司</label>
        <input type="text" name="family_company_${familyCount}" value="${data.company || ''}" placeholder="请输入公司">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>职位</label>
        <input type="text" name="family_position_${familyCount}" value="${data.position || ''}" placeholder="请输入职位">
      </div>
      <div class="form-group">
        <label>政治面貌</label>
        <input type="text" name="family_political_status_${familyCount}" value="${data.political_status || ''}" placeholder="请输入政治面貌">
      </div>
    </div>
  `;
  container.appendChild(item);
}

// 收集表单数据
function collectFormData() {
  // 获取 version_id（如果存在）
  let versionId = '';
  const versionIdInput = document.getElementById('version_id');
  if (versionIdInput && versionIdInput.value) {
    versionId = versionIdInput.value;
  }

  const data = {
    // 版本ID
    version_id: versionId,

    // 基本信息
    name: document.getElementById('name').value,
    gender: document.getElementById('gender').value,
    birth_date: document.getElementById('birth_date').value,
    id_number: document.getElementById('id_number').value,
    political_status: document.getElementById('political_status').value,
    marital_status: document.getElementById('marital_status').value,
    ethnicity: document.getElementById('ethnicity').value,
    native_place: document.getElementById('native_place').value,
    phone: document.getElementById('phone').value,
    email: document.getElementById('email').value,
    current_address: document.getElementById('current_address').value,
    education: document.getElementById('education').value,
    work_years: document.getElementById('work_years').value,
    job_intention: document.getElementById('job_intention').value,

    // 联系方式扩展
    wechat: document.getElementById('wechat').value,
    qq: document.getElementById('qq').value,

    // 个人信息扩展
    household_registration: document.getElementById('household_registration').value,
    student_source: document.getElementById('student_source').value,
    height: document.getElementById('height').value,
    weight: document.getElementById('weight').value,
    health_status: document.getElementById('health_status').value,
    specialty: document.getElementById('specialty').value,

    // 紧急联系人
    emergency_contact_name: document.getElementById('emergency_contact_name').value,
    emergency_contact_phone: document.getElementById('emergency_contact_phone').value,

    // 其他基本信息
    country: document.getElementById('country').value,
    mailing_address: document.getElementById('mailing_address').value,

    // 多条目
    education_history: [],
    work_history: [],
    internship_history: [],
    project_history: [],
    school_activities: [],
    awards_history: [],
    language_skills: [],
    certificates_history: [],
    family_info: [],

    // 其他信息
    skills: document.getElementById('skills').value,
    hobbies: document.getElementById('hobbies').value,
    certificates: document.getElementById('certificates').value,
    awards: document.getElementById('awards').value,
    self_intro: document.getElementById('self_intro').value,

    // 额外字段
    extra_fields: {},
    field_mapping: {}
  };

  // 收集额外字段
  const extraFieldsContainer = document.getElementById('extra-fields-container');
  const extraInputs = extraFieldsContainer.querySelectorAll('input, select, textarea');
  const fieldMapping = {};
  const extraFields = {};

  extraInputs.forEach(input => {
    if (input.name && input.value) {
      extraFields[input.name] = input.value;
      // 获取对应的中文标签
      const label = input.closest('.form-group')?.querySelector('label');
      if (label) {
        fieldMapping[input.name] = label.textContent.replace(' *', '').trim();
      }
    }
  });

  data.extra_fields = extraFields;
  data.field_mapping = fieldMapping;

  // 收集教育经历
  for (let i = 1; i <= educationCount; i++) {
    const schoolInput = document.querySelector(`input[name="education_school_${i}"]`);
    if (schoolInput && schoolInput.value) {
      data.education_history.push({
        school: schoolInput.value,
        major: document.querySelector(`input[name="education_major_${i}"]`)?.value || '',
        degree: document.querySelector(`select[name="education_degree_${i}"]`)?.value || '',
        start: document.querySelector(`input[name="education_start_${i}"]`)?.value || '',
        end: getEndValue('education', i),
        college: document.querySelector(`input[name="education_college_${i}"]`)?.value || '',
        study_mode: document.querySelector(`select[name="education_study_mode_${i}"]`)?.value || '',
        courses: document.querySelector(`textarea[name="education_courses_${i}"]`)?.value || '',
        gpa: document.querySelector(`input[name="education_gpa_${i}"]`)?.value || '',
        ranking: document.querySelector(`input[name="education_ranking_${i}"]`)?.value || '',
        is_overseas: document.querySelector(`select[name="education_is_overseas_${i}"]`)?.value || '',
        minor_major: document.querySelector(`input[name="education_minor_major_${i}"]`)?.value || '',
        supervisor: document.querySelector(`input[name="education_supervisor_${i}"]`)?.value || ''
      });
    }
  }

  // 收集工作经历
  for (let i = 1; i <= workCount; i++) {
    const companyInput = document.querySelector(`input[name="work_company_${i}"]`);
    if (companyInput && companyInput.value) {
      data.work_history.push({
        company: companyInput.value,
        position: document.querySelector(`input[name="work_position_${i}"]`)?.value || '',
        start: document.querySelector(`input[name="work_start_${i}"]`)?.value || '',
        end: getEndValue('work', i),
        description: document.querySelector(`textarea[name="work_description_${i}"]`)?.value || '',
        work_type: document.querySelector(`select[name="work_work_type_${i}"]`)?.value || '',
        department: document.querySelector(`input[name="work_department_${i}"]`)?.value || '',
        salary: document.querySelector(`input[name="work_salary_${i}"]`)?.value || '',
        achievements: document.querySelector(`textarea[name="work_achievements_${i}"]`)?.value || '',
        referee_name: document.querySelector(`input[name="work_referee_name_${i}"]`)?.value || '',
        referee_position: document.querySelector(`input[name="work_referee_position_${i}"]`)?.value || '',
        referee_contact: document.querySelector(`input[name="work_referee_contact_${i}"]`)?.value || '',
        leaving_reason: document.querySelector(`input[name="work_leaving_reason_${i}"]`)?.value || '',
        subordinates: document.querySelector(`input[name="work_subordinates_${i}"]`)?.value || ''
      });
    }
  }

  // 收集实习经历
  for (let i = 1; i <= internshipCount; i++) {
    const companyInput = document.querySelector(`input[name="internship_company_${i}"]`);
    if (companyInput && companyInput.value) {
      data.internship_history.push({
        company: companyInput.value,
        position: document.querySelector(`input[name="internship_position_${i}"]`)?.value || '',
        start: document.querySelector(`input[name="internship_start_${i}"]`)?.value || '',
        end: getEndValue('internship', i),
        description: document.querySelector(`textarea[name="internship_description_${i}"]`)?.value || ''
      });
    }
  }

  // 收集项目经历
  for (let i = 1; i <= projectCount; i++) {
    const nameInput = document.querySelector(`input[name="project_name_${i}"]`);
    if (nameInput && nameInput.value) {
      data.project_history.push({
        name: nameInput.value,
        role: document.querySelector(`input[name="project_role_${i}"]`)?.value || '',
        start: document.querySelector(`input[name="project_start_${i}"]`)?.value || '',
        end: getEndValue('project', i),
        description: document.querySelector(`textarea[name="project_description_${i}"]`)?.value || ''
      });
    }
  }

  // 收集在校经历
  for (let i = 1; i <= schoolActivityCount; i++) {
    const nameInput = document.querySelector(`input[name="school_activity_name_${i}"]`);
    if (nameInput && nameInput.value) {
      data.school_activities.push({
        name: nameInput.value,
        role: document.querySelector(`input[name="school_activity_role_${i}"]`)?.value || '',
        start: document.querySelector(`input[name="school_activity_start_${i}"]`)?.value || '',
        end: getEndValue('school_activity', i),
        description: document.querySelector(`textarea[name="school_activity_description_${i}"]`)?.value || '',
        activity_type: document.querySelector(`select[name="school_activity_type_${i}"]`)?.value || ''
      });
    }
  }

  // 收集获奖情况
  for (let i = 1; i <= awardCount; i++) {
    const nameInput = document.querySelector(`input[name="award_name_${i}"]`);
    if (nameInput && nameInput.value) {
      data.awards_history.push({
        name: nameInput.value,
        level: document.querySelector(`input[name="award_level_${i}"]`)?.value || '',
        time: document.querySelector(`input[name="award_time_${i}"]`)?.value || '',
        description: document.querySelector(`textarea[name="award_description_${i}"]`)?.value || ''
      });
    }
  }

  // 收集外语能力
  for (let i = 1; i <= languageCount; i++) {
    const languageInput = document.querySelector(`input[name="language_language_${i}"]`);
    if (languageInput && languageInput.value) {
      data.language_skills.push({
        language: languageInput.value,
        certificate: document.querySelector(`input[name="language_certificate_${i}"]`)?.value || '',
        level: document.querySelector(`input[name="language_level_${i}"]`)?.value || '',
        score: document.querySelector(`input[name="language_score_${i}"]`)?.value || '',
        listening: document.querySelector(`input[name="language_listening_${i}"]`)?.value || '',
        reading: document.querySelector(`input[name="language_reading_${i}"]`)?.value || ''
      });
    }
  }

  // 收集资格证书
  for (let i = 1; i <= certificateCount; i++) {
    const nameInput = document.querySelector(`input[name="certificate_name_${i}"]`);
    if (nameInput && nameInput.value) {
      data.certificates_history.push({
        name: nameInput.value,
        time: document.querySelector(`input[name="certificate_time_${i}"]`)?.value || '',
        number: document.querySelector(`input[name="certificate_number_${i}"]`)?.value || '',
        description: document.querySelector(`textarea[name="certificate_description_${i}"]`)?.value || ''
      });
    }
  }

  // 收集家庭情况
  for (let i = 1; i <= familyCount; i++) {
    const nameInput = document.querySelector(`input[name="family_name_${i}"]`);
    if (nameInput && nameInput.value) {
      data.family_info.push({
        name: nameInput.value,
        relation: document.querySelector(`input[name="family_relation_${i}"]`)?.value || '',
        phone: document.querySelector(`input[name="family_phone_${i}"]`)?.value || '',
        company: document.querySelector(`input[name="family_company_${i}"]`)?.value || '',
        position: document.querySelector(`input[name="family_position_${i}"]`)?.value || '',
        political_status: document.querySelector(`input[name="family_political_status_${i}"]`)?.value || ''
      });
    }
  }

  return data;
}

// 保存简历
async function saveResume() {
  const data = collectFormData();

  try {
    const response = await fetch(`${API_BASE}/api/resume/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      // 同时保存到本地存储
      saveToLocal(data);
      alert('保存成功！');
    } else {
      const errorText = await response.text();
      console.error('保存失败:', errorText);
      // 保存到本地作为备份
      saveToLocal(data);
      alert('保存失败，已备份到本地');
    }
  } catch (error) {
    console.error('保存出错:', error);
    // 后端未启动或其他错误，保存到本地
    saveToLocal(data);
    alert('已保存到本地（后端服务未启动或网络错误）');
  }
}

// 保存到本地存储（兼容扩展环境和普通浏览器）
function saveToLocal(data) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ resumeData: data });
    }
    // 同时保存到 localStorage 作为备份
    localStorage.setItem('resumeData', JSON.stringify(data));
  } catch (e) {
    console.error('本地存储失败:', e);
  }
}

// 从本地存储读取
function loadFromLocal() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['resumeData'], (result) => {
        if (result.resumeData) {
          fillForm(result.resumeData.data || result.resumeData);
        }
      });
    } else {
      const localData = localStorage.getItem('resumeData');
      if (localData) {
        fillForm(JSON.parse(localData));
      }
    }
  } catch (e) {
    console.error('读取本地存储失败:', e);
  }
}

// 保存为新版本
async function saveAsVersion() {
  const data = collectFormData();
  // 确保有名称
  if (!data.name) {
    data.name = '未命名简历';
  }

  try {
    const response = await fetch(`${API_BASE}/api/resume/version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      alert(`新版本保存成功！\n版本ID: ${result.version_id || ''}`);
    } else {
      const errorText = await response.text();
      console.error('保存失败:', errorText);
      alert('保存失败，请重试');
    }
  } catch (error) {
    console.error('保存出错:', error);
    alert('请确保后端服务已启动（http://127.0.0.1:8001）');
  }
}

// 加载已保存的简历数据
async function loadResume() {
  // 检查URL参数，是否有指定版本或视图
  const urlParams = new URLSearchParams(window.location.search);
  const versionId = urlParams.get('version');
  const view = urlParams.get('view');

  // 如果 view=history，直接切换到历史页面
  if (view === 'history') {
    switchView('history');
    return;
  }

  // 先加载右侧历史版本列表（不阻塞主流程）
  loadRightVersionList();

  try {
    if (versionId) {
      // 加载指定版本
      const response = await fetch(`${API_BASE}/api/resume/version/${versionId}`);
      if (response.ok) {
        const responseData = await response.json();
        const data = responseData.data || responseData;
        fillForm(data);
        // 同步到 chrome.storage，确保填写表单时使用正确数据
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ resumeData: data });
        }
        return;
      } else {
        alert('加载版本失败，将加载当前简历');
      }
    }

    // 先尝试从后端加载
    const response = await fetch(`${API_BASE}/api/resume/load`);
    if (response.ok) {
      const responseData = await response.json();
      // 兼容处理：支持 { data: {...} } 和直接 {...} 两种格式
      const data = responseData.data || responseData;
      fillForm(data);
      // 同步到本地存储
      saveToLocal(data);
      return;
    }
  } catch (error) {
    // 后端未启动，从本地存储加载
    console.log('后端未启动，从本地存储加载');
  }

  // 从本地存储加载（回退）
  loadFromLocal();
}

// 加载右侧历史版本列表
async function loadRightVersionList() {
  const listContainer = document.getElementById('right-version-list');
  if (!listContainer) {
    console.log('[历史版本] 未找到列表容器');
    return;
  }

  console.log('[历史版本] 开始加载...');

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // 并行获取版本列表和当前版本
    const [versionsRes, currentRes] = await Promise.all([
      fetch(`${API_BASE}/api/resume/versions`, { signal: controller.signal }),
      fetch(`${API_BASE}/api/resume/load`, { signal: controller.signal })
    ]);
    clearTimeout(timeoutId);

    console.log('[历史版本] 响应状态:', versionsRes.status);

    if (!versionsRes.ok) {
      listContainer.innerHTML = '<li class="version-list-empty">加载失败</li>';
      return;
    }

    const versionsData = await versionsRes.json();
    const versions = versionsData.data || [];

    // 获取当前版本ID
    let currentVersionId = null;
    if (currentRes.ok) {
      const currentData = await currentRes.json();
      currentVersionId = currentData.data?.version_id;
    }

    console.log('[历史版本] 版本数量:', versions.length, '当前版本:', currentVersionId);

    if (versions.length === 0) {
      listContainer.innerHTML = '<li class="version-list-empty">暂无历史版本</li>';
      return;
    }

    // 渲染版本列表
    listContainer.innerHTML = versions.map(version => {
      const name = version.display_name || version.name || version.source_file || '未命名';
      const time = version.updated_at || version.created_at || '';
      const timeStr = time ? new Date(time).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : '';
      const isCurrent = version.version_id === currentVersionId;
      const currentLabel = isCurrent ? '<span class="version-current-label">当前</span>' : '';

      return `
        <li class="version-list-item ${isCurrent ? 'active' : ''}" data-version-id="${version.version_id}">
          <div class="version-name">
            <span>${name}</span>
            ${currentLabel}
          </div>
          <div class="version-meta">
            <span>${timeStr}</span>
            <button class="version-load-btn" data-version-id="${version.version_id}">加载</button>
          </div>
        </li>
      `;
    }).join('');

    console.log('[历史版本] 列表已渲染');

    // 绑定加载按钮点击事件
    listContainer.querySelectorAll('.version-load-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const versionId = btn.dataset.versionId;
        loadVersionToForm(versionId);
      });
    });

    // 绑定列表项点击事件（整行点击也加载）
    listContainer.querySelectorAll('.version-list-item').forEach(item => {
      item.addEventListener('click', () => {
        const versionId = item.dataset.versionId;
        loadVersionToForm(versionId);
      });
    });

  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[历史版本] 加载失败:', error);

    if (error.name === 'AbortError') {
      listContainer.innerHTML = '<li class="version-list-empty">⏱️ 连接超时</li>';
    } else if (error.message && error.message.includes('Failed to fetch')) {
      listContainer.innerHTML = '<li class="version-list-empty">🔌 后端未启动</li>';
    } else {
      listContainer.innerHTML = '<li class="version-list-empty">❌ 加载失败</li>';
    }
  }
}

// 标记当前版本
async function markCurrentVersion() {
  try {
    const response = await fetch(`${API_BASE}/api/resume/load`);
    if (response.ok) {
      const data = await response.json();
      const currentVersionId = data.data?.version_id;

      if (currentVersionId) {
        document.querySelectorAll('.version-list-item').forEach(item => {
          item.classList.toggle('active', item.dataset.versionId === currentVersionId);
        });
      }
    }
  } catch (e) {
    // 忽略错误
  }
}

// 加载指定版本到表单
async function loadVersionToForm(versionId) {
  try {
    const response = await fetch(`${API_BASE}/api/resume/version/${versionId}`);
    if (!response.ok) {
      alert('加载版本失败');
      return;
    }

    const data = await response.json();
    const resumeData = data.data || data;

    // 填充表单
    fillForm(resumeData);

    // 更新右侧版本列表的激活状态
    document.querySelectorAll('.version-list-item').forEach(item => {
      item.classList.toggle('active', item.dataset.versionId === versionId);
    });

    // 滚动到顶部
    document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });

    // 同步到 chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ resumeData: resumeData });
    }

    // 更新后端当前引用
    try {
      await fetch(`${API_BASE}/api/resume/set-current/${versionId}`, { method: 'POST' });
    } catch (e) {}

    console.log('已加载版本:', versionId);

  } catch (error) {
    console.error('加载版本失败:', error);
    alert('加载版本失败，请重试');
  }
}

// 清除表单
function clearForm() {
  // 清除基本信息
  const basicFields = ['name', 'gender', 'birth_date', 'id_number', 'political_status',
    'marital_status', 'ethnicity', 'native_place', 'phone', 'email', 'current_address',
    'education', 'work_years', 'job_intention', 'wechat', 'qq', 'household_registration',
    'student_source', 'height', 'weight', 'health_status', 'specialty',
    'emergency_contact_name', 'emergency_contact_phone', 'country', 'mailing_address',
    'skills', 'hobbies', 'certificates', 'awards', 'self_intro'];

  basicFields.forEach(field => {
    const element = document.getElementById(field);
    if (element) element.value = '';
  });

  // 清除动态列表
  const listContainers = ['education-list', 'work-list', 'internship-list',
    'project-list', 'school-activity-list', 'award-list', 'language-list',
    'certificate-list', 'family-list'];

  listContainers.forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
  });

  // 重置计数器
  educationCount = 0;
  workCount = 0;
  internshipCount = 0;
  projectCount = 0;
  schoolActivityCount = 0;
  awardCount = 0;
  languageCount = 0;
  certificateCount = 0;
  familyCount = 0;

  // 清除额外字段
  const extraFieldsContainer = document.getElementById('extra-fields-container');
  if (extraFieldsContainer) {
    extraFieldsContainer.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">暂无额外字段</p>';
  }
}

// 填充表单
function fillForm(data) {
  // 先清除表单
  clearForm();

  // 保存 version_id 到隐藏字段
  if (data.version_id) {
    let versionIdInput = document.getElementById('version_id');
    if (!versionIdInput) {
      versionIdInput = document.createElement('input');
      versionIdInput.type = 'hidden';
      versionIdInput.id = 'version_id';
      document.body.appendChild(versionIdInput);
    }
    versionIdInput.value = data.version_id;
  }

  // 基本信息
  if (data.name) document.getElementById('name').value = data.name;
  if (data.gender) document.getElementById('gender').value = data.gender;
  if (data.birth_date) document.getElementById('birth_date').value = data.birth_date;
  if (data.id_number) document.getElementById('id_number').value = data.id_number;
  if (data.political_status) document.getElementById('political_status').value = data.political_status;
  if (data.marital_status) document.getElementById('marital_status').value = data.marital_status;
  if (data.ethnicity) document.getElementById('ethnicity').value = data.ethnicity;
  if (data.native_place) document.getElementById('native_place').value = data.native_place;
  if (data.phone) document.getElementById('phone').value = data.phone;
  if (data.email) document.getElementById('email').value = data.email;
  if (data.current_address) document.getElementById('current_address').value = data.current_address;
  if (data.education) document.getElementById('education').value = data.education;
  if (data.work_years) document.getElementById('work_years').value = data.work_years;
  if (data.job_intention) document.getElementById('job_intention').value = data.job_intention;

  // 联系方式扩展
  if (data.wechat) document.getElementById('wechat').value = data.wechat;
  if (data.qq) document.getElementById('qq').value = data.qq;

  // 个人信息扩展
  if (data.household_registration) document.getElementById('household_registration').value = data.household_registration;
  if (data.student_source) document.getElementById('student_source').value = data.student_source;
  if (data.height) document.getElementById('height').value = data.height;
  if (data.weight) document.getElementById('weight').value = data.weight;
  if (data.health_status) document.getElementById('health_status').value = data.health_status;
  if (data.specialty) document.getElementById('specialty').value = data.specialty;

  // 紧急联系人
  if (data.emergency_contact_name) document.getElementById('emergency_contact_name').value = data.emergency_contact_name;
  if (data.emergency_contact_phone) document.getElementById('emergency_contact_phone').value = data.emergency_contact_phone;

  // 其他基本信息
  if (data.country) document.getElementById('country').value = data.country;
  if (data.mailing_address) document.getElementById('mailing_address').value = data.mailing_address;

  // 其他信息
  if (data.skills) document.getElementById('skills').value = data.skills;
  if (data.hobbies) document.getElementById('hobbies').value = data.hobbies;
  if (data.certificates) document.getElementById('certificates').value = data.certificates;
  if (data.awards) document.getElementById('awards').value = data.awards;
  if (data.self_intro) document.getElementById('self_intro').value = data.self_intro;

  // 教育经历
  if (data.education_history) {
    data.education_history.forEach(edu => addEducation(edu));
  }

  // 工作经历
  if (data.work_history) {
    data.work_history.forEach(work => addWork(work));
  }

  // 实习经历
  if (data.internship_history) {
    data.internship_history.forEach(intern => addInternship(intern));
  }

  // 项目经历
  if (data.project_history) {
    data.project_history.forEach(proj => addProject(proj));
  }

  // 在校经历
  if (data.school_activities) {
    data.school_activities.forEach(activity => addSchoolActivity(activity));
  }

  // 获奖情况
  if (data.awards_history) {
    data.awards_history.forEach(award => addAward(award));
  }

  // 外语能力
  if (data.language_skills) {
    data.language_skills.forEach(lang => addLanguageSkill(lang));
  }

  // 资格证书
  if (data.certificates_history) {
    data.certificates_history.forEach(cert => addCertificate(cert));
  }

  // 家庭情况
  if (data.family_info) {
    data.family_info.forEach(member => addFamilyMember(member));
  }

  // 额外字段
  if (data.extra_fields && Object.keys(data.extra_fields).length > 0) {
    renderExtraFields(data.extra_fields, data.field_mapping || {});
  }
}

// 渲染额外字段
function renderExtraFields(extraFields, fieldMapping) {
  const container = document.getElementById('extra-fields-container');
  container.innerHTML = '';

  const fields = Object.entries(extraFields);
  if (fields.length === 0) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">暂无额外字段</p>';
    return;
  }

  // 两列布局
  let html = '<div class="form-row">';

  fields.forEach(([fieldName, value], index) => {
    const label = fieldMapping[fieldName] || fieldName;

    if (index > 0 && index % 2 === 0) {
      html += '</div><div class="form-row">';
    }

    html += `
      <div class="form-group">
        <label for="extra_${fieldName}">${label}</label>
        <input type="text" id="extra_${fieldName}" name="${fieldName}" value="${value || ''}" placeholder="请输入${label}">
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ================== 版本管理功能 ==================

// 用户UI选中状态（仅视觉高亮，不改变实际填写数据）
let selectedVersionId = null;

// 加载版本列表
async function loadVersions() {
  const container = document.getElementById('version-list');

  try {
    // 并行获取版本列表和当前版本引用
    const [versionsRes, currentRes] = await Promise.all([
      fetch(`${API_BASE}/api/resume/versions`),
      fetch(`${API_BASE}/api/resume/load`)
    ]);

    let currentVersionId = null;
    if (currentRes.ok) {
      const currentData = await currentRes.json();
      currentVersionId = currentData.data?.version_id;
    }

    if (versionsRes.ok) {
      const data = await versionsRes.json();
      renderVersions(data.data || [], currentVersionId);
    } else {
      container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">加载失败，请重试</p>';
    }
  } catch (error) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">请确保后端服务已启动</p>';
  }
}

// 渲染版本列表
function renderVersions(versions, currentVersionId) {
  const container = document.getElementById('version-list');

  if (versions.length === 0) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">暂无历史版本</p>';
    return;
  }

  container.innerHTML = versions.map(v => {
    const isCurrent = v.version_id === currentVersionId;
    const currentLabel = isCurrent ? '<span class="current-label">（当前）</span>' : '';
    const displayName = v.display_name || v.name || v.source_file || '未命名简历';

    return `
      <div class="version-item ${isCurrent ? 'is-current' : ''}" data-version-id="${v.version_id}">
        <div class="version-info">
          <div class="version-name">
            <span class="version-display-name">${displayName}</span>
            <button class="btn btn-link btn-sm version-rename-btn" data-version-id="${v.version_id}" title="重命名">✏️</button>
            ${currentLabel}
          </div>
          <div class="version-time">${formatTime(v.updated_at || v.created_at)}</div>
        </div>
        <div class="version-actions">
          <button class="btn btn-primary btn-sm version-load-btn" data-version-id="${v.version_id}">加载</button>
          <button class="btn btn-success btn-sm version-use-btn" data-version-id="${v.version_id}">按照此简历填写</button>
          <button class="btn btn-danger btn-sm version-delete-btn" data-version-id="${v.version_id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  // 使用事件委托绑定按钮点击事件
  container.querySelectorAll('.version-load-btn').forEach(btn => {
    btn.addEventListener('click', () => loadVersion(btn.dataset.versionId));
  });
  container.querySelectorAll('.version-use-btn').forEach(btn => {
    btn.addEventListener('click', () => setAsCurrentVersion(btn.dataset.versionId));
  });
  container.querySelectorAll('.version-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteVersion(btn.dataset.versionId));
  });
  // 绑定重命名按钮点击事件
  container.querySelectorAll('.version-rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showRenameDialog(btn.dataset.versionId, btn.closest('.version-item').querySelector('.version-display-name').textContent);
    });
  });

  // 点击版本卡片时添加选中高亮效果
  container.querySelectorAll('.version-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // 如果点击的是按钮，不触发选中效果
      if (e.target.tagName === 'BUTTON') return;

      // 移除其他卡片的选中状态
      container.querySelectorAll('.version-item').forEach(i => i.classList.remove('selected'));

      // 添加当前卡片的选中状态
      item.classList.add('selected');
      selectedVersionId = item.dataset.versionId;
    });
  });
}

// 显示重命名对话框
function showRenameDialog(versionId, currentName) {
  const newName = prompt('请输入新名称:', currentName);
  if (newName && newName !== currentName) {
    renameVersion(versionId, newName);
  }
}

// 重命名版本
async function renameVersion(versionId, newName) {
  try {
    const response = await fetch(`${API_BASE}/api/resume/version/${versionId}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    if (response.ok) {
      // 刷新版本列表
      loadVersions();
      // 同时刷新右侧版本列表
      loadRightVersionList();
    } else {
      const data = await response.json();
      alert('重命名失败: ' + (data.detail || '未知错误'));
    }
  } catch (error) {
    alert('重命名失败: ' + error.message);
  }
}

// 格式化时间
function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN');
}

// 加载指定版本
async function loadVersion(versionId) {
  try {
    const response = await fetch(`${API_BASE}/api/resume/version/${versionId}`);
    if (response.ok) {
      const data = await response.json();
      fillForm(data.data || data);
      switchView('edit');
      alert('已加载历史版本');
    } else {
      alert('加载失败');
    }
  } catch (error) {
    alert('请确保后端服务已启动');
  }
}

// 删除指定版本
async function deleteVersion(versionId) {
  if (!confirm('确定要删除此版本吗？')) return;

  try {
    const response = await fetch(`${API_BASE}/api/resume/version/${versionId}`, {
      method: 'DELETE'
    });
    if (response.ok) {
      loadVersions();
      alert('删除成功');
    } else {
      alert('删除失败');
    }
  } catch (error) {
    alert('请确保后端服务已启动');
  }
}

// 设置为当前填写模板
async function setAsCurrentVersion(versionId) {
  try {
    // 1. 设置后端当前版本
    const response = await fetch(`${API_BASE}/api/resume/set-current/${versionId}`, {
      method: 'POST'
    });

    if (response.ok) {
      // 2. 从后端加载该版本的完整数据
      const versionResponse = await fetch(`${API_BASE}/api/resume/version/${versionId}`);
      if (versionResponse.ok) {
        const versionData = await versionResponse.json();
        if (versionData.success && versionData.data) {
          // 3. 同步到 chrome.storage.local，确保填写时使用正确的版本
          chrome.storage.local.set({ resumeData: versionData.data }, () => {
            console.log('[简历助手] 已同步选中版本到本地缓存');
          });
        }
      }

      // 4. 重新加载版本列表以更新"（当前）"标记
      loadVersions();
      alert('已设置为当前填写模板，可以开始填写表单');
    } else {
      const data = await response.json();
      alert(data.detail || '设置失败');
    }
  } catch (error) {
    alert('请确保后端服务已启动');
  }
}

// ================== 上传补充信息功能 ==================

/**
 * 切换补充信息区域显示
 */
function toggleSupplementSection() {
  const section = document.getElementById('supplement-section');
  if (!section) return;

  const isVisible = section.style.display !== 'none';
  section.style.display = isVisible ? 'none' : 'block';

  // 更新按钮文本
  const toggleBtn = document.getElementById('toggle-supplement-btn');
  if (toggleBtn) {
    toggleBtn.textContent = isVisible ? '展开' : '收起';
  }
}

/**
 * 处理补充信息文本提交（需求22）
 */
async function handleSupplementText() {
  const textarea = document.getElementById('supplement-textarea');
  const text = textarea?.value?.trim();

  if (!text) {
    alert('请输入补充信息');
    return;
  }

  const btn = document.getElementById('submit-supplement-btn');
  const originalText = btn.textContent;
  btn.textContent = '处理中...';
  btn.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/api/resume/supplement-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // 显示提取的字段
      const extractedFields = result.extracted_fields || [];
      let message = '补充信息已整合到简历中';
      if (extractedFields.length > 0) {
        message += `\n\n提取的字段: ${extractedFields.join(', ')}`;
      }
      alert(message);

      // 重新加载表单数据
      if (result.data) {
        fillForm(result.data);
      }

      // 清空文本框
      if (textarea) textarea.value = '';
    } else {
      alert(result.detail || result.message || '处理失败');
    }
  } catch (error) {
    console.error('提交补充信息失败:', error);
    alert('处理失败，请确保后端服务已启动');
  } finally {
    // 恢复按钮状态
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

/**
 * 处理补充信息文件上传
 */
async function handleSupplementUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // 清空 input，允许重复上传同一文件
  event.target.value = '';

  // 检查文件格式
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['docx', 'txt', 'xlsx'].includes(ext)) {
    alert('不支持的文件格式，请上传 DOCX、TXT 或 XLSX 文件');
    return;
  }

  // 显示上传中提示
  const btn = document.getElementById('upload-supplement-btn');
  const originalText = btn.textContent;
  btn.textContent = '上传解析中...';
  btn.disabled = true;

  try {
    // 构建 FormData
    const formData = new FormData();
    formData.append('file', file);

    // 调用后端 API
    const response = await fetch(`${API_BASE}/api/resume/supplement`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // 显示提取的字段
      const extractedFields = result.extracted_fields || [];
      let message = '补充信息已整合到简历中';
      if (extractedFields.length > 0) {
        message += `\n\n提取的字段: ${extractedFields.join(', ')}`;
      }
      alert(message);

      // 重新加载表单数据
      if (result.data) {
        fillForm(result.data);
      }
    } else {
      alert(result.detail || result.message || '上传失败');
    }
  } catch (error) {
    console.error('上传补充信息失败:', error);
    alert('上传失败，请确保后端服务已启动');
  } finally {
    // 恢复按钮状态
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
