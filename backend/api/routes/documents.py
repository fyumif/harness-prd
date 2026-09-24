"""文档生成 SSE 流式接口（M3 / M4 / M5 + 文档局部改写）。

- POST /{project_id}/documents/generate-prd-stream       生成 PRD（M3）
- POST /{project_id}/documents/generate-api-docs-stream  生成 OpenAPI 接口文档（M4）
- POST /{project_id}/documents/generate-prompts-stream   生成 AI 提示词套件（M5）
- POST /{project_id}/documents/optimize-stream           文档局部改写（M3-6）

SSE 协议与 conversation.py 完全一致：逐块下发 ``data: {"content": ...}``，
正常结束下发 ``data: [DONE]``，模型异常经 ``event: error`` 下发。

建流前校验：API Key 缺失 / 项目不存在 / PRD 未生成，分别映射为 503 / 404 / 409——
StreamingResponse 一旦返回 200 就无法再改 HTTP 状态码，故必须先校验。
"""

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.schemas import OptimizeRequest
from core.config import get_settings
from services import document_service
from services.store import get_document, get_project

router = APIRouter()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",  # 禁用可能存在的代理缓冲，保证逐字到达
}


# ---------------------------------------------------------------------------
# 前置校验
# ---------------------------------------------------------------------------

def _require_api_key() -> None:
    """API Key 未配置 → 503（与 conversation.py 行为一致）。"""
    if not get_settings().ARK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ARK_API_KEY 未配置：请在 backend/.env 中设置后再使用生成功能。",
        )


def _require_project(project_id: str) -> None:
    """项目存在性校验，不存在 → 404。"""
    try:
        get_project(project_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"项目不存在：{project_id}")


def _require_prd(project_id: str) -> None:
    """PRD 前置校验：接口文档与提示词均以 PRD 为输入，缺失 → 409 Conflict。"""
    try:
        get_document(project_id, document_service.PRD)
    except KeyError:
        raise HTTPException(
            status_code=409,
            detail="尚未生成 PRD：请先调用 generate-prd-stream 生成 PRD 后再试。",
        )


# ---------------------------------------------------------------------------
# SSE 协议封装
# ---------------------------------------------------------------------------

async def _sse_wrap(delta_iter):
    """把服务层的文本 delta AsyncGenerator 包装为 SSE 响应体。

    协议对齐 conversation.py：content 分块 → [DONE]；异常 → event: error。
    """
    try:
        async for delta in delta_iter:
            yield f"data: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"
    except ValueError as exc:
        # 业务输入问题（如表单与对话均空时生成 PRD）
        payload = json.dumps({"detail": str(exc)}, ensure_ascii=False)
        yield f"event: error\ndata: {payload}\n\n"
    except Exception as exc:  # 模型超时 / 限流 / 网络错误等
        payload = json.dumps(
            {"detail": f"模型调用失败：{exc}"},
            ensure_ascii=False,
        )
        yield f"event: error\ndata: {payload}\n\n"


def _streaming(delta_iter) -> StreamingResponse:
    return StreamingResponse(
        _sse_wrap(delta_iter),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---------------------------------------------------------------------------
# 路由
# ---------------------------------------------------------------------------

@router.post("/{project_id}/documents/generate-prd-stream")
async def generate_prd_stream(project_id: str):
    """SSE 流式生成 PRD，完成后自动落库。"""
    _require_api_key()
    _require_project(project_id)
    return _streaming(document_service.generate_prd_stream(project_id))


@router.post("/{project_id}/documents/generate-api-docs-stream")
async def generate_api_docs_stream(project_id: str):
    """SSE 流式生成 OpenAPI 3.0 接口文档（前置：PRD 已生成）。"""
    _require_api_key()
    _require_project(project_id)
    _require_prd(project_id)
    return _streaming(document_service.generate_api_docs_stream(project_id))


@router.post("/{project_id}/documents/generate-prompts-stream")
async def generate_prompts_stream(project_id: str):
    """SSE 流式生成 AI 提示词套件（前置：PRD 已生成）。"""
    _require_api_key()
    _require_project(project_id)
    _require_prd(project_id)
    return _streaming(document_service.generate_prompts_stream(project_id))


@router.post("/{project_id}/documents/optimize-stream")
async def optimize_stream(project_id: str, req: OptimizeRequest):
    """SSE 流式局部改写文档。

    不落库：服务层只返回改写结果，由前端决定是否替换当前文档内容。
    """
    _require_api_key()
    _require_project(project_id)
    return _streaming(
        document_service.optimize_document_stream(
            document=req.document,
            instruction=req.instruction,
        )
    )
