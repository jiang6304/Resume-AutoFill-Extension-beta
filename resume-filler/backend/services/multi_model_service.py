"""
多模型服务 - 统一管理文本模型和视觉模型
支持自动重试、降级策略、图片压缩
"""
import os
import base64
import httpx
import time
from typing import Optional, Dict, Any, List, Tuple
from dotenv import load_dotenv

load_dotenv()


class MultiModelService:
    """多模型服务 - 统一管理 GLM-5 文本模型和 Kimi-K2.5 视觉模型"""

    def __init__(self):
        """初始化多模型服务"""
        # 文本模型配置
        self.text_api_key = os.getenv("LLM_API_KEY")
        self.text_base_url = os.getenv("LLM_BASE_URL", "http://47.237.140.34:3000")
        self.text_model = os.getenv("LLM_MODEL", "GLM-5")

        # 视觉模型配置
        self.vision_api_key = os.getenv("VISION_API_KEY")
        self.vision_base_url = os.getenv("VISION_BASE_URL", "http://47.237.140.34:3000")
        self.vision_model = os.getenv("VISION_MODEL", "Kimi-K2.5")

        # 限流配置
        self.last_request_time = 0
        self.min_request_interval = 2.0

        # 重试配置
        self.max_retries = 3
        self.retry_delay = 5.0

        # 图片大小限制（字节）
        self.max_image_size = 2 * 1024 * 1024  # 2MB

        # 验证配置
        self._validate_config()

    def _validate_config(self):
        """验证配置是否完整"""
        errors = []

        if not self.text_api_key:
            errors.append("LLM_API_KEY 未设置")
        if not self.vision_api_key:
            errors.append("VISION_API_KEY 未设置")

        if errors:
            print(f"[WARN] 配置警告: {', '.join(errors)}")

    def _wait_for_rate_limit(self):
        """等待限流"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)
        self.last_request_time = time.time()

    def _compress_image(self, image_data: bytes, max_size: int = None) -> bytes:
        """
        压缩图片大小

        Args:
            image_data: 原始图片数据
            max_size: 最大尺寸（字节），默认使用 self.max_image_size

        Returns:
            压缩后的图片数据
        """
        if max_size is None:
            max_size = self.max_image_size

        # 如果图片已经足够小，直接返回
        if len(image_data) <= max_size:
            return image_data

        # 尝试使用 PIL 压缩
        try:
            from PIL import Image
            import io

            # 打开图片
            img = Image.open(io.BytesIO(image_data))

            # 计算缩放比例
            current_size = len(image_data)
            scale = (max_size / current_size) ** 0.5

            # 缩放图片
            new_width = int(img.width * scale)
            new_height = int(img.height * scale)

            # 确保最小尺寸
            new_width = max(new_width, 100)
            new_height = max(new_height, 100)

            img = img.resize((new_width, new_height), Image.LANCZOS)

            # 保存为 JPEG（更小的文件大小）
            output = io.BytesIO()
            # 转换为 RGB 模式（如果需要）
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            # 逐步降低质量直到满足大小限制
            quality = 85
            while quality >= 50:
                output.seek(0)
                output.truncate()
                img.save(output, format='JPEG', quality=quality)
                if len(output.getvalue()) <= max_size:
                    break
                quality -= 5

            return output.getvalue()

        except ImportError:
            print("[WARN] PIL 未安装，无法压缩图片")
            return image_data
        except Exception as e:
            print(f"[WARN] 图片压缩失败: {e}")
            return image_data

    def call_text_model(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: int = 4000
    ) -> Tuple[bool, str]:
        """
        调用文本模型（GLM-5）

        Args:
            system_prompt: 系统提示
            user_message: 用户消息
            max_tokens: 最大 token 数

        Returns:
            (成功标志, 响应内容或错误消息)
        """
        return self._call_api(
            base_url=self.text_base_url,
            api_key=self.text_api_key,
            model=self.text_model,
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=max_tokens
        )

    def call_vision_model(
        self,
        image_path: str,
        prompt: str,
        max_tokens: int = 4000
    ) -> Tuple[bool, str]:
        """
        调用视觉模型（Kimi-K2.5）

        Args:
            image_path: 图片路径
            prompt: 分析提示
            max_tokens: 最大 token 数

        Returns:
            (成功标志, 响应内容或错误消息)
        """
        try:
            # 读取图片
            with open(image_path, 'rb') as f:
                image_data = f.read()

            # 压缩图片
            image_data = self._compress_image(image_data)

            # 获取图片类型
            ext = image_path.lower().split('.')[-1]
            media_type = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp'
            }.get(ext, 'image/jpeg')

            # 编码为 base64
            base64_image = base64.b64encode(image_data).decode('utf-8')

            # 构建消息
            user_message = [
                {
                    'type': 'image',
                    'source': {
                        'type': 'base64',
                        'media_type': media_type,
                        'data': base64_image
                    }
                },
                {
                    'type': 'text',
                    'text': prompt
                }
            ]

            return self._call_api(
                base_url=self.vision_base_url,
                api_key=self.vision_api_key,
                model=self.vision_model,
                system_prompt="你是一个专业的图片分析助手，能够准确识别图片中的文字和表单元素。",
                user_message=user_message,
                max_tokens=max_tokens,
                is_vision=True
            )

        except FileNotFoundError:
            return False, f"图片文件不存在: {image_path}"
        except Exception as e:
            return False, f"处理图片失败: {str(e)}"

    def call_vision_model_with_base64(
        self,
        base64_image: str,
        media_type: str,
        prompt: str,
        max_tokens: int = 4000
    ) -> Tuple[bool, str]:
        """
        调用视觉模型（使用 base64 图片）

        Args:
            base64_image: base64 编码的图片
            media_type: 图片类型 (image/png, image/jpeg 等)
            prompt: 分析提示
            max_tokens: 最大 token 数

        Returns:
            (成功标志, 响应内容或错误消息)
        """
        user_message = [
            {
                'type': 'image',
                'source': {
                    'type': 'base64',
                    'media_type': media_type,
                    'data': base64_image
                }
            },
            {
                'type': 'text',
                'text': prompt
            }
        ]

        return self._call_api(
            base_url=self.vision_base_url,
            api_key=self.vision_api_key,
            model=self.vision_model,
            system_prompt="你是一个专业的图片分析助手，能够准确识别图片中的文字和表单元素。",
            user_message=user_message,
            max_tokens=max_tokens,
            is_vision=True
        )

    def _call_api(
        self,
        base_url: str,
        api_key: str,
        model: str,
        system_prompt: str,
        user_message,
        max_tokens: int,
        is_vision: bool = False
    ) -> Tuple[bool, str]:
        """
        调用 API（带重试和限流）

        Args:
            base_url: API 基础 URL
            api_key: API Key
            model: 模型名称
            system_prompt: 系统提示
            user_message: 用户消息（字符串或消息数组）
            max_tokens: 最大 token 数
            is_vision: 是否是视觉模型

        Returns:
            (成功标志, 响应内容或错误消息)
        """
        headers = {
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        }

        # 构建请求体
        if is_vision:
            # 视觉模型使用 messages 数组格式
            payload = {
                'model': model,
                'max_tokens': max_tokens,
                'messages': [{
                    'role': 'user',
                    'content': user_message
                }]
            }
        else:
            # 文本模型使用 system + messages 格式
            payload = {
                'model': model,
                'max_tokens': max_tokens,
                'system': system_prompt,
                'messages': [{
                    'role': 'user',
                    'content': user_message
                }]
            }

        url = f"{base_url}/v1/messages"
        last_error = None

        for attempt in range(self.max_retries):
            try:
                # 等待限流
                self._wait_for_rate_limit()

                # 超时设置：视觉模型需要更长超时
                timeout = 180.0 if is_vision else 120.0

                with httpx.Client(timeout=timeout) as client:
                    print(f"[DEBUG] 调用模型: {model}, 尝试: {attempt + 1}/{self.max_retries}")
                    response = client.post(url, headers=headers, json=payload)

                    if response.status_code == 429:
                        # 限流错误
                        retry_after = self.retry_delay * (attempt + 1)
                        print(f"[WARN] API 限流，等待 {retry_after} 秒后重试...")
                        time.sleep(retry_after)
                        continue

                    if response.status_code == 400:
                        # 请求格式错误，尝试解析错误信息
                        try:
                            error_data = response.json()
                            error_msg = error_data.get('error', {}).get('message', response.text[:200])
                        except:
                            error_msg = response.text[:200]

                        # 如果是视觉模型错误，可能需要重试
                        if is_vision and attempt < self.max_retries - 1:
                            print(f"[WARN] 视觉模型返回 400 错误: {error_msg}")
                            print(f"[INFO] 等待后重试...")
                            time.sleep(self.retry_delay * 2)  # 视觉模型错误等待更长时间
                            continue

                        return False, f"API 请求格式错误: {error_msg}"

                    if response.status_code != 200:
                        return False, f"API 调用失败: {response.status_code} - {response.text[:200]}"

                    result = response.json()

                    # 解析响应
                    if 'content' in result and isinstance(result['content'], list):
                        # 标准格式
                        content_text = ""
                        for block in result['content']:
                            block_type = block.get('type', '')

                            # 处理 Kimi-K2.5 的 thinking 格式
                            if block_type == 'thinking':
                                # Kimi 模型会在 thinking 块中返回分析过程
                                # 同时还有一个 text 块返回最终答案
                                thinking_text = block.get('thinking', '')
                                if thinking_text:
                                    print(f"[DEBUG] 模型思考过程: {thinking_text[:200]}...")
                                continue

                            if block_type == 'text':
                                content_text = block.get('text', '')
                                if content_text:
                                    break

                        # 如果没有找到 text 块，尝试从第一个块获取
                        if not content_text and result['content']:
                            first_block = result['content'][0]
                            if first_block.get('type') == 'text':
                                content_text = first_block.get('text', '')
                            elif first_block.get('type') == 'thinking':
                                # 如果只有 thinking 块，使用 thinking 内容
                                content_text = first_block.get('thinking', '')

                        print(f"[DEBUG] 成功获取响应，长度: {len(content_text)}")
                        return True, content_text

                    elif 'choices' in result:
                        # OpenAI 兼容格式
                        content_text = result['choices'][0]['message']['content']
                        return True, content_text

                    else:
                        return False, f"未知的 API 响应格式: {list(result.keys())}"

            except httpx.TimeoutException:
                last_error = "API 调用超时"
                print(f"[WARN] 请求超时，等待后重试... (尝试 {attempt + 1}/{self.max_retries})")
                time.sleep(self.retry_delay)

            except httpx.RequestError as e:
                last_error = f"API 请求失败: {str(e)}"
                print(f"[WARN] 请求错误: {e}，等待后重试... (尝试 {attempt + 1}/{self.max_retries})")
                time.sleep(self.retry_delay)

            except Exception as e:
                last_error = f"未知错误: {str(e)}"
                print(f"[ERROR] 未知错误: {e}")
                break

        return False, f"API 调用失败，已重试 {self.max_retries} 次: {last_error}"

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
        prompts = {
            "general": """请详细分析这张截图的内容：
