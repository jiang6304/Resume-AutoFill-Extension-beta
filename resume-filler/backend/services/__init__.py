# Services package
# 使用延迟导入避免循环依赖
from .llm import get_llm_service, LLMService

__all__ = [
    "get_llm_service", "LLMService",
    "parser", "FileParser",
    "get_vision_service", "VisionService",
    "get_multi_model_service", "MultiModelService"
]

# 延迟导入（需要时才导入）
def __getattr__(name):
    if name == "parser":
        from .parser import parser
        return parser
    elif name == "FileParser":
        from .parser import FileParser
        return FileParser
    elif name == "get_vision_service":
        from .vision_service import get_vision_service
        return get_vision_service
    elif name == "VisionService":
        from .vision_service import VisionService
        return VisionService
    elif name == "get_multi_model_service":
        from .multi_model_service import get_multi_model_service
        return get_multi_model_service
    elif name == "MultiModelService":
        from .multi_model_service import MultiModelService
        return MultiModelService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
