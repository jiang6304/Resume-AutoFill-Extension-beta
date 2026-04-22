"""
LLM调用服务
调用外部LLM API进行简历解析和字段映射
支持Anthropic格式API（兼容GLM-5等模型）
"""
import os
import json
import re
import time
import httpx
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()


class LLMService:
    """LLM服务 - 支持Anthropic格式API"""

    def __init__(self):
        """初始化LLM客户端"""
        self.api_key = os.getenv("LLM_API_KEY")
        self.base_url = os.getenv("LLM_BASE_URL")
        self.model = os.getenv("LLM_MODEL", "GLM-5")


        # 限流配置
        self.last_request_time = 0
        self.min_request_interval = 2.0  # 最小请求间隔（秒）

        # 重试配置
        self.max_retries = 3
        self.retry_delay = 5.0  # 重试延迟（秒）

        if not self.api_key:
            raise ValueError("LLM_API_KEY 环境变量未设置，请在 backend/.env 文件中配置")
        if not self.base_url:
            raise ValueError("LLM_BASE_URL 环境变量未设置，请在 backend/.env 文件中配置")

    def _wait_for_rate_limit(self):
        """等待限流"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)
        self.last_request_time = time.time()

    def _call_api(self, system_prompt: str, user_message: str, max_tokens: int = 4000) -> str:
        """
        调用Anthropic格式API（带重试和限流）

        Args:
            system_prompt: 系统提示
            user_message: 用户消息
            max_tokens: 最大token数

        Returns:
            API响应文本
        """
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_message
                }
            ]
        }

        # 构建API URL
        url = f"{self.base_url}/v1/messages"

        last_error = None

        for attempt in range(self.max_retries):
            try:
                # 等待限流
                self._wait_for_rate_limit()

                with httpx.Client(timeout=120.0) as client:
                    response = client.post(url, headers=headers, json=payload)

                    if response.status_code == 429:
                        # 限流错误，等待后重试
                        retry_after = self.retry_delay * (attempt + 1)  # 递增等待时间
                        print(f"API限流，等待 {retry_after} 秒后重试... (尝试 {attempt + 1}/{self.max_retries})")
                        time.sleep(retry_after)
                        continue

                    if response.status_code != 200:
                        raise ValueError(f"API调用失败: {response.status_code} - {response.text}")

                    result = response.json()

                    # 调试：打印响应结构
                    print(f"[DEBUG] API响应状态码: {response.status_code}")
                    print(f"[DEBUG] 响应键: {list(result.keys())}")

                    # 解析Anthropic响应格式
                    if "content" in result and isinstance(result["content"], list):
                        # 标准Anthropic格式
                        content_text = ""
                        for block in result["content"]:
                            if block.get("type") == "text":
                                content_text = block.get("text", "")
                                break
                        if not content_text and result["content"]:
                            content_text = result["content"][0].get("text", "")
                        print(f"[DEBUG] 提取的文本长度: {len(content_text)}")
                        print(f"[DEBUG] 文本前500字符: {content_text[:500]}")
                        return content_text
                    elif "choices" in result:
                        # OpenAI兼容格式（某些代理返回）
                        content_text = result["choices"][0]["message"]["content"]
                        print(f"[DEBUG] OpenAI格式文本长度: {len(content_text)}")
                        return content_text
                    else:
                        raise ValueError(f"未知的API响应格式: {result}")

            except httpx.TimeoutException:
                last_error = "API调用超时"
                print(f"请求超时，等待后重试... (尝试 {attempt + 1}/{self.max_retries})")
                time.sleep(self.retry_delay)
            except httpx.RequestError as e:
                last_error = f"API请求失败: {str(e)}"
                print(f"请求错误: {e}，等待后重试... (尝试 {attempt + 1}/{self.max_retries})")
                time.sleep(self.retry_delay)

        raise ValueError(f"API调用失败，已重试 {self.max_retries} 次: {last_error}")

    def _extract_birth_from_id_number(self, id_number: str) -> str:
        """
        从身份证号中提取出生日期

        Args:
            id_number: 身份证号（15位或18位）

        Returns:
            出生日期字符串，格式为 YYYY-MM-DD；提取失败返回空字符串
        """
        if not id_number:
            return ""

        # 移除可能的空格
        id_number = id_number.strip().replace(" ", "")

        # 验证身份证号长度
        if len(id_number) == 18:
            # 18位身份证：第7-14位是出生日期
            birth_str = id_number[6:14]
        elif len(id_number) == 15:
            # 15位身份证（旧版）：第7-12位是出生日期，年份为2位
            birth_str = "19" + id_number[6:12]
        else:
            return ""

        # 解析年月日
        try:
            year = int(birth_str[0:4])
            month = int(birth_str[4:6])
            day = int(birth_str[6:8])

            # 基本验证
            if not (1900 <= year <= 2100):
                return ""
            if not (1 <= month <= 12):
                return ""
            if not (1 <= day <= 31):
                return ""

            return f"{year:04d}-{month:02d}-{day:02d}"
        except (ValueError, IndexError):
            return ""

    def extract_resume_info(self, resume_text: str) -> Dict[str, Any]:
        """
        从简历文本中抽取结构化信息

        Args:
            resume_text: 简历纯文本内容

        Returns:
            结构化的简历信息字典
        """
        system_prompt = "你是一个专业的简历信息抽取助手。你需要从简历文本中提取信息，并以严格的JSON格式输出。不要输出任何其他内容，不要使用markdown代码块包裹，直接输出JSON对象。"
        user_message = self._build_extraction_prompt(resume_text)

        try:
            content = self._call_api(system_prompt, user_message, max_tokens=16000)

            # 清理可能的markdown代码块
            content = self._clean_json_response(content)

            # 解析JSON
            result = self._try_parse_json(content)

            # 后处理：从身份证号提取出生日期
            result = self._post_process_resume(result)

            return result

        except json.JSONDecodeError as e:
            raise ValueError(f"LLM返回的不是有效JSON: {str(e)}\n原始响应: {content}")
        except Exception as e:
            raise ValueError(f"LLM调用失败: {str(e)}")

    def _post_process_resume(self, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        后处理简历数据

        Args:
            resume_data: 解析后的简历数据

        Returns:
            处理后的简历数据
        """
        # 从身份证号提取出生日期（如果 birth_date 为空）
        if not resume_data.get("birth_date") and resume_data.get("id_number"):
            birth_date = self._extract_birth_from_id_number(resume_data["id_number"])
            if birth_date:
                resume_data["birth_date"] = birth_date
                print(f"[INFO] 从身份证号提取出生日期: {birth_date}")

        # 教育经历按学历高低排序，并提取最高学历信息
        resume_data = self._process_education_history(resume_data)

        # 其他经历按时间排序（最新的在前）
        resume_data = self._sort_experience_by_time(resume_data)

        return resume_data

    def _parse_time_for_sort(self, time_str: str) -> tuple:
        """
        解析时间字符串用于排序

        Args:
            time_str: 时间字符串，如 "2024-05", "2024.05", "2024年5月", "至今"

        Returns:
            (年, 月) 元组，"至今"返回 (9999, 99)，解析失败返回 (0, 0)
        """
        if not time_str:
            return (0, 0)

        time_str = time_str.strip()

        # "至今" 排在最前面
        if time_str in ["至今", "现在", "至今.", "Present", "Now"]:
            return (9999, 99)

        # 尝试多种格式解析
        import re

        # 格式: YYYY-MM, YYYY.MM, YYYY/MM
        match = re.match(r'(\d{4})[-./](\d{1,2})', time_str)
        if match:
            return (int(match.group(1)), int(match.group(2)))

        # 格式: YYYY年MM月
        match = re.match(r'(\d{4})年(\d{1,2})月?', time_str)
        if match:
            return (int(match.group(1)), int(match.group(2)))

        # 格式: YYYY (只有年份)
        match = re.match(r'(\d{4})', time_str)
        if match:
            return (int(match.group(1)), 0)

        return (0, 0)

    def _sort_experience_by_time(self, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        将各类经历按时间排序（最新的在前）

        Args:
            resume_data: 解析后的简历数据

        Returns:
            处理后的简历数据
        """
        # 需要按时间排序的经历列表（配置：字段名, 时间字段）
        experience_configs = [
            # work_history: 按 end 时间排序，end 相同则按 start 排序
            ("work_history", ["end", "start"]),
            # internship_history: 同上
            ("internship_history", ["end", "start"]),
            # project_history: 同上
            ("project_history", ["end", "start"]),
            # school_activities: 同上
            ("school_activities", ["end", "start"]),
            # education_history: 已经按学历排序，不需要再排序
            # awards_history: 只有 time 字段
            ("awards_history", ["time"]),
            # certificates_history: 只有 time 字段
            ("certificates_history", ["time"]),
            # papers: time 字段
            ("papers", ["time"]),
            # patents: time 字段
            ("patents", ["time"]),
            # competitions: time 字段
            ("competitions", ["time"]),
        ]

        for field_name, time_fields in experience_configs:
            items = resume_data.get(field_name, [])
            if not items or not isinstance(items, list):
                continue

            # 排序：按时间字段倒序（最新的在前）
            def get_sort_key(item):
                keys = []
                for tf in time_fields:
                    time_val = item.get(tf, "") if isinstance(item, dict) else ""
                    keys.append(self._parse_time_for_sort(time_val))
                return keys

            sorted_items = sorted(items, key=get_sort_key, reverse=True)
            resume_data[field_name] = sorted_items

            if len(items) > 1:
                print(f"[INFO] {field_name} 已按时间排序，共 {len(items)} 条记录")

        return resume_data

    # 学历等级映射（数字越大学历越高）
    _DEGREE_ORDER = {
        # 博士
        "博士": 10, "博士研究生": 10, "博士生": 10, "PhD": 10, "Doctor": 10,
        # 硕士
        "硕士": 9, "硕士研究生": 9, "硕士生": 9, "Master": 9, "研究生": 9,
        # 本科
        "本科": 8, "学士": 8, "本科生": 8, "Bachelor": 8, "大学本科": 8,
        # 大专
        "大专": 7, "专科": 7, "高职": 7, "大学专科": 7, "职业技术学院": 7,
        # 高中
        "高中": 6, "高中中专": 6, "高级中学": 6,
        # 中专/职高
        "中专": 5, "职高": 5, "职业高中": 5, "中等专业学校": 5,
        # 初中
        "初中": 4, "初级中学": 4,
        # 小学
        "小学": 3, "小学学历": 3,
    }

    def _get_degree_level(self, degree: str) -> int:
        """
        获取学历等级

        Args:
            degree: 学历字符串

        Returns:
            学历等级数字，未识别返回0
        """
        if not degree:
            return 0
        degree = degree.strip()
        # 精确匹配
        if degree in self._DEGREE_ORDER:
            return self._DEGREE_ORDER[degree]
        # 模糊匹配（包含关系）
        for key, level in self._DEGREE_ORDER.items():
            if key in degree or degree in key:
                return level
        return 0

    def _process_education_history(self, resume_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        处理教育经历：按学历排序，提取最高学历信息

        Args:
            resume_data: 解析后的简历数据

        Returns:
            处理后的简历数据
        """
        edu_history = resume_data.get("education_history", [])
        if not edu_history or not isinstance(edu_history, list):
            return resume_data

        # 按学历等级排序（高到低）
        sorted_edu = sorted(
            edu_history,
            key=lambda x: self._get_degree_level(x.get("degree", "")),
            reverse=True
        )

        # 更新排序后的教育经历
        resume_data["education_history"] = sorted_edu

        # 提取最高学历信息到顶层字段（如果原字段为空）
        if sorted_edu:
            highest_edu = sorted_edu[0]

            # 更新 education 字段（最高学历）
            if not resume_data.get("education") and highest_edu.get("degree"):
                resume_data["education"] = highest_edu["degree"]
                print(f"[INFO] 提取最高学历: {highest_edu['degree']}")

            # 添加最高学历教育经历的完整信息（方便后续填写使用）
            # 如果第一条教育经历的学校、专业等信息为空，不覆盖
            resume_data["highest_education"] = {
                "school": highest_edu.get("school", ""),
                "major": highest_edu.get("major", ""),
                "degree": highest_edu.get("degree", ""),
                "college": highest_edu.get("college", ""),
                "start": highest_edu.get("start", ""),
                "end": highest_edu.get("end", ""),
                "gpa": highest_edu.get("gpa", ""),
                "ranking": highest_edu.get("ranking", ""),
                "study_mode": highest_edu.get("study_mode", ""),
            }

            print(f"[INFO] 教育经历已按学历排序，最高学历: {highest_edu.get('degree', '未知')} - {highest_edu.get('school', '未知')}")

        return resume_data

    def map_fields(
        self,
        resume_data: Dict[str, Any],
        form_structure: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        将简历数据映射到表单字段（OPT-001增强版）

        Args:
            resume_data: 简历结构化数据
            form_structure: 表单字段结构列表

        Returns:
            映射结果列表，每个元素包含字段索引和对应值
        """
        system_prompt = "你是一个专业的表单字段映射助手。你需要根据简历信息和表单字段描述，为每个表单字段找到最合适的值。以严格的JSON数组格式输出，不要输出任何其他内容。"
        user_message = self._build_mapping_prompt(resume_data, form_structure)

        try:
            # OPT-001: 增加max_tokens以处理更多字段
            content = self._call_api(system_prompt, user_message, max_tokens=4000)
            content = self._clean_json_response(content)
            result = json.loads(content)

            # OPT-001: 后处理验证映射结果
            result = self._post_process_mapping(result, resume_data, form_structure)

            return result

        except json.JSONDecodeError as e:
            raise ValueError(f"LLM返回的不是有效JSON: {str(e)}\n原始响应: {content}")
        except Exception as e:
            raise ValueError(f"LLM调用失败: {str(e)}")

    def map_single_field(
        self,
        resume_data: Dict[str, Any],
        field_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        映射单个表单字段（问题26：逐元素映射填写）

        Args:
            resume_data: 简历结构化数据
            field_info: 单个字段信息，包含 index, type, label, name, placeholder, options 等

        Returns:
            映射结果，包含 index 和 value
        """
        # 构建字段中文对照
        field_mapping = resume_data.get('field_mapping', {})
        preset_mapping = {
            # 基本信息
            "name": "姓名", "gender": "性别", "birth_date": "出生日期",
            "id_number": "身份证号", "political_status": "政治面貌",
            "marital_status": "婚姻状况", "ethnicity": "民族",
            "native_place": "籍贯", "phone": "手机号", "email": "邮箱",
            "current_address": "现居地址", "education": "学历",
            "work_years": "工作年限", "job_intention": "求职意向",
            "wechat": "微信", "qq": "QQ", "household_registration": "户口所在地",
            "height": "身高", "weight": "体重", "health_status": "健康状况",
            "emergency_contact_name": "紧急联系人", "emergency_contact_phone": "紧急联系人电话",
            # 证件相关
            "id_type": "证件类型", "id_card_type": "证件类型",
            "id_card_number": "证件号码", "id_card_no": "证件号码",
            "id_number": "证件号码", "idcardno": "证件号码",
            # 招聘相关
            "recruitment_source": "招聘信息来源",
            "recruitment_type": "招聘类型",
            # 荣誉相关
            "award_type": "荣誉类型", "award_level": "获奖级别",
            # 教育相关
            "full_education": "全日制学历", "is_full_time": "是否统招",
            # 系统字段
            "resume_id": "简历ID", "resume_resumeId": "简历ID",
            # 企业字段
            "social_credit_code": "统一社会信用代码", "socialCreditCode": "统一社会信用代码",
        }
        all_mapping = {**preset_mapping, **field_mapping}

        system_prompt = "你是一个表单字段映射助手。根据简历信息为单个表单字段找到最合适的值。以严格的JSON格式输出，不要输出任何其他内容。"

        user_message = f"""根据简历为单个表单字段分配合适的值。

简历信息：
{json.dumps(resume_data, ensure_ascii=False, indent=2)}

字段中文对照：
{json.dumps(all_mapping, ensure_ascii=False, indent=2)}

当前字段：
{json.dumps(field_info, ensure_ascii=False, indent=2)}

【核心规则】
1. 简历中没有的信息，value必须填空字符串""
2. 是/否类型问题：简历中有明确说明填"是"或"否"，否则填""
3. 选择题：只有当简历信息能明确匹配某个选项时才填写

【特殊字段处理】
- 证件类型：如有身份证号，默认填"身份证"
- 证件号码：对应 id_number
- 简历ID/系统字段：填空字符串""
- 社会信用代码：个人简历无此信息，填空字符串""
- 招聘信息来源/招聘类型：简历中通常无此信息，填空字符串""
- 全日制学历/是否统招：检查 education_history 中的 study_mode

【值格式化】
- 日期：YYYY-MM-DD 格式
- 地址：省市区格式，如"广东省深圳市南山区"
- 手机号：纯数字

【政治面貌同义词】
- 党员/中共党员/共产党员 → 匹配含"党员"的选项
- 团员/共青团员 → 匹配含"团员"的选项
- 群众/普通群众 → 匹配含"群众"的选项

【输出格式】
{{"index": {field_info.get('index', 0)}, "value": "填入的值"}}

只返回JSON对象，不要解释。"""

        try:
            content = self._call_api(system_prompt, user_message, max_tokens=1000)
            content = self._clean_json_response(content)
            result = json.loads(content)

            # 后处理
            if isinstance(result, dict):
                # 确保有 index
                if 'index' not in result:
                    result['index'] = field_info.get('index', 0)

                # 应用后处理验证
                result = self._post_process_mapping([result], resume_data, [field_info])
                if result:
                    return result[0]

            return {"index": field_info.get('index', 0), "value": ""}

        except json.JSONDecodeError as e:
            print(f"[WARN] 单字段映射JSON解析失败: {e}")
            return {"index": field_info.get('index', 0), "value": ""}
        except Exception as e:
            print(f"[WARN] 单字段映射失败: {e}")
            return {"index": field_info.get('index', 0), "value": ""}

    def _build_extraction_prompt(self, resume_text: str) -> str:
        """构建简历抽取Prompt（精简版，减少token消耗）"""
        # 使用普通字符串拼接，避免f-string中的花括号问题
        prompt = """从简历提取信息，输出纯JSON（无markdown包裹）。

【核心规则】
1. name只填本人姓名，家人姓名填入family_info
2. phone只填本人手机号，家庭电话填入对应字段

【基础字段】
name, gender, birth_date(YYYY-MM-DD), id_number, political_status, marital_status, ethnicity, native_place, phone, email, current_address, education, work_years, job_intention, wechat, qq, household_registration, student_source, height, weight, health_status, specialty, emergency_contact_name, emergency_contact_phone, country, mailing_address

【数组字段】
- education_history: 对象数组，每项含 school, major, degree, degree_type, start, end, college, study_mode, courses, gpa, ranking, is_overseas, minor_major, second_degree, supervisor
- work_history: 对象数组，每项含 company, position, start, end, description, department, salary, achievements, referee_name, referee_contact, leaving_reason, subordinates, work_type
- internship_history: 对象数组，每项含 company, position, start, end, description, department, achievements, referee_name, referee_contact
- project_history: 对象数组，每项含 name, role, start, end, description, achievements, link
- school_activities: 对象数组，每项含 name, role, start, end, description, activity_type
- awards_history: 对象数组，每项含 name, level, time, description
- language_skills: 对象数组，每项含 language, certificate, level, score, listening, reading
- computer_skills: 对象数组，每项含 skill_type, level
- certificates_history: 对象数组，每项含 name, time, number, description
- family_info: 对象数组，每项含 name, relation, phone, company, position, political_status
- papers: 对象数组，每项含 title, journal, level, time, authors, impact_factor, link
- patents: 对象数组，每项含 name, number, type, time, description
- competitions: 对象数组，每项含 name, time, description
- portfolio: 对象数组，每项含 name, link, description

【经历区分】work_history=正式工作, internship_history=标注"实习", school_activities=社团/社会实践

【日期格式】"2024.12.24"转"2024-12-24", "2024年12月"转"2024-12", "至今"保持

【其他】skills, certificates, awards, self_intro
【额外信息】未定义字段存入extra_fields对象，field_mapping记录中文名

示例输出格式:
{"name":"张三","phone":"13800138000","education_history":[{"school":"XX大学","major":"计算机","degree":"本科"}],"family_info":[{"name":"张父","relation":"父亲"}],"extra_fields":{},"field_mapping":{}}

要求：所有预设字段输出（空值填""或[]），extra_fields和field_mapping必须存在。

简历：
"""
        return prompt + resume_text

    def _build_mapping_prompt(
        self,
        resume_data: Dict[str, Any],
        form_structure: List[Dict[str, Any]]
    ) -> str:
        """构建字段映射Prompt"""

        # 构建字段映射说明
        field_mapping = resume_data.get('field_mapping', {})
        extra_fields = resume_data.get('extra_fields', {})

        # 预设字段的中文名称映射
        preset_mapping = {
            # 基本信息
            "name": "姓名",
            "gender": "性别",
            "birth_date": "出生日期",
            "id_number": "身份证号",
            "id_type": "证件类型",
            "political_status": "政治面貌",
            "marital_status": "婚姻状况",
            "ethnicity": "民族",
            "native_place": "籍贯",
            "phone": "手机号",
            "email": "邮箱",
            "current_address": "现居地址",
            "education": "学历",
            "work_years": "工作年限",
            "job_intention": "求职意向",
            "skills": "专业技能",
            "certificates": "证书",
            "awards": "奖项",
            "self_intro": "自我介绍",
            # 联系方式
            "wechat": "微信",
            "qq": "QQ",
            "household_registration": "户口所在地",
            "student_source": "生源地",
            "height": "身高",
            "weight": "体重",
            "health_status": "健康状况",
            "specialty": "特长",
            "emergency_contact_name": "紧急联系人",
            "emergency_contact_phone": "紧急联系人电话",
            "country": "国籍",
            "mailing_address": "通信地址",
            "postal_code": "邮政编码",
            # 最高学历相关信息
            "highest_education": "最高学历信息",
            "highest_education.school": "最高学历学校",
            "highest_education.major": "最高学历专业",
            "highest_education.degree": "最高学历",
            "highest_education.college": "最高学历学院",
            "highest_education.start": "最高学历开始时间",
            "highest_education.end": "最高学历结束时间",
            "highest_education.gpa": "最高学历GPA",
            "highest_education.ranking": "最高学历排名",
            "highest_education.study_mode": "最高学历学习形式",
            # 家庭信息
            "family_info": "家庭情况",
            # 实习工作相关
            "work_history": "工作经历",
            "internship_history": "实习经历",
            "project_history": "项目经历",
            "education_history": "教育经历",
            # 招聘相关字段
            "recruitment_source": "招聘信息来源",
            "recruitment_type": "招聘类型",
            "award_type": "荣誉类型",
            "award_level": "获奖级别",
            # 证件相关（支持多种字段名）
            "id_card_number": "证件号码",
            "id_card_no": "证件号码",
            "idcardno": "证件号码",
            "id_card_type": "证件类型",
            "resume_id": "简历ID",
            "resume_resumeId": "简历ID",
            # 教育相关
            "full_education": "全日制教育",
            "full_education_type": "全日制学历",
            "fullEducation": "全日制学历",
            "is_full_time": "是否统招",
            "degree_type": "学历类型",
            # 企业相关
            "social_credit_code": "统一社会信用代码",
            "socialCreditCode": "统一社会信用代码",
            "company_code": "企业代码",
            # 其他常见字段
            "other": "其他",
            "other_info": "其他信息",
            "remarks": "备注",
            "description": "描述",
        }

        # 合并所有字段映射
        all_mapping = {**preset_mapping, **field_mapping}

        # extra_fields在resume_data中已经包含，会随json.dumps一起输出
        _ = extra_fields  # 标记已使用，避免IDE警告

        # 规范化简历数据：将布尔值性别转换为字符串
        normalized_resume = dict(resume_data)
        if 'gender' in normalized_resume:
            gender_val = normalized_resume['gender']
            if gender_val is True or gender_val == 'true' or gender_val == 'True':
                normalized_resume['gender'] = '男'
            elif gender_val is False or gender_val == 'false' or gender_val == 'False':
                normalized_resume['gender'] = '女'
            elif str(gender_val).lower() in ['m', 'male', '1']:
                normalized_resume['gender'] = '男'
            elif str(gender_val).lower() in ['f', 'female', '0']:
                normalized_resume['gender'] = '女'

        return f"""根据简历为表单字段分配合适的值和填写策略。

简历信息：
{json.dumps(normalized_resume, ensure_ascii=False, indent=2)}

字段中文对照：
{json.dumps(all_mapping, ensure_ascii=False, indent=2)}

表单字段：
{json.dumps(form_structure, ensure_ascii=False, indent=2)}

【核心规则 - 必须严格遵守】
1. 简历中没有的信息，value必须填空字符串""，绝对不能凭空编造或随意填写
2. 是/否类型问题（如"是否需要签证"、"是否有犯罪记录"、"是否实习过"、"是否接受调剂"等）：
   - 简历中有明确说明 → 填"是"或"否"
   - 简历中没有相关信息 → 填空字符串""
   - 绝对不能用简历中的其他无关信息来回答
   - 识别关键词：是否、有无、能否、可以、是否接受、是否同意、是否需要
3. 选择题（select/radio/checkbox）：
   - 只有当简历信息能明确匹配某个选项时才填写，否则留空
   - 如果有options字段，优先从options中选择最匹配的选项
   - 使用模糊匹配：如简历"本科"可匹配选项"大学本科"、"本科"
   - 如果提供了options，必须从options中选择一个值，不能填写options之外的值
   - 多选题（checkbox）可以填写多个值，用数组表示

【字段名识别规则 - 重要】
1. 字段名可能使用不同命名风格，需要智能识别：
   - 驼峰命名：resumeResumeId, fullEducation, socialCreditCode
   - 下划线命名：resume_resume_id, full_education, social_credit_code
   - 中划线命名：resume-id, full-education
   - 以上所有格式都应该识别为同一字段
2. 特殊字段名映射：
   - resume_resumeId, resumeResumeId, resume_id → 简历ID（系统字段，填空即可）
   - fullEducation, full_education, isFullTime → 全日制学历/是否统招
   - socialCreditCode, social_credit_code → 统一社会信用代码（企业字段，个人简历无此信息）
   - idNumber, id_number, idCardNo, id_card_number, idCardNumber, idCard, resume_basicInfo_idCard → 证件号码 → 对应 id_number
   - idType, id_type, idCardType, id_card_type → 证件类型（默认为"身份证"）
   - recruitmentSource, recruitment_source → 招聘信息来源
   - recruitmentType, recruitment_type → 招聘类型
   - awardType, award_type, honorType, honor_type → 荣誉类型/获奖类型
3. 无法识别的字段：
   - 如果简历中完全没有相关信息，填空字符串""
   - 如果是系统内部字段（如ID、版本号等），填空字符串""
   - 如果是企业信息字段（个人简历不可能有），填空字符串""

【值格式化规则】
1. 日期类字段（type含date/日期/出生）：统一转为 YYYY-MM-DD 格式
   - "1995年6月15日" → "1995-06-15"
   - "1995.06.15" → "1995-06-15"
   - "06/15/1995" → "1995-06-15"
2. 地址类字段（label含省/市/区/县/籍贯/地址/居住地）：输出完整地址
   - 格式："广东省深圳市南山区" 或 "广东-深圳-南山"
   - 确保包含省、市、区三级
3. 性别字段（label含性别）：
   - 如果选项是"男/女"，输出"男"或"女"
   - 如果选项是"true/false"，输出"true"或"false"
   - 如果选项是"1/0"或"M/F"，输出对应值
   - 优先从options中查找实际选项值
4. 学历字段（label含学历）：
   - 匹配常见的学历表述：本科、大专、硕士、博士、高中、中专等
   - 如果选项中有"大学本科"，简历"本科"应输出"大学本科"
5. 手机号：去除所有非数字字符，保留纯数字
6. 邮箱：转小写，去除前后空格

【填写策略识别】
根据字段的type和label，判断正确的填写策略：
1. 级联选择器（cascader）：label含"省市区"、"籍贯"、"现居地址"、"户口所在地"等
   - value应包含完整的省市区信息
   - 如果简历有native_place或current_address，使用该值
2. 日期选择器：label含"日期"、"出生"、"时间"、"年月"等
   - value必须是YYYY-MM-DD格式
3. 下拉框（select）：根据options选择最匹配的值
4. 单选按钮（radio）：根据label选择"是/否"或其他选项
5. 复选框（checkbox）：可多选，value可以是数组

【常见字段映射】
- 姓名 → name
- 性别 → gender（注意选项格式）
- 出生日期/生日 → birth_date（YYYY-MM-DD格式）
- 手机/电话/手机号 → phone
- 邮箱/电子邮件 → email
- 籍贯/原籍 → native_place（省市区格式）
- 现居地址/现居住城市 → current_address（省市区格式）
- 户口/户籍所在地 → household_registration（省市区格式）
- 民族 → ethnicity
- 政治面貌 → political_status
- 婚姻状况 → marital_status
- 健康/健康状况 → health_status
- 身高 → height
- 体重 → weight
- 国籍 → country
- 紧急联系人 → emergency_contact_name
- 紧急联系人电话 → emergency_contact_phone
- 学历/最高学历 → education 或 education_history[0].degree
- 毕业院校 → education_history[0].school
- 专业 → education_history[0].major
- 证件类型 → 默认填"身份证"（如简历中有id_number）
- 证件号码/身份证号 → id_number
- 招聘信息来源 → 简历中通常无此信息，填""
- 招聘类型 → 简历中通常无此信息，填""
- 荣誉类型 → 简历中通常无此信息，填""

【政治面貌同义词映射】
当字段label含"政治面貌"、"党员身份"、"政治面貌"等关键词时，使用以下同义词映射：
- 党员/中共党员/共产党员/中国共产党党员 → 优先匹配含"党员"、"中共"的选项
- 预备党员 → 优先匹配含"预备党员"的选项
- 团员/共青团员/中国共青团员/中国共青团 → 优先匹配含"团员"、"共青团"的选项
- 群众/普通群众/无党派人士 → 优先匹配含"群众"、"无党派"的选项
- 民主党派成员 → 优先匹配含"民主党派"的选项
重要：必须从表单的options中选择最匹配的选项，不能填写options之外的值

【输出格式】
JSON数组，每个元素包含：
- index：字段索引（从0开始）
- value：填入的值（无匹配填空字符串""）
- strategy：（可选）填写策略提示，如 "cascader"、"date"、"select_option"

示例输出：
[
  {{"index": 0, "value": "张三"}},
  {{"index": 1, "value": "男"}},
  {{"index": 2, "value": "1995-06-15", "strategy": "date"}},
  {{"index": 3, "value": "广东省深圳市南山区", "strategy": "cascader"}},
  {{"index": 4, "value": ""}},
  {{"index": 5, "value": "身份证"}},
  {{"index": 6, "value": "440305199506150034"}}
]

只返回JSON数组，不要任何解释。"""

    def _clean_json_response(self, content: str) -> str:
        """清理LLM响应中的markdown代码块和修复常见JSON问题"""
        # 移除可能的markdown代码块标记
        content = re.sub(r'^```json\s*', '', content)
        content = re.sub(r'^```\s*', '', content)
        content = re.sub(r'\s*```$', '', content)

        # 移除可能的前后文本说明
        # 检查是数组还是对象
        first_brace = content.find('{')
        first_bracket = content.find('[')
        last_brace = content.rfind('}')
        last_bracket = content.rfind(']')

        # 判断是数组还是对象
        if first_bracket != -1 and (first_brace == -1 or first_bracket < first_brace):
            # 数组格式
            if last_bracket != -1 and last_bracket > first_bracket:
                content = content[first_bracket:last_bracket + 1]
        elif first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            # 对象格式 - 检查是否是多个对象但没有外层数组
            # 例如: {"a":1}, {"b":2} 应该变成 [{"a":1}, {"b":2}]
            content = content[first_brace:last_brace + 1]

            # 检查是否包含多个JSON对象（用 },{ 或 } , { 或 }{ 分隔）
            # 这种情况说明LLM返回了多个对象但忘记加外层数组
            # 使用更宽松的正则，允许任意空白
            if re.search(r'\}\s*,\s*\{', content):
                # 多个对象，需要包装成数组
                content = '[' + content + ']'
                print(f"[DEBUG] 检测到多个JSON对象，已包装为数组")
            else:
                # 尝试另一种检测方式：统计 { 和 } 的数量
                open_braces = content.count('{')
                close_braces = content.count('}')
                if open_braces > 1 and open_braces == close_braces:
                    # 多个独立的JSON对象，需要包装成数组
                    # 使用正则分割
                    objects = re.findall(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content, re.DOTALL)
                    if len(objects) > 1:
                        content = '[' + ','.join(objects) + ']'
                        print(f"[DEBUG] 检测到 {len(objects)} 个独立JSON对象，已包装为数组")
        else:
            # 没有找到有效的JSON结构
            # 尝试提取所有 {...} 模式
            objects = re.findall(r'\{[^{}]*\}', content)
            if objects:
                content = '[' + ','.join(objects) + ']'
                print(f"[DEBUG] 提取了 {len(objects)} 个JSON对象并包装为数组")

        # 移除控制字符（保留换行和制表符，它们在字符串内需要转义但这里先保留）
        content = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', content)

        # 移除零宽字符和 BOM
        content = re.sub(r'[\ufeff\u200b-\u200f\u2028-\u202f]', '', content)

        # 修复常见的JSON格式问题
        # 修复尾部逗号问题: ,} 或 ,]
        content = re.sub(r',\s*}', '}', content)
        content = re.sub(r',\s*]', ']', content)

        # 修复字符串值内部未转义的双引号
        content = self._fix_unescaped_quotes(content)

        return content.strip()

    def _fix_unescaped_quotes(self, content: str) -> str:
        """
        修复 JSON 字符串值内部未转义的双引号

        例如：": "第十一届"挑战杯"湖南省..." 会被错误解析
        应该改为：": "第十一届\"挑战杯\"湖南省..."
        """
        # 使用状态机逐字符处理
        result = []
        i = 0
        in_string = False
        escape_next = False

        while i < len(content):
            char = content[i]

            if escape_next:
                result.append(char)
                escape_next = False
                i += 1
                continue

            if char == '\\':
                result.append(char)
                escape_next = True
                i += 1
                continue

            if char == '"':
                if not in_string:
                    # 进入字符串
                    in_string = True
                    result.append(char)
                else:
                    # 检查这是否是字符串结束
                    # 向后查找下一个非空白字符
                    j = i + 1
                    while j < len(content) and content[j] in ' \t\n\r':
                        j += 1

                    if j < len(content) and content[j] in ':,}]':
                        # 这是字符串结束
                        in_string = False
                        result.append(char)
                    else:
                        # 这是字符串内部的引号，需要转义
                        result.append('\\"')
                i += 1
                continue

            # 普通字符
            result.append(char)
            i += 1

        return ''.join(result)

    def _try_parse_json(self, content: str) -> Dict[str, Any]:
        """尝试解析JSON，如果失败则尝试修复"""
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            # 尝试修复截断的JSON
            try:
                # 如果JSON被截断，尝试补全
                if content.count('{') > content.count('}'):
                    # 补全缺失的右括号
                    missing_braces = content.count('{') - content.count('}')
                    content = content + '}' * missing_braces
                if content.count('[') > content.count(']'):
                    # 补全缺失的右方括号
                    missing_brackets = content.count('[') - content.count(']')
                    content = content + ']' * missing_brackets

                # 尝试直接解析补全后的JSON
                try:
                    return json.loads(content)
                except:
                    pass

                # 移除可能的截断内容（最后一个完整字段之后的内容）
                # 查找最后一个完整的 "key": "value" 或 "key": value 模式
                last_complete_positions = [
                    pos for pos in [
                        content.rfind('",'),
                        content.rfind('"},'),
                        content.rfind('"],'),
                        content.rfind('null,'),
                        content.rfind('true,'),
                        content.rfind('false,'),
                        content.rfind('[]'),
                        content.rfind('{}')
                    ] if pos > 0
                ]

                if last_complete_positions:
                    last_complete = max(last_complete_positions)
                    # 尝试截取到最后一个完整字段
                    truncated = content[:last_complete+1]
                    # 移除末尾可能的逗号
                    if truncated.endswith(','):
                        truncated = truncated[:-1]
                    # 补全括号
                    open_braces = truncated.count('{') - truncated.count('}')
                    open_brackets = truncated.count('[') - truncated.count(']')
                    truncated = truncated + ']' * open_brackets + '}' * open_braces

                    try:
                        return json.loads(truncated)
                    except:
                        pass

                # 最后尝试：使用正则提取已完成的键值对
                import re
                # 尝试找到最后一个完整的 "key": "value" 或 "key": value
                pattern = r'"([^"]+)":\s*("(?:[^"\\]|\\.)*"|[\d.]+|true|false|null|\[[^\]]*\]|\{[^}]*\})'
                matches = list(re.finditer(pattern, content))
                if matches:
                    # 构建一个只包含完整字段的JSON
                    last_match = matches[-1]
                    truncated = content[:last_match.end()]
                    # 移除末尾可能的逗号
                    if truncated.endswith(','):
                        truncated = truncated[:-1]
                    # 补全括号
                    open_braces = truncated.count('{') - truncated.count('}')
                    open_brackets = truncated.count('[') - truncated.count(']')
                    truncated = truncated + ']' * open_brackets + '}' * open_braces

                    try:
                        return json.loads(truncated)
                    except:
                        pass

                # 终极方案：逐字段提取
                print("[WARN] JSON严重截断，尝试逐字段提取...")
                result = {}
                # 提取简单字符串字段
                str_pattern = r'"([^"]+)":\s*"([^"\\]*(?:\\.[^"\\]*)*)"'
                for match in re.finditer(str_pattern, content):
                    key, value = match.groups()
                    if key and value:
                        result[key] = value
                # 提取数字和布尔值
                simple_pattern = r'"([^"]+)":\s*(\d+(?:\.\d+)?|true|false|null)'
                for match in re.finditer(simple_pattern, content):
                    key, value = match.groups()
                    if key:
                        if value == 'true':
                            result[key] = True
                        elif value == 'false':
                            result[key] = False
                        elif value == 'null':
                            result[key] = None
                        else:
                            result[key] = float(value) if '.' in value else int(value)

                if result:
                    print(f"[INFO] 成功提取 {len(result)} 个字段")
                    return result

                raise ValueError(f"无法解析JSON响应，原始内容前200字符: {content[:200]}\n\nJSON可能被截断，请检查LLM API的max_tokens设置或网络连接。")
            except Exception as inner_e:
                raise ValueError(f"无法解析JSON响应: {str(inner_e)}\n原始内容前200字符: {content[:200]}")

    def extract_supplement_info(self, supplement_text: str) -> Dict[str, Any]:
        """
        从补充信息文本中提取结构化信息（使用与简历解析相同的字段结构）

        Args:
            supplement_text: 补充信息文本内容

        Returns:
            提取的结构化信息字典（与简历数据结构相同）
        """
        system_prompt = "你是一个信息提取助手。你需要从文本中提取信息，并以严格的JSON格式输出。不要输出任何其他内容，不要使用markdown代码块包裹，直接输出JSON对象。"
        user_message = f"""从以下补充信息文本中提取数据，输出纯JSON（无markdown包裹）。

【重要说明】
这是补充信息，用于更新现有简历。请提取文本中明确给出的信息。

【基础字段】
name, gender, birth_date(YYYY-MM-DD), id_number, political_status, marital_status, ethnicity, native_place, phone, email, current_address, education, work_years, job_intention, wechat, qq, household_registration, student_source, height, weight, health_status, specialty, emergency_contact_name, emergency_contact_phone, country, mailing_address, skills, certificates, awards, self_intro, hobbies

【数组字段】
- education_history: 教育经历数组，每项含 school, major, degree, start, end, college, study_mode, courses, gpa, ranking
- work_history: 工作经历数组，每项含 company, position, start, end, description, department
- internship_history: 实习经历数组
- project_history: 项目经历数组
- school_activities: 在校经历数组
- awards_history: 获奖情况数组
- language_skills: 外语能力数组，每项含 language, certificate, level, score
- certificates_history: 资格证书数组
- family_info: 家庭情况数组

【补充字段（常见招聘表单问题）】
- need_visa_assistance: 是否需要签证协助
- has_criminal_record: 是否有犯罪记录
- recruitment_source: 招聘信息来源
- kpmg_internship: 是否曾在毕马威实习
- 其他类似的Yes/No问题或选择题答案

【输出规则】
1. 只输出文本中明确存在的信息，不要编造
2. 是/否问题统一填"是"或"否"
3. 如果文本中没有某字段的信息，不要输出该字段
4. 输出结构与简历解析结果相同
5. 数组字段直接输出数组，不要嵌套在其他字段中

示例输出：
{{
  "phone": "13800138000",
  "education_history": [
    {{"school": "XX大学", "major": "计算机科学", "degree": "本科", "start": "2020-09", "end": "2024-06"}}
  ],
  "need_visa_assistance": "否",
  "extra_fields": {{
    "kpmg_internship": "否"
  }},
  "field_mapping": {{
    "need_visa_assistance": "是否需要签证协助",
    "kpmg_internship": "是否曾在毕马威实习"
  }}
}}

待提取文本：
{supplement_text}
"""
        try:
            content = self._call_api(system_prompt, user_message, max_tokens=8000)
            content = self._clean_json_response(content)
            result = self._try_parse_json(content)
            return result
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM返回的不是有效JSON: {str(e)}\n原始响应: {content}")
        except Exception as e:
            raise ValueError(f"LLM调用失败: {str(e)}")

    def merge_supplement_info(
        self,
        resume_data: Dict[str, Any],
        supplement_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        将补充信息合并到简历数据中（支持所有字段类型）

        Args:
            resume_data: 当前简历数据
            supplement_info: 从补充文件提取的信息

        Returns:
            合并后的简历数据
        """
        # 确保 extra_fields 和 field_mapping 存在
        if "extra_fields" not in resume_data:
            resume_data["extra_fields"] = {}
        if "field_mapping" not in resume_data:
            resume_data["field_mapping"] = {}

        # 定义标准字段列表
        standard_fields = {
            "name", "gender", "birth_date", "id_number", "political_status",
            "marital_status", "ethnicity", "native_place", "phone", "email",
            "current_address", "education", "work_years", "job_intention",
            "wechat", "qq", "household_registration", "student_source",
            "height", "weight", "health_status", "specialty",
            "emergency_contact_name", "emergency_contact_phone",
            "country", "mailing_address", "skills", "certificates",
            "awards", "self_intro", "hobbies"
        }

        # 定义数组字段列表
        array_fields = {
            "education_history", "work_history", "internship_history",
            "project_history", "school_activities", "awards_history",
            "language_skills", "computer_skills", "certificates_history",
            "family_info", "papers", "patents", "competitions", "portfolio"
        }

        # 合并补充信息
        for key, value in supplement_info.items():
            if key in ("extra_fields", "field_mapping"):
                # 这些字段特殊处理
                continue
            elif key in array_fields:
                # 数组字段：追加到现有数组
                if isinstance(value, list) and value:
                    if key not in resume_data:
                        resume_data[key] = []
                    # 追加新元素（去重）
                    for item in value:
                        if isinstance(item, dict):
                            # 检查是否已存在相同项（简单比较）
                            exists = False
                            for existing in resume_data[key]:
                                if self._is_similar_item(item, existing, key):
                                    exists = True
                                    break
                            if not exists:
                                resume_data[key].append(item)
                                print(f"[INFO] 追加数组字段: {key}")
            elif key in standard_fields:
                # 标准字段直接合并到顶层（只在新值非空且原值为空时更新）
                if value and not resume_data.get(key):
                    resume_data[key] = value
                    print(f"[INFO] 合并标准字段: {key} = {value}")
            else:
                # 非标准字段合并到 extra_fields
                if value:
                    resume_data["extra_fields"][key] = value
                    print(f"[INFO] 合并额外字段: {key} = {value}")

        # 合并 extra_fields
        if "extra_fields" in supplement_info:
            for key, value in supplement_info["extra_fields"].items():
                if value:
                    resume_data["extra_fields"][key] = value
                    print(f"[INFO] 合并额外字段(extra): {key} = {value}")

        # 合并 field_mapping
        if "field_mapping" in supplement_info:
            resume_data["field_mapping"].update(supplement_info["field_mapping"])

        return resume_data

    def _is_similar_item(self, item1: Dict, item2: Dict, field_name: str) -> bool:
        """
        判断两个数组项是否相似（用于去重）

        Args:
            item1: 第一个项
            item2: 第二个项
            field_name: 字段名

        Returns:
            是否相似
        """
        # 根据不同字段类型定义关键字段
        key_fields = {
            "education_history": ["school", "major", "degree"],
            "work_history": ["company", "position"],
            "internship_history": ["company", "position"],
            "project_history": ["name"],
            "school_activities": ["name", "role"],
            "awards_history": ["name"],
            "language_skills": ["language"],
            "certificates_history": ["name"],
            "family_info": ["name", "relation"],
        }

        fields = key_fields.get(field_name, [])
        if not fields:
            return False

        # 比较关键字段
        for field in fields:
            val1 = item1.get(field, "")
            val2 = item2.get(field, "")
            if val1 and val2 and val1 == val2:
                continue
            elif val1 != val2:
                return False

        return True

    def _post_process_mapping(
        self,
        mapping_result: List[Dict[str, Any]],
        resume_data: Dict[str, Any],
        form_structure: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        后处理映射结果，验证和修正（OPT-001新增）

        Args:
            mapping_result: LLM返回的映射结果
            resume_data: 简历数据
            form_structure: 表单结构

        Returns:
            处理后的映射结果
        """
        if not mapping_result or not form_structure:
            return mapping_result

        for item in mapping_result:
            index = item.get("index")
            value = item.get("value", "")

            if index is None or index >= len(form_structure):
                continue

            field = form_structure[index]
            field_type = field.get("type", "")
            field_name = field.get("name", "")
            field_id = field.get("id", "")
            field_label = field.get("label", "").lower()
            options = field.get("options", [])
            choices = field.get("choices", [])

            # 合并 options 和 choices
            all_options = options or choices or []

            # 0. 特殊字段名处理 - 即使 LLM 返回空值，也尝试补充
            # 合并所有可能的字段名标识
            field_identifiers = f"{field_name} {field_id} {field_label}".lower()

            # 证件类型处理
            if any(kw in field_identifiers for kw in ["idtype", "id_type", "证件类型", "idcardtype"]):
                if not value and resume_data.get("id_number"):
                    # 如果有身份证号，默认证件类型为身份证
                    if all_options:
                        for opt in all_options:
                            opt_label = opt.get("label", opt) if isinstance(opt, dict) else opt
                            if "身份证" in str(opt_label):
                                item["value"] = str(opt.get("value", opt) if isinstance(opt, dict) else opt)
                                print(f"[INFO] 证件类型自动填充: 身份证")
                                break
                    else:
                        item["value"] = "身份证"
                        print(f"[INFO] 证件类型自动填充: 身份证")

            # 证件号码处理
            # 支持多种字段名：id_number, id_card_number, idCardNo, idCardNumber, idCard 等
            elif any(kw in field_identifiers for kw in [
                "idnumber", "id_number", "idcardnumber", "id_card_number",
                "证件号", "idcardno", "idcard", "身份证号", "证件号码"
            ]):
                if not value and resume_data.get("id_number"):
                    item["value"] = resume_data.get("id_number", "")
                    print(f"[INFO] 证件号码自动填充: {resume_data.get('id_number', '')[:6]}...")

            # 系统字段处理（简历ID等，填空即可）
            elif any(kw in field_identifiers for kw in ["resume_resumeid", "resumeresumeid", "resume_id"]):
                # 这些是系统内部字段，填空即可
                if not value:
                    print(f"[INFO] 系统字段 '{field_name}' 填空")

            # 企业相关字段（个人简历无此信息）
            elif any(kw in field_identifiers for kw in ["socialcreditcode", "social_credit_code", "统一社会信用代码"]):
                print(f"[INFO] 企业字段 '{field_name}' 个人简历无此信息，填空")

            # 全日制学历处理
            elif any(kw in field_identifiers for kw in ["fulleducation", "full_education", "是否统招", "isfulltime"]):
                if not value:
                    # 检查教育经历中是否有相关信息
                    edu_history = resume_data.get("education_history", [])
                    if edu_history:
                        first_edu = edu_history[0] if edu_history else {}
                        study_mode = first_edu.get("study_mode", "")
                        if study_mode:
                            if "全日制" in study_mode or "统招" in study_mode:
                                item["value"] = "是"
                            elif "非全日制" in study_mode or "自考" in study_mode:
                                item["value"] = "否"

            # 招聘信息来源/招聘类型（简历中通常无此信息）
            elif any(kw in field_identifiers for kw in ["recruitmentsource", "recruitment_source", "招聘信息来源", "招聘来源"]):
                print(f"[INFO] 招聘来源字段 '{field_name}' 简历中通常无此信息")

            elif any(kw in field_identifiers for kw in ["recruitmenttype", "recruitment_type", "招聘类型"]):
                print(f"[INFO] 招聘类型字段 '{field_name}' 简历中通常无此信息")

            # 荣誉类型/获奖类型
            elif any(kw in field_identifiers for kw in ["awardtype", "award_type", "honortype", "honor_type", "荣誉类型", "获奖类型"]):
                if not value:
                    # 检查获奖经历
                    awards = resume_data.get("awards_history", [])
                    if awards:
                        # 获取第一个获奖的级别
                        first_award = awards[0] if awards else {}
                        level = first_award.get("level", "")
                        if level and all_options:
                            for opt in all_options:
                                opt_label = opt.get("label", opt) if isinstance(opt, dict) else opt
                                if level in str(opt_label):
                                    item["value"] = str(opt.get("value", opt) if isinstance(opt, dict) else opt)
                                    print(f"[INFO] 荣誉类型自动匹配: {level}")
                                    break

            # 其他字段
            elif field_name.lower() == "other" or "其他" in field_label:
                print(f"[INFO] 其他字段 '{field_name}' 需要特殊处理")

            # 1. 是/否类问题验证
            yes_no_keywords = ["是否", "有无", "是否接受", "能否", "可以", "是否同意", "是否需要"]
            is_yes_no_field = any(kw in field_label for kw in yes_no_keywords)

            if is_yes_no_field and value:
                # 标准化是/否值
                value_lower = str(value).lower().strip()
                if value_lower in ["是", "yes", "true", "1", "有"]:
                    item["value"] = "是"
                elif value_lower in ["否", "no", "false", "0", "无"]:
                    item["value"] = "否"
                elif value_lower and value_lower not in ["是", "否"]:
                    # 如果值既不是"是"也不是"否"，检查是否是误填
                    # 如用"本科"回答"是否实习过"，应该清空
                    if value_lower not in ["是", "否", "yes", "no", "有", "无"]:
                        print(f"[WARN] 是/否字段 '{field_label}' 填写了无效值 '{value}'，已清空")
                        item["value"] = ""

            # 2. 政治面貌同义词映射
            political_keywords = ["政治面貌", "党员身份", "政治身份", "政治情况", "党派"]
            is_political_field = any(kw in field_label for kw in political_keywords)

            if is_political_field and value and all_options:
                # 政治面貌同义词映射表（扩展版）
                # 每个类别包含多种可能的表述方式
                political_synonyms = {
                    # 党员相关 - 包含"中共"、"党员"、"共产党"等表述
                    "党员": [
                        "党员", "中共党员", "共产党员", "中国共产党党员", "中共正式党员",
                        "正式党员", "中国共产党", "中共党员(正式)", "党员(正式)",
                        "party member", "共产党员（正式）", "中国共产党正式党员"
                    ],
                    # 预备党员
                    "预备党员": [
                        "预备党员", "中共预备党员", "中国共产党预备党员", "党员(预备)",
                        "中共党员(预备)", "共产党员（预备）", "中共党员（预备）"
                    ],
                    # 团员相关 - 包含"共青团"、"团员"等表述
                    "团员": [
                        "团员", "共青团员", "中国共青团员", "中国共青团",
                        "共青团", "中国共产主义青年团团员", "共产主义青年团团员",
                        "团员(共青团)", "共青团员(学生)", "中国共产主义青年团",
                        "league member", "共青团员（学生）"
                    ],
                    # 群众相关 - 包含"群众"、"无党派"等表述
                    "群众": [
                        "群众", "普通群众", "无党派", "无党派人士", "无党派民主人士",
                        "无党派群众", "普通公民", "非党员", "一般群众", "平民",
                        "masses", "无党派人士（群众）"
                    ],
                    # 民主党派
                    "民主党派": [
                        "民主党派", "民主党派成员", "民主党", "民主党人士",
                        "民主党派人士", "民主党成员"
                    ],
                }

                # 关键词匹配表 - 用于判断选项属于哪个类别
                political_category_keywords = {
                    "党员": ["党员", "中共", "共产党", "正式党员"],
                    "预备党员": ["预备党员", "预备"],
                    "团员": ["团员", "共青团", "青年团"],
                    "群众": ["群众", "无党派"],
                    "民主党派": ["民主党派", "民主党"],
                }

                value_str = str(value).strip()
                matched = False
                matched_category = None

                # 第一步：识别值的类别
                for category, synonyms in political_synonyms.items():
                    if value_str in synonyms or value_str.lower() in [s.lower() for s in synonyms]:
                        matched_category = category
                        print(f"[INFO] 政治面貌识别类别: '{value_str}' -> 类别 '{category}'")
                        break

                # 如果直接匹配失败，尝试关键词匹配
                if not matched_category:
                    for category, keywords in political_category_keywords.items():
                        for kw in keywords:
                            if kw in value_str:
                                # 排除预备党员被误识别为党员的情况
                                if category == "党员" and "预备" in value_str:
                                    continue
                                matched_category = category
                                print(f"[INFO] 政治面貌关键词匹配: '{value_str}' -> 类别 '{category}'")
                                break
                        if matched_category:
                            break

                # 第二步：在选项中找到匹配的选项
                if matched_category:
                    category_keywords = political_category_keywords.get(matched_category, [])
                    for opt in all_options:
                        opt_value = opt.get("value", opt) if isinstance(opt, dict) else opt
                        opt_label = opt.get("label", opt) if isinstance(opt, dict) else opt
                        opt_label_str = str(opt_label).strip()

                        # 检查选项是否属于同一类别
                        for kw in category_keywords:
                            # 特殊处理：预备党员需要精确匹配
                            if matched_category == "预备党员":
                                if "预备党员" in opt_label_str:
                                    item["value"] = str(opt_value)
                                    print(f"[INFO] 政治面貌映射成功: '{value_str}' -> '{opt_label_str}'")
                                    matched = True
                                    break
                            elif matched_category == "党员":
                                # 党员选项不能包含"预备"
                                if kw in opt_label_str and "预备" not in opt_label_str:
                                    item["value"] = str(opt_value)
                                    print(f"[INFO] 政治面貌映射成功: '{value_str}' -> '{opt_label_str}'")
                                    matched = True
                                    break
                            else:
                                # 其他类别：关键词匹配即可
                                if kw in opt_label_str:
                                    item["value"] = str(opt_value)
                                    print(f"[INFO] 政治面貌映射成功: '{value_str}' -> '{opt_label_str}'")
                                    matched = True
                                    break
                        if matched:
                            break

                if not matched:
                    # 第三步：尝试直接模糊匹配（兜底方案）
                    for opt in all_options:
                        opt_value = opt.get("value", opt) if isinstance(opt, dict) else opt
                        opt_label = opt.get("label", opt) if isinstance(opt, dict) else opt
                        opt_label_str = str(opt_label).strip()
                        if value_str in opt_label_str or opt_label_str in value_str:
                            item["value"] = str(opt_value)
                            print(f"[INFO] 政治面貌模糊匹配: '{value_str}' -> '{opt_label_str}'")
                            matched = True
                            break

                if not matched:
                    print(f"[WARN] 政治面貌映射失败: '{value_str}' 未找到匹配选项")
                    print(f"[WARN] 可用选项: {[str(opt.get('label', opt) if isinstance(opt, dict) else opt) for opt in all_options]}")

            # 3. 选择题选项匹配验证
            if all_options and value and not is_political_field:
                # 尝试精确匹配
                matched = False
                for opt in all_options:
                    opt_value = opt.get("value", opt) if isinstance(opt, dict) else opt
                    opt_label = opt.get("label", opt) if isinstance(opt, dict) else opt

                    if str(value) == str(opt_value) or str(value) == str(opt_label):
                        matched = True
                        break

                if not matched:
                    # 尝试模糊匹配
                    value_str = str(value).strip()
                    for opt in all_options:
                        opt_value = opt.get("value", opt) if isinstance(opt, dict) else opt
                        opt_label = opt.get("label", opt) if isinstance(opt, dict) else opt

                        # 包含匹配（如"本科"匹配"大学本科"）
                        if value_str in str(opt_label) or str(opt_label) in value_str:
                            item["value"] = str(opt_value)
                            print(f"[INFO] 选项模糊匹配: '{value}' -> '{opt_label}'")
                            matched = True
                            break

                    if not matched and field_type in ["select", "radio"]:
                        # 选择题没有匹配到选项，清空值
                        print(f"[WARN] 选择题 '{field_label}' 的值 '{value}' 未匹配到选项，已清空")
                        item["value"] = ""

            # 3. 格式验证
            if value:
                # 手机号格式
                if "手机" in field_label or "电话" in field_label or "phone" in field_label.lower():
                    import re
                    phone_match = re.match(r'^1[3-9]\d{9}$', str(value).replace("-", "").replace(" ", ""))
                    if not phone_match:
                        print(f"[WARN] 手机号格式可能不正确: {value}")

                # 邮箱格式
                if "邮箱" in field_label or "email" in field_label.lower():
                    import re
                    email_match = re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', str(value))
                    if not email_match:
                        print(f"[WARN] 邮箱格式可能不正确: {value}")

        return mapping_result

    def verify_filling(
        self,
        form_data: List[Dict[str, Any]],
        resume_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        使用LLM校验填写结果

        Args:
            form_data: 已填写的表单数据
            resume_data: 原始简历数据

        Returns:
            问题列表
        """
        # 如果没有填写数据，直接返回空
        if not form_data:
            return []

        # 只检查有值的字段，减少LLM调用成本
        filled_fields = [f for f in form_data if f.get("value")]

        if not filled_fields:
            return []

        system_prompt = "你是一个表单校验助手。检查填写的内容是否正确，返回JSON数组格式的问题列表。"
        user_message = f"""检查以下填写内容是否正确，找出明显的问题。

已填写字段：
{json.dumps(filled_fields[:20], ensure_ascii=False, indent=2)}  # 限制字段数量

简历数据：
{json.dumps(resume_data, ensure_ascii=False, indent=2)}

【检查规则】
1. 填写内容是否与简历一致（如姓名是否匹配）
2. 是否有明显错误（如姓名填成了地址）
3. 是否有逻辑错误（如结束时间早于开始时间）

【输出格式】
返回JSON数组，每个问题包含：
- type: 问题类型（如 "inconsistent", "logic_error"）
- field: 字段名
- message: 问题描述

如果没有问题，返回空数组 []
只返回JSON数组，不要解释。"""

        try:
            content = self._call_api(system_prompt, user_message, max_tokens=1000)
            content = self._clean_json_response(content)
            result = self._try_parse_json(content)

            if isinstance(result, list):
                return result
            return []

        except Exception as e:
            print(f"[WARN] LLM校验失败: {e}")
            return []


# 创建全局实例（延迟初始化）
_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """获取LLM服务实例（单例）"""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
