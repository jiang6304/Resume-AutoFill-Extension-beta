"""
简历数据模型
定义简历信息的Pydantic模型
"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import date


class Education(BaseModel):
    """教育经历模型"""
    school: str = Field(default="", description="学校名称")
    major: str = Field(default="", description="专业")
    degree: str = Field(default="", description="学历")
    start: str = Field(default="", description="开始时间")
    end: str = Field(default="", description="结束时间")
    college: str = Field(default="", description="学院/院系")
    study_mode: str = Field(default="", description="学习形式")
    courses: str = Field(default="", description="专业课程")
    gpa: str = Field(default="", description="成绩/GPA")
    ranking: str = Field(default="", description="专业排名")
    is_overseas: str = Field(default="", description="是否海外经历")
    minor_major: str = Field(default="", description="辅修/双学位专业")
    supervisor: str = Field(default="", description="导师姓名")


class WorkExperience(BaseModel):
    """工作经历模型"""
    company: str = Field(default="", description="公司名称")
    position: str = Field(default="", description="职位")
    start: str = Field(default="", description="开始时间")
    end: str = Field(default="", description="结束时间")
    description: str = Field(default="", description="工作内容描述")
    work_type: str = Field(default="", description="工作类型")
    department: str = Field(default="", description="部门")
    salary: str = Field(default="", description="薪资")
    achievements: str = Field(default="", description="工作成果")
    referee_name: str = Field(default="", description="证明人姓名")
    referee_position: str = Field(default="", description="证明人职位")
    referee_contact: str = Field(default="", description="证明人联系方式")
    leaving_reason: str = Field(default="", description="离职原因")
    subordinates: str = Field(default="", description="下属人数")


class Internship(BaseModel):
    """实习经历模型"""
    company: str = Field(default="", description="公司名称")
    position: str = Field(default="", description="职位")
    start: str = Field(default="", description="开始时间")
    end: str = Field(default="", description="结束时间")
    description: str = Field(default="", description="实习内容描述")


class SchoolActivity(BaseModel):
    """在校经历模型（社团、学生会等）"""
    name: str = Field(default="", description="社团/组织名称")
    role: str = Field(default="", description="担任职务")
    start: str = Field(default="", description="开始时间")
    end: str = Field(default="", description="结束时间")
    description: str = Field(default="", description="活动内容描述")
    activity_type: str = Field(default="", description="经历类型")


class Award(BaseModel):
    """获奖情况模型"""
    name: str = Field(default="", description="奖励名称")
    level: str = Field(default="", description="奖励等级")
    time: str = Field(default="", description="获奖时间")
    description: str = Field(default="", description="奖励描述")


class LanguageSkill(BaseModel):
    """外语能力模型"""
    language: str = Field(default="", description="语种")
    certificate: str = Field(default="", description="证书名称")
    level: str = Field(default="", description="水平")
    score: str = Field(default="", description="成绩")
    listening: str = Field(default="", description="听说能力")
    reading: str = Field(default="", description="读写能力")


class ComputerSkill(BaseModel):
    """计算机技能模型"""
    skill_type: str = Field(default="", description="技能类型")
    level: str = Field(default="", description="掌握程度")


class Certificate(BaseModel):
    """资格证书模型"""
    name: str = Field(default="", description="证书名称")
    time: str = Field(default="", description="获得时间")
    number: str = Field(default="", description="证书编号")
    description: str = Field(default="", description="证书说明")


class FamilyMember(BaseModel):
    """家庭成员模型"""
    name: str = Field(default="", description="姓名")
    relation: str = Field(default="", description="关系")
    phone: str = Field(default="", description="电话")
    company: str = Field(default="", description="公司")
    position: str = Field(default="", description="职位")
    political_status: str = Field(default="", description="政治面貌")


class Paper(BaseModel):
    """论文期刊模型"""
    title: str = Field(default="", description="论文名称")
    journal: str = Field(default="", description="刊物名称")
    level: str = Field(default="", description="刊物层级")
    time: str = Field(default="", description="发表时间")
    authors: str = Field(default="", description="作者")
    impact_factor: str = Field(default="", description="影响因子")
    link: str = Field(default="", description="论文链接")


class Patent(BaseModel):
    """专利模型"""
    name: str = Field(default="", description="专利名称")
    number: str = Field(default="", description="专利编号")
    type: str = Field(default="", description="专利类型")
    time: str = Field(default="", description="发表时间")
    description: str = Field(default="", description="专利成果")


class Competition(BaseModel):
    """竞赛模型"""
    name: str = Field(default="", description="竞赛名称")
    time: str = Field(default="", description="参与时间")
    description: str = Field(default="", description="详情内容")


class Portfolio(BaseModel):
    """作品集模型"""
    name: str = Field(default="", description="作品名称")
    link: str = Field(default="", description="作品链接")
    description: str = Field(default="", description="描述")


class Project(BaseModel):
    """项目经历模型"""
    name: str = Field(default="", description="项目名称")
    role: str = Field(default="", description="角色")
    start: str = Field(default="", description="开始时间")
    end: str = Field(default="", description="结束时间")
    description: str = Field(default="", description="项目描述")


class ResumeBase(BaseModel):
    """简历基础模型 - 统一命名字段"""
    # 基本信息
    name: str = Field(default="", description="姓名")
    gender: str = Field(default="", description="性别")
    birth_date: str = Field(default="", description="出生日期")
    id_number: str = Field(default="", description="身份证号")
    political_status: str = Field(default="", description="政治面貌")
    marital_status: str = Field(default="", description="婚姻状况")
    ethnicity: str = Field(default="", description="民族")
    native_place: str = Field(default="", description="籍贯")

    # 联系方式
    phone: str = Field(default="", description="手机号")
    email: str = Field(default="", description="邮箱")
    current_address: str = Field(default="", description="现居地址")
    wechat: str = Field(default="", description="微信号")
    qq: str = Field(default="", description="QQ")

    # 个人信息扩展
    household_registration: str = Field(default="", description="户籍")
    student_source: str = Field(default="", description="生源地")
    height: str = Field(default="", description="身高")
    weight: str = Field(default="", description="体重")
    health_status: str = Field(default="", description="健康状况")
    specialty: str = Field(default="", description="特长")

    # 紧急联系人
    emergency_contact_name: str = Field(default="", description="紧急联系人姓名")
    emergency_contact_phone: str = Field(default="", description="紧急联系人电话")

    # 其他基本信息
    country: str = Field(default="", description="国家/地区")
    mailing_address: str = Field(default="", description="通信地址")

    # 求职信息
    education: str = Field(default="", description="学历")
    work_years: str = Field(default="", description="工作年限")
    job_intention: str = Field(default="", description="求职意向")


class ResumeFull(ResumeBase):
    """完整简历模型 - 包含多条目"""
    # 教育经历
    education_history: List[Education] = Field(default_factory=list, description="教育经历列表")

    # 工作经历
    work_history: List[WorkExperience] = Field(default_factory=list, description="工作经历列表")

    # 实习经历
    internship_history: List[Internship] = Field(default_factory=list, description="实习经历列表")

    # 项目经历
    project_history: List[Project] = Field(default_factory=list, description="项目经历列表")

    # 在校经历（社团、学生会等）
    school_activities: List[SchoolActivity] = Field(default_factory=list, description="在校经历列表")

    # 获奖情况
    awards_history: List[Award] = Field(default_factory=list, description="获奖情况列表")

    # 外语能力
    language_skills: List[LanguageSkill] = Field(default_factory=list, description="外语能力列表")

    # 计算机技能
    computer_skills: List[ComputerSkill] = Field(default_factory=list, description="计算机技能列表")

    # 资格证书
    certificates_history: List[Certificate] = Field(default_factory=list, description="资格证书列表")

    # 家庭情况
    family_info: List[FamilyMember] = Field(default_factory=list, description="家庭情况列表")

    # 论文期刊
    papers: List[Paper] = Field(default_factory=list, description="论文期刊列表")

    # 专利
    patents: List[Patent] = Field(default_factory=list, description="专利列表")

    # 竞赛
    competitions: List[Competition] = Field(default_factory=list, description="竞赛列表")

    # 作品集
    portfolio: List[Portfolio] = Field(default_factory=list, description="作品集列表")

    # 其他信息
    skills: str = Field(default="", description="专业技能")
    certificates: str = Field(default="", description="证书")
    awards: str = Field(default="", description="奖项")
    self_intro: str = Field(default="", description="自我介绍")
    hobbies: str = Field(default="", description="兴趣爱好")

    # 额外字段（LLM自动识别的字段）
    extra_fields: dict = Field(default_factory=dict, description="额外字段，LLM自动识别的信息")
    # 例如: {"english_level": "CET-6", "height": "175cm", "driver_license": "C1"}

    # 字段映射表（记录自定义字段的中英文对应关系）
    field_mapping: dict = Field(default_factory=dict, description="字段映射表，记录自定义字段的中英文对应")
    # 例如: {"english_level": "英语水平", "height": "身高", "driver_license": "驾驶证"}

    # 元数据
    raw_text: str = Field(default="", description="原始简历文本")
    source_file: str = Field(default="", description="来源文件名")
    created_at: str = Field(default="", description="创建时间")
    updated_at: str = Field(default="", description="更新时间")


class ResumeVersion(BaseModel):
    """简历版本模型"""
    version_id: str = Field(..., description="版本ID")
    created_at: str = Field(..., description="创建时间")
    source_file: str = Field(default="", description="来源文件名")
    summary: str = Field(default="", description="摘要")


class FormField(BaseModel):
    """表单字段模型"""
    type: str = Field(..., description="字段类型: text, select, textarea, radio, checkbox")
    tag_name: str = Field(..., description="标签名: INPUT, SELECT, TEXTAREA")
    name: str = Field(default="", description="name属性")
    id: str = Field(default="", description="id属性")
    label: str = Field(default="", description="标签文本")
    placeholder: str = Field(default="", description="占位文本")
    value: str = Field(default="", description="当前值")
    options: Optional[List[dict]] = Field(default=None, description="选项列表(select/radio/checkbox)")
    checked: Optional[bool] = Field(default=None, description="是否选中(radio/checkbox)")


class FormMapping(BaseModel):
    """字段映射结果模型"""
    field_index: int = Field(..., description="表单字段索引")
    field_name: str = Field(..., description="字段名")
    value: str = Field(..., description="填入的值")
    confidence: float = Field(default=1.0, description="匹配置信度")


class MappingRequest(BaseModel):
    """字段映射请求模型"""
    resume_data: dict = Field(..., description="简历数据")
    form_structure: List[dict] = Field(..., description="表单结构")


class MappingResponse(BaseModel):
    """字段映射响应模型"""
    mappings: List[FormMapping] = Field(..., description="映射结果列表")
