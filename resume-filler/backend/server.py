"""
简历自动填写助手 - 后端服务入口
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 确保当前目录在 path 中
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# 加载环境变量
load_dotenv()

from routers import resume_router
from utils.cache import cache

app = FastAPI(
    title="简历自动填写助手",
    description="智能解析简历并自动填写招聘网站表单",
    version="1.0.0"
)

# 配置CORS，允许浏览器插件访问
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class CustomCORSMiddleware(BaseHTTPMiddleware):
    """自定义CORS中间件，支持Chrome扩展和普通网页"""

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")

        # 处理预检请求
        if request.method == "OPTIONS":
            response_headers = {
                "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
                "access-control-allow-headers": "*",
                "access-control-max-age": "86400",
            }
            if is_allowed_origin(origin):
                response_headers["access-control-allow-origin"] = origin if origin else "*"
                response_headers["access-control-allow-credentials"] = "true"
            from starlette.responses import Response
            return Response(status_code=200, headers=response_headers)

        response = await call_next(request)

        # 添加CORS头
        if is_allowed_origin(origin):
            response.headers["access-control-allow-origin"] = origin if origin else "*"
            response.headers["access-control-allow-credentials"] = "true"
            response.headers["access-control-allow-methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["access-control-allow-headers"] = "*"

        return response


def is_allowed_origin(origin: str) -> bool:
    """检查是否为允许的来源"""
    if not origin:
        return True  # 允许无origin的请求（如同源请求）
    # 允许本地开发
    if origin.startswith("http://127.0.0.1") or origin.startswith("http://localhost"):
        return True
    # 允许Chrome扩展
    if origin.startswith("chrome-extension://"):
        return True
    # 允许普通网页（用于content script注入的页面）
    if origin.startswith("http://") or origin.startswith("https://"):
        return True
    return False


app.add_middleware(CustomCORSMiddleware)

# 注册路由
app.include_router(resume_router)

print(f"Registered routes: {[r.path for r in app.routes]}")


@app.on_event("startup")
async def startup_event():
    """应用启动时执行"""
    # 修复可能损坏的数据文件
    cache.repair_current_ref()
    print("数据文件检查完成")


@app.get("/")
async def root():
    """健康检查"""
    return {
        "status": "ok",
        "message": "简历自动填写助手后端服务运行中"
    }


@app.get("/health")
async def health():
    """健康检查端点"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=8001,
        reload=True  # 启用热重载，代码修改后自动生效
    )
