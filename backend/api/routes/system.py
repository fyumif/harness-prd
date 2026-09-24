"""系统级接口：健康检查等。"""

from fastapi import APIRouter, Depends

from api.schemas import HealthResponse
from core.config import Settings, get_settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        app=settings.APP_NAME,
        version=settings.APP_VERSION,
    )