1. 页面类型和主要功能
2. 表单元素分布情况
3. 已填写的字段和未填写的字段
4. 是否有明显的填写错误
5. 下拉框、选择框的状态
""",
            "form": """请分析这张表单截图：
1. 列出所有可见的表单字段名称
2. 每个字段当前的填写状态（已填写/未填写/部分填写）
3. 已填写字段的内容是否合理
4. 是否有必填字段未填写
5. 下拉框是否已展开、是否有选中值
""",
            "dropdown": """请专门分析这张截图中的下拉框：
1. 有哪些下拉框组件？
2. 下拉框是 Element UI 还是原生 select？
3. 下拉框是否已展开？
4. 是否有待选中的选项？
5. 当前选中的值是什么？
"""
        }

        prompt = prompts.get(analysis_type, prompts["general"])
        return self.call_vision_model(image_path, prompt)


# 全局实例
_multi_model_service: Optional[MultiModelService] = None


def get_multi_model_service() -> MultiModelService:
    """获取多模型服务实例（单例）"""
    global _multi_model_service
    if _multi_model_service is None:
        _multi_model_service = MultiModelService()
    return _multi_model_service


if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("用法:")
        print("  python multi_model_service.py text <prompt>              # 调用文本模型")
        print("  python multi_model_service.py vision <image_path> [prompt] # 调用视觉模型")
        print("  python multi_model_service.py analyze <image_path> [type]  # 分析截图")
        sys.exit(1)

    service = get_multi_model_service()
    command = sys.argv[1]

    if command == "text":
        prompt = sys.argv[2] if len(sys.argv) > 2 else "你好，请介绍一下你自己。"
        success, result = service.call_text_model(
            "你是一个友好的助手。",
            prompt
        )
        print(f"\n成功: {success}")
        print(f"结果: {result}")

    elif command == "vision":
        if len(sys.argv) < 3:
            print("错误: 需要提供图片路径")
            sys.exit(1)
        image_path = sys.argv[2]
        prompt = sys.argv[3] if len(sys.argv) > 3 else "请描述这张图片的内容。"
        success, result = service.call_vision_model(image_path, prompt)
        print(f"\n成功: {success}")
        print(f"结果: {result}")

    elif command == "analyze":
        if len(sys.argv) < 3:
            print("错误: 需要提供图片路径")
            sys.exit(1)
        image_path = sys.argv[2]
        analysis_type = sys.argv[3] if len(sys.argv) > 3 else "general"
        success, result = service.analyze_screenshot(image_path, analysis_type)
        print(f"\n成功: {success}")
        print(f"结果: {result}")

    else:
        print(f"未知命令: {command}")
        sys.exit(1)
