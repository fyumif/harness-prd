"""应用配置：通过 pydantic-settings 从环境变量 / .env 文件读取。"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- 应用 ----
    APP_NAME: str = "Harness PRD"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # ---- 服务监听 ----
    HOST: str = "0.0.0.0"
    PORT: int = Field(default=8000, ge=1, le=65535)

    # ---- 跨域 ----
    # 逗号分隔的来源列表，例如 "http://localhost:5173,http://localhost:3000"；
    # 为 "*" 时允许全部来源
    CORS_ORIGINS: str = "http://localhost:5173"

    # ---- 火山方舟（兼容 OpenAI 接口，走 langchain-openai）----
    ARK_API_KEY: str = ""
    ARK_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    # 模型调用统一走 Coding 专用入口
    ARK_CODING_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/coding/v3"

    # ---- LLM 默认配置 ----
    DEFAULT_LLM_PROVIDER: Literal["openai"] = "openai"
    DEFAULT_LLM_MODEL: str = "doubao-seed-2.1-turbo"

    @property
    def cors_origins_list(self) -> list[str]:
        value = self.CORS_ORIGINS.strip()
        if value == "*":
            return ["*"]
        return [origin.strip() for origin in value.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """单例配置，供全局及 FastAPI 依赖注入调用。"""
    return Settings()
