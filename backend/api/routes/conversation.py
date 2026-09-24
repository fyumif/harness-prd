"""AI 对话接口。

- GET  /questions：产品意图表单配置（M1），读取 core/questions_config.json
- POST /chat：SSE 流式对话（M2），对接火山方舟
"""

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from api.schemas import ChatRequest
from core.config import get_settings
from services.chat import build_messages, chat_stream
from services.store import append_turn

router = APIRouter()

# backend/api/routes/conversation.py → backend/core/questions_config.json
_QUESTIONS_CONFIG_PATH = Path(__file__).resolve().parents[2] / "core" / "questions_config.json"


@router.get("/questions")
def get_questions() -> dict:
    """返回产品意图表单配置，前端据此动态渲染项目创建表单。

    配置文件缺失返回 404；文件存在但内容为非法 JSON 时返回 500。
    """
    if not _QUESTIONS_CONFIG_PATH.is_file():
        raise HTTPException(status_code=404, detail="questions config file not found")
    try:
        with _QUESTIONS_CONFIG_PATH.open("r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="questions config file is invalid JSON")


@router.post("/chat")
async def chat(req: ChatRequest):
    """SSE 流式对话：逐块返回模型回复。

    - API Key 未配置：在建立流之前直接返回 503（友好可读的错误）
    - 模型调用中途异常：通过 SSE ``event: error`` 下发，不中断成无提示的断流
    """
    settings = get_settings()
    if not settings.ARK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ARK_API_KEY 未配置：请在 backend/.env 中设置后再使用对话功能。",
        )

    messages = build_messages(
        req.message,
        [turn.model_dump() for turn in req.history],
        req.form_data,
    )

    async def event_generator():
        assistant_content = ""
        try:
            async for delta in chat_stream(messages):
                assistant_content += delta
                yield f"data: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            # 一轮完整结束后，把本轮问答写入该项目的对话存储（供文档生成读取）
            if req.project_id:
                append_turn(req.project_id, "user", req.message)
                append_turn(req.project_id, "assistant", assistant_content)
        except Exception as exc:  # 模型超时 / 限流 / 网络错误等
            payload = json.dumps(
                {"detail": f"模型调用失败：{exc}"},
                ensure_ascii=False,
            )
            yield f"event: error\ndata: {payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # 禁用可能存在的代理缓冲，保证逐字到达
        },
    )
