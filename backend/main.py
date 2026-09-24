"""FastAPI 应用入口。

启动方式（在 backend/ 目录下）：
    python main.py                  # 使用 .env 中的 HOST / PORT
    uvicorn main:app --reload      # 开发热更新（默认 127.0.0.1:8000）
"""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import api_router
from core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# 通配来源 "*" 与凭证模式不兼容（浏览器会拒绝），此时关闭 credentials
_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(api_router, prefix=settings.API_V1_PREFIX)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
