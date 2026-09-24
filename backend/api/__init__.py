"""API 路由聚合。

各业务模块在 api/routes/ 下定义自己的 APIRouter 并在 routes registry 中登记，
这里遍历 registry 统一 include，main.py 只需挂载这一个 api_router。
"""

from fastapi import APIRouter

from api.routes import routes_registry

api_router = APIRouter()

for _router, _prefix, _tags in routes_registry:
    api_router.include_router(_router, prefix=_prefix, tags=_tags)
