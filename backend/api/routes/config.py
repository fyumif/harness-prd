"""配置查询接口（占位）。

后续在此暴露前端所需的模型 / Provider 等非敏感配置。
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("")
def get_config() -> dict:
    """配置查询接口占位，下一步返回实际运行配置。"""
    return {"message": "config endpoint placeholder"}
