"""
简历相关API路由
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from typing import List
from datetime import datetime
import os

from models import ResumeFull, MappingRequest, MappingResponse, FormMapping
from services.parser import parser
from services.llm import get_llm_service
from services.vision_service import get_vision_service
from utils.cache import cache

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    """
    上传并解析简历文件

    支持 DOCX、TXT、XLSX 格式
    """
    # 检查文件格式
    filename = file.filename or ""
    ext = filename.lower().split('.')[-1] if '.' in filename else ""

    if ext not in ['docx', 'txt', 'xlsx']:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {ext}，请上传 DOCX、TXT 或 XLSX 文件"
        )

    try:
        # 读取文件内容
        content = await file.read()

        # 计算文件哈希，检查缓存
        file_hash = cache.calculate_file_hash(content)
        cached_data = cache.load_file_cache(file_hash)

        if cached_data:
            # 使用缓存数据
            # 更新时间戳和来源文件名（可能已更改）
            cached_data["source_file"] = filename
            cached_data["updated_at"] = datetime.now().isoformat()

            # 保存为新版本
            version_id = cache.save_version(cached_data, filename)
            cache.save_current_ref(version_id)

            # 重新加载完整数据（包含 version_id）
            resume_data = cache.load_version(version_id)

            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "使用缓存数据",
                    "data": resume_data
                }
            )

        # 无缓存，执行解析
        # 解析文件
        resume_text = parser.parse_file(content, filename)

        # 调用LLM抽取信息
        llm = get_llm_service()
        resume_data = llm.extract_resume_info(resume_text)

        # 添加元数据
        resume_data["raw_text"] = resume_text
        resume_data["source_file"] = filename
        resume_data["created_at"] = datetime.now().isoformat()
        resume_data["updated_at"] = datetime.now().isoformat()

        # 保存文件缓存
        cache.save_file_cache(file_hash, resume_data)

        # 保存为版本
        version_id = cache.save_version(resume_data, filename)

        # 更新当前引用
        cache.save_current_ref(version_id)

        # 重新加载完整数据（包含 version_id）
        resume_data = cache.load_version(version_id)

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "简历解析成功",
                "data": resume_data
            }
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@router.post("/save")
async def save_resume(resume_data: dict):
    """
    保存简历数据（兼容旧API，实际更新指定版本）

    推荐使用 PUT /version/{version_id} 或 POST /version
    """
    try:
        version_id = resume_data.get("version_id")
        if not version_id:
            raise HTTPException(status_code=400, detail="缺少 version_id")

        # 更新时间戳
        resume_data["updated_at"] = datetime.now().isoformat()

        # 更新版本
        success = cache.update_version(version_id, resume_data)

        if success:
            # 更新当前引用
            cache.save_current_ref(version_id)
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "保存成功",
                    "version_id": version_id
                }
            )
        else:
            raise HTTPException(status_code=500, detail="保存失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存失败: {str(e)}")


@router.get("/load")
async def load_resume():
    """
    加载当前简历数据
    """
    try:
        resume_data = cache.load_current()

        if resume_data is None:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "暂无缓存数据",
                    "data": None
                }
            )

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "加载成功",
                "data": resume_data
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"加载失败: {str(e)}")


@router.post("/version")
async def create_new_version(resume_data: dict):
    """
    创建新版本（保存为新简历按钮）
    """
    try:
        source_file = resume_data.pop("source_file", "")

        version_id = cache.save_version(resume_data, source_file)

        if version_id:
            # 更新当前引用指向新版本
            cache.save_current_ref(version_id)
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "版本保存成功",
                    "version_id": version_id
                }
            )
        else:
            raise HTTPException(status_code=500, detail="版本保存失败")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"版本保存失败: {str(e)}")


@router.get("/versions")
async def list_versions():
    """
    获取版本历史列表
    """
    try:
        versions = cache.list_versions()

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "获取成功",
                "data": versions
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取版本列表失败: {str(e)}")


@router.get("/version/{version_id}")
async def load_version(version_id: str):
    """
    加载指定版本的简历数据
    """
    try:
        resume_data = cache.load_version(version_id)

        if resume_data is None:
            raise HTTPException(status_code=404, detail="版本不存在")

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "加载成功",
                "data": resume_data
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"加载版本失败: {str(e)}")


@router.put("/version/{version_id}")
async def update_version(version_id: str, resume_data: dict):
    """
    更新指定版本（保存按钮）
    """
    try:
        # 更新时间戳
        resume_data["updated_at"] = datetime.now().isoformat()

        success = cache.update_version(version_id, resume_data)

        if success:
            # 更新当前引用指向这个版本
            cache.save_current_ref(version_id)
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "更新成功"
                }
            )
        else:
            raise HTTPException(status_code=500, detail="更新失败")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


@router.delete("/version/{version_id}")
async def delete_version(version_id: str):
    """
    删除指定版本
    """
    try:
        success = cache.delete_version(version_id)

        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "删除成功"
                }
            )
        else:
            raise HTTPException(status_code=500, detail="删除失败")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.put("/version/{version_id}/rename")
async def rename_version(version_id: str, request: dict):
    """
    重命名指定版本（需求21）
    """
    try:
        new_name = request.get("name")
        if not new_name:
            raise HTTPException(status_code=400, detail="缺少新名称")

        # 加载版本数据
        resume_data = cache.load_version(version_id)
        if resume_data is None:
            raise HTTPException(status_code=404, detail="版本不存在")

        # 更新名称
        resume_data["display_name"] = new_name
        resume_data["updated_at"] = datetime.now().isoformat()

        # 保存更新
        success = cache.update_version(version_id, resume_data)

        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "重命名成功",
                    "display_name": new_name
                }
            )
        else:
            raise HTTPException(status_code=500, detail="重命名失败")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重命名失败: {str(e)}")


@router.post("/set-current/{version_id}")
async def set_current_version(version_id: str):
    """
    设置当前用于填写的简历版本
    """
    try:
        # 检查版本是否存在
        resume_data = cache.load_version(version_id)
        if resume_data is None:
            raise HTTPException(status_code=404, detail="版本不存在")

        # 更新当前引用
        cache.save_current_ref(version_id)

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "设置成功"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"设置失败: {str(e)}")


@router.delete("/current")
async def delete_current():
    """
    删除当前简历数据
    """
    try:
        success = cache.delete_current()

        if success:
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "message": "删除成功"
                }
            )
        else:
            raise HTTPException(status_code=500, detail="删除失败")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


# 表单映射路由
@router.post("/mapping")
async def map_fields(request: MappingRequest):
    """
    将简历数据映射到表单字段
    """
    try:
        llm = get_llm_service()
        mappings = llm.map_fields(request.resume_data, request.form_structure)

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "映射成功",
                "data": mappings
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"映射失败: {str(e)}")


# 问题26：单字段映射路由（逐元素映射填写）
@router.post("/mapping-single")
async def map_single_field(request: dict):
    """
    映射单个表单字段（逐元素映射填写）

    Args:
        resume_data: 简历数据
        field_info: 单个字段信息

    Returns:
        单个字段的映射结果
    """
    try:
        resume_data = request.get("resume_data")
        field_info = request.get("field_info")

        if not resume_data or not field_info:
            raise HTTPException(status_code=400, detail="缺少 resume_data 或 field_info")

        llm = get_llm_service()
        result = llm.map_single_field(resume_data, field_info)

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "映射成功",
                "data": result
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"映射失败: {str(e)}")


# OPT-003: 填写结果校验路由
@router.post("/verify")
async def verify_filling(request: dict):
    """
    校验填写结果

    检查内容：
    1. 必填字段是否遗漏
    2. 格式是否正确（手机、邮箱、日期等）
    3. 内容是否与简历一致
    4. 是否有明显错误
    """
    try:
        form_data = request.get("form_data", [])
        resume_data = request.get("resume_data", {})

        issues = []

        # 1. 检查必填字段是否遗漏
        required_fields = []
        for field in form_data:
            if field.get("required") and not field.get("value"):
                required_fields.append({
                    "type": "missing_required",
                    "field": field.get("label") or field.get("name"),
                    "message": f"必填字段「{field.get('label') or field.get('name')}」未填写"
                })
        issues.extend(required_fields)

        # 2. 格式检查
        import re
        for field in form_data:
            value = field.get("value", "")
            label = field.get("label", "").lower()

            if not value:
                continue

            # 手机号格式检查
            if "手机" in label or "phone" in label or "电话" in label:
                if not re.match(r'^1[3-9]\d{9}$', value.replace("-", "").replace(" ", "")):
                    issues.append({
                        "type": "format_error",
                        "severity": "warning",
                        "field": field.get("label"),
                        "message": f"手机号格式不正确: {value}"
                    })

            # 邮箱格式检查
            if "邮箱" in label or "email" in label or "邮件" in label:
                if not re.match(r'^[\w.-]+@[\w.-]+\.\w+$', value):
                    issues.append({
                        "type": "format_error",
                        "severity": "warning",
                        "field": field.get("label"),
                        "message": f"邮箱格式不正确: {value}"
                    })

            # 身份证格式检查
            if "身份证" in label or "证件" in label:
                if not re.match(r'^\d{15}|\d{17}[\dXx]$', value.replace(" ", "")):
                    issues.append({
                        "type": "format_error",
                        "severity": "warning",
                        "field": field.get("label"),
                        "message": f"身份证号格式不正确: {value}"
                    })

            # OPT-003: 日期格式检查
            if any(kw in label for kw in ["日期", "时间", "date", "出生", "入职", "毕业"]):
                # 检查是否是有效的日期格式
                date_patterns = [
                    r'^\d{4}-\d{2}-\d{2}$',      # YYYY-MM-DD
                    r'^\d{4}-\d{2}$',            # YYYY-MM
                    r'^\d{4}\.\d{2}\.\d{2}$',    # YYYY.MM.DD
                    r'^\d{4}/\d{2}/\d{2}$',      # YYYY/MM/DD
                    r'^\d{4}年\d{1,2}月\d{1,2}日?$',  # YYYY年MM月DD日
                    r'^\d{4}年\d{1,2}月$',       # YYYY年MM月
                    r'^至今$',                    # 至今
                ]
                if not any(re.match(p, value.strip()) for p in date_patterns):
                    issues.append({
                        "type": "format_error",
                        "severity": "info",
                        "field": field.get("label"),
                        "message": f"日期格式可能不标准: {value}，建议使用 YYYY-MM-DD 格式"
                    })

            # OPT-003: 年龄/年限格式检查
            if any(kw in label for kw in ["年龄", "年限", "经验", "age", "years"]):
                if not re.match(r'^\d+(\.\d+)?$', str(value).replace("年", "").replace("岁", "").strip()):
                    issues.append({
                        "type": "format_error",
                        "severity": "info",
                        "field": field.get("label"),
                        "message": f"数值格式可能不正确: {value}"
                    })

        # OPT-003: 内容一致性检查
        resume_name = resume_data.get("name", "")
        resume_phone = resume_data.get("phone", "")
        resume_email = resume_data.get("email", "")

        for field in form_data:
            value = str(field.get("value", "")).strip()
            label = field.get("label", "").lower()

            if not value:
                continue

            # 检查姓名是否一致
            if "姓名" in label and resume_name:
                if value != resume_name and resume_name not in value and value not in resume_name:
                    issues.append({
                        "type": "inconsistent",
                        "severity": "error",
                        "field": field.get("label"),
                        "message": f"姓名与简历不一致: 填写「{value}」，简历「{resume_name}」"
                    })

            # 检查手机是否一致
            if ("手机" in label or "phone" in label) and resume_phone:
                clean_value = value.replace("-", "").replace(" ", "")
                clean_resume = resume_phone.replace("-", "").replace(" ", "")
                if clean_value != clean_resume:
                    issues.append({
                        "type": "inconsistent",
                        "severity": "error",
                        "field": field.get("label"),
                        "message": f"手机号与简历不一致: 填写「{value}」，简历「{resume_phone}」"
                    })

            # 检查邮箱是否一致
            if ("邮箱" in label or "email" in label) and resume_email:
                if value.lower() != resume_email.lower():
                    issues.append({
                        "type": "inconsistent",
                        "severity": "error",
                        "field": field.get("label"),
                        "message": f"邮箱与简历不一致: 填写「{value}」，简历「{resume_email}」"
                    })

        # OPT-003: 逻辑错误检查（姓名字段填了地址等）
        address_keywords = ["省", "市", "区", "县", "镇", "村", "路", "街", "号", "栋", "单元"]
        for field in form_data:
            value = str(field.get("value", "")).strip()
            label = field.get("label", "").lower()

            if not value:
                continue

            # 检查姓名字段是否填了地址
            if "姓名" in label and len(value) > 4:
                if any(kw in value for kw in address_keywords):
                    issues.append({
                        "type": "logic_error",
                        "severity": "error",
                        "field": field.get("label"),
                        "message": f"姓名字段可能填写了地址: {value}"
                    })

            # 检查地址字段是否填了姓名（长度太短且不含地址关键词）
            if any(kw in label for kw in ["地址", "住址", "地址"]):
                if len(value) < 6 and not any(kw in value for kw in address_keywords):
                    issues.append({
                        "type": "logic_error",
                        "severity": "warning",
                        "field": field.get("label"),
                        "message": f"地址字段可能填写不完整: {value}"
                    })

        # 3. 使用 LLM 进行智能校验（可选）
        llm = get_llm_service()
        llm_issues = llm.verify_filling(form_data, resume_data)
        issues.extend(llm_issues)

        # OPT-003: 统计问题严重级别
        error_count = len([i for i in issues if i.get("severity") == "error"])
        warning_count = len([i for i in issues if i.get("severity") == "warning"])
        info_count = len([i for i in issues if i.get("severity") == "info"])

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "校验完成",
                "data": {
                    "issues": issues,
                    "issue_count": len(issues),
                    "has_issues": len(issues) > 0,
                    "error_count": error_count,
                    "warning_count": warning_count,
                    "info_count": info_count,
                    "summary": {
                        "total_fields": len(form_data),
                        "filled_fields": len([f for f in form_data if f.get("value")]),
                        "missing_required": len([i for i in issues if i.get("type") == "missing_required"]),
                        "format_errors": len([i for i in issues if i.get("type") == "format_error"]),
                        "inconsistent": len([i for i in issues if i.get("type") == "inconsistent"]),
                        "logic_errors": len([i for i in issues if i.get("type") == "logic_error"])
                    }
                }
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"校验失败: {str(e)}")


@router.post("/supplement")
async def upload_supplement(file: UploadFile = File(...)):
    """
    上传补充信息文件并整合到当前简历

    支持 DOCX、TXT、XLSX 格式
    用于补充简历中没有的信息，如：
    - 是否需要签证协助
    - 是否有犯罪记录
    - 招聘信息来源
    - 是否曾在该公司实习等
    """
    # 检查文件格式
    filename = file.filename or ""
    ext = filename.lower().split('.')[-1] if '.' in filename else ""

    if ext not in ['docx', 'txt', 'xlsx']:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式: {ext}，请上传 DOCX、TXT 或 XLSX 文件"
        )

    try:
        # 读取文件内容
        content = await file.read()

        # 解析文件
        supplement_text = parser.parse_file(content, filename)

        # 调用LLM提取补充信息
        llm = get_llm_service()
        supplement_info = llm.extract_supplement_info(supplement_text)

        # 加载当前简历
        current_resume = cache.load_current()
        if current_resume is None:
            raise HTTPException(
                status_code=400,
                detail="请先上传简历，再上传补充信息"
            )

        # 合并补充信息
        merged_resume = llm.merge_supplement_info(current_resume, supplement_info)

        # 更新时间戳
        merged_resume["updated_at"] = datetime.now().isoformat()

        # 保存更新
        version_id = merged_resume.get("version_id")
        if version_id:
            cache.update_version(version_id, merged_resume)
        else:
            # 如果没有 version_id，保存为新版本
            version_id = cache.save_version(merged_resume, filename)
            cache.save_current_ref(version_id)

        # 重新加载完整数据
        resume_data = cache.load_version(version_id)

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "补充信息已整合",
                "data": resume_data,
                "extracted_fields": list(supplement_info.keys()) if supplement_info else []
            }
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


@router.post("/supplement-text")
async def supplement_from_text(request: dict):
    """
    从文本补充信息并整合到当前简历（需求22）

    用于补充简历中没有的信息，如：
    - 是否需要签证协助
    - 是否有犯罪记录
    - 招聘信息来源
    - 是否曾在该公司实习等
    """
    supplement_text = request.get("text", "")
    if not supplement_text.strip():
        raise HTTPException(status_code=400, detail="补充信息不能为空")

    try:
        # 调用LLM提取补充信息
        llm = get_llm_service()
        supplement_info = llm.extract_supplement_info(supplement_text)

        # 加载当前简历
        current_resume = cache.load_current()
        if current_resume is None:
            raise HTTPException(
                status_code=400,
                detail="请先上传简历，再补充信息"
            )

        # 合并补充信息
        merged_resume = llm.merge_supplement_info(current_resume, supplement_info)

        # 更新时间戳
        merged_resume["updated_at"] = datetime.now().isoformat()

        # 保存更新
        version_id = merged_resume.get("version_id")
        if version_id:
            cache.update_version(version_id, merged_resume)
        else:
            # 如果没有 version_id，保存为新版本
            version_id = cache.save_version(merged_resume, "supplement")
            cache.save_current_ref(version_id)

        # 重新加载完整数据
        resume_data = cache.load_version(version_id)

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "补充信息已整合",
                "data": resume_data,
                "extracted_fields": list(supplement_info.keys()) if supplement_info else []
            }
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理失败: {str(e)}")


# 视觉分析路由
@router.post("/vision/analyze")
async def analyze_screenshot(request: dict):
    """
    使用视觉模型分析截图

    用于调试填写问题，分析表单状态、下拉框等
    """
    try:
        image_path = request.get("image_path")
        prompt = request.get("prompt", "请详细描述这张图片的内容，特别是表单填写的情况。")

        if not image_path:
            raise HTTPException(status_code=400, detail="缺少 image_path 参数")

        # 检查文件是否存在
        if not os.path.exists(image_path):
            raise HTTPException(status_code=400, detail=f"图片文件不存在: {image_path}")

        # 调用视觉服务
        vision = get_vision_service()
        result = vision.analyze_image(image_path, prompt)

        if result.startswith("错误:"):
            return JSONResponse(
                status_code=200,
                content={
                    "success": False,
                    "message": result,
                    "data": None
                }
            )

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": "分析成功",
                "data": {
                    "analysis": result
                }
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")


@router.post("/vision/check")
async def check_vision_model():
    """
    检查视觉模型是否可用
    """
    try:
        vision = get_vision_service()
        available, status = vision.check_model_availability()

        return JSONResponse(
            status_code=200,
            content={
                "success": True,
                "message": status,
                "data": {
                    "available": available,
                    "config": {
                        "model": vision.model,
                        "base_url": vision.base_url
                    }
                }
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检查失败: {str(e)}")


# ================== 填写报告相关 ==================

# 内存中保存最新的报告（供读取）
_latest_report = None


@router.post("/report")
async def submit_report(report: dict):
    """
    接收填写报告

    报告格式:
    {
        "total": 50,
        "ok": 45,
        "issues": [
            {"field": "政治面貌", "type": "ant-select", "stage": "填写失败", "reason": "无匹配选项"}
        ]
    }
    """
    global _latest_report
    _latest_report = {
        "received_at": datetime.now().isoformat(),
        "data": report
    }

    print(f"\n{'='*60}")
    print("📋 收到填写报告")
    print(f"{'='*60}")
    print(f"总计: {report.get('total', 0)} 个字段")
    print(f"成功: {report.get('ok', 0)} 个")

    issues = report.get('issues', [])
    if issues:
        print(f"问题: {len(issues)} 个")
        for issue in issues:
            print(f"  - [{issue.get('stage')}] {issue.get('field')} ({issue.get('type')}): {issue.get('reason')}")
    else:
        print("问题: 无")
    print(f"{'='*60}\n")

    return JSONResponse(
        status_code=200,
        content={"success": True, "message": "报告已接收", "issues_count": len(issues)}
    )


@router.get("/report")
async def get_latest_report():
    """
    获取最新的填写报告
    """
    global _latest_report
    if _latest_report is None:
        return JSONResponse(
            status_code=200,
            content={"success": False, "message": "暂无报告"}
        )

    return JSONResponse(
        status_code=200,
        content={"success": True, "data": _latest_report}
    )


# Force reload trigger - 2026-04-02
