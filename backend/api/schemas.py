"""API 请求 / 响应的 Pydantic 模型。"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class ChatTurn(BaseModel):
    """历史对话中的一轮。"""

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """POST /conversation/chat 请求体（SSE 流式对话）。"""

    message: str = Field(
        ...,
        min_length=1,
        description="用户本轮输入的对话内容",
    )
    history: list[ChatTurn] = Field(
        default_factory=list,
        description="此前的对话历史，按时间顺序排列",
    )
    form_data: dict[str, Any] | None = Field(
        default=None,
        description="项目表单数据，仅首轮（history 为空）作为对话初始上下文注入",
    )
    project_id: str | None = Field(
        default=None,
        description="项目 ID，用于把对话轮次持久化到对应项目",
    )


class HealthResponse(BaseModel):
    """GET /system/health 响应体。"""

    status: str = Field(
        ...,
        description="服务状态，正常时为 ok",
    )
    app: str = Field(
        ...,
        description="应用名称",
    )
    version: str = Field(
        ...,
        description="应用版本号",
    )


class ProjectCreate(BaseModel):
    """POST /projects 请求体：产品意图表单提交（支持 M1-7 一句话直填）。"""

    name: str | None = Field(
        default=None,
        max_length=100,
        description="项目名称；一句话直填时可为空，此时取 form_data.quick_brief",
    )
    form_data: dict[str, Any] = Field(
        default_factory=dict,
        description="表单字段值，key 为 questions_config.json 中的 field key",
    )

    @model_validator(mode="after")
    def require_name_or_quick_brief(self) -> "ProjectCreate":
        # 完整表单提交有 name；一句话直填只需 form_data.quick_brief 非空
        quick_brief = str(self.form_data.get("quick_brief", "")).strip()
        if not (self.name and self.name.strip()) and not quick_brief:
            raise ValueError("项目名称或一句话描述(quick_brief)不能同时为空")
        return self


class ProjectUpdate(BaseModel):
    """PATCH /projects/{id} 请求体：返回修改表单后重新提交。"""

    name: str | None = Field(
        default=None,
        max_length=100,
        description="项目名称；为空时沿用原名",
    )
    form_data: dict[str, Any] = Field(
        ...,
        description="更新后的表单字段值",
    )


class ProjectResponse(BaseModel):
    """POST /projects 响应体。"""

    id: str = Field(..., description="项目 ID")
    name: str = Field(..., description="项目名称")
    form_data: dict[str, Any] = Field(..., description="提交的表单数据")
    created_at: datetime = Field(..., description="创建时间")


class OptimizeRequest(BaseModel):
    """POST /projects/{id}/documents/optimize-stream 请求体（文档局部改写）。"""

    document: str = Field(
        ...,
        min_length=1,
        description="待改写的文档原文（Markdown / YAML 文本）",
    )
    instruction: str = Field(
        ...,
        min_length=1,
        description="改写指令：扩写、缩写、调整语气、补充验收标准、翻译成英文等",
    )
