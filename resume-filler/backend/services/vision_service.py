"""
视觉分析服务 - 使用 Kimi-K2.5 视觉模型分析截图
已重构为使用 MultiModelService
"""
import os
from typing import Optional, Tuple
from dotenv import load_dotenv

# 导入多模型服务
from services.multi_model_service import get_multi_model_service

load_dotenv()


class VisionService:
    """视觉分析服务 - 封装多模型服务的视觉功能"""

    def __init__(self):
        """初始化视觉服务"""
        self.multi_model = get_multi_model_service()
        self.api_key = os.getenv("VISION_API_KEY")
        self.base_url = os.getenv("VISION_BASE_URL")
        self.model = os.getenv("VISION_MODEL")

    def analyze_image(self, image_path: str, prompt: str) -> str:
        """
        分析图片

        Args:
            image_path: 图片路径
            prompt: 分析提示

        Returns:
            分析结果（成功返回内容，失败返回错误信息）
        """
        success, result = self.multi_model.call_vision_model(image_path, prompt)

        if success:
            return result
        else:
            return f"错误: {result}"

    def analyze_screenshot(
        self,
        image_path: str,
        analysis_type: str = "general"
    ) -> Tuple[bool, str]:
        """
        分析截图（专门用于调试填写问题）

        Args:
            image_path: 截图路径
            analysis_type: 分析类型 (general, form, dropdown)

        Returns:
            (成功标志, 分析结果)
        """
        return self.multi_model.analyze_screenshot(image_path, analysis_type)

    def analyze_image_with_retry(
        self,
        image_path: str,
        prompt: str,
        max_retries: int = 3
    ) -> str:
        """
        分析图片（带重试）

        Args:
            image_path: 图片路径
            prompt: 分析提示
            max_retries: 最大重试次数

        Returns:
            分析结果
        """
        # 多模型服务已经内置重试，这里只是额外封装
        success, result = self.multi_model.call_vision_model(image_path, prompt)

        if success:
            return result
        else:
            return f"错误: {result}"

    def check_model_availability(self) -> Tuple[bool, str]:
        """
        检查视觉模型是否可用

        Returns:
            (可用标志, 状态消息)
        """
        if not self.api_key:
            return False, "VISION_API_KEY 未配置"
        if not self.base_url:
            return False, "VISION_BASE_URL 未配置"
        if not self.model:
            return False, "VISION_MODEL 未配置"

        return True, f"视觉模型配置: {self.model} @ {self.base_url}"


# 全局实例
_vision_service: Optional[VisionService] = None


def get_vision_service() -> VisionService:
    """获取视觉服务实例（单例）"""
    global _vision_service
    if _vision_service is None:
        _vision_service = VisionService()
    return _vision_service


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("用法:")
        print("  python vision_service.py <图片路径> [提示]")
        print("  python vision_service.py analyze <图片路径> [分析类型]")
        print()
        print("分析类型:")
        print("  general  - 通用分析")
        print("  form     - 表单分析")
        print("  dropdown - 下拉框分析")
        sys.exit(1)

    service = get_vision_service()

    # 检查模型配置
    available, status = service.check_model_availability()
    print(f"模型状态: {status}\n")

    if not available:
        print("错误: 视觉模型配置不完整")
        sys.exit(1)

    if sys.argv[1] == "analyze" and len(sys.argv) >= 3:
        # 分析截图模式
        image_path = sys.argv[2]
        analysis_type = sys.argv[3] if len(sys.argv) > 3 else "general"

        print(f"分析截图: {image_path}")
        print(f"分析类型: {analysis_type}\n")

        success, result = service.analyze_screenshot(image_path, analysis_type)
        print(f"成功: {success}")
        print(f"结果:\n{result}")
    else:
        # 常规图片分析模式
        image_path = sys.argv[1]
        prompt = sys.argv[2] if len(sys.argv) > 2 else "请详细描述这张图片的内容，特别是表单填写的情况。"

        print(f"图片路径: {image_path}")
        print(f"分析提示: {prompt}\n")

        result = service.analyze_image(image_path, prompt)
        print(f"结果:\n{result}")
