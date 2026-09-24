"""对话流式服务。

- format_form_data：把项目表单数据格式化为易读中文文本
- build_messages：系统提示词 + 首轮表单上下文 + 历史轮次 + 本轮输入
- chat_stream：AsyncGenerator，逐块产出模型回复文本（delta）
"""

import json
from collections.abc import AsyncGenerator
from functools import lru_cache
from pathlib import Path

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from services.llm_factory import get_llm
from services.prompts import SYSTEM_PROMPT

# services/chat.py → core/questions_config.json
_QUESTIONS_CONFIG_PATH = Path(__file__).resolve().parents[1] / "core" / "questions_config.json"


@lru_cache
def _load_field_meta() -> tuple[dict[str, str], dict[str, str], dict[tuple[str, str], str]]:
    """从表单配置读取字段元信息：

    返回 (字段类型表, 字段中文名表, (字段key, 选项value) → 选项中文名表)。
    """
    with _QUESTIONS_CONFIG_PATH.open("r", encoding="utf-8") as f:
        config = json.load(f)

    types: dict[str, str] = {}
    labels: dict[str, str] = {}
    option_labels: dict[tuple[str, str], str] = {}

    for section in config["sections"]:
        for field in section["fields"]:
            key = field["key"]
            types[key] = field["type"]
            labels[key] = field["label"]
            for option in field.get("options", []):
                option_labels[(key, option["value"])] = option["label"]

    return types, labels, option_labels


def format_form_data(form_data: dict) -> str:
    """把表单字段值转成易读的中文文本，例如：

        产品名称：自由记账
        产品类型：小程序
        平台端：iOS、Android
        使用角色：普通用户、管理员
        核心使用场景：自由职业者每月对账

    空值字段自动跳过；multiselect 的选项 value 会还原为中文 label。
    """
    types, labels, option_labels = _load_field_meta()
    # one_liner 的 quick_brief 不在 sections 里，单独给个中文名
    extra_labels = {"quick_brief": "一句话描述"}

    lines: list[str] = []
    for key, value in form_data.items():
        if value is None or value == "" or value == []:
            continue

        label = labels.get(key) or extra_labels.get(key, key)

        if isinstance(value, list):
            values = [v for v in value if str(v).strip() != ""]
            if not values:
                continue
            if types.get(key) in ("select", "multiselect"):
                values = [option_labels.get((key, v), v) for v in values]
            text = "、".join(str(v) for v in values)
        else:
            text = str(value).strip()
            if not text:
                continue
            # 单选 select 的字符串值同样还原为中文 label
            if types.get(key) == "select":
                text = option_labels.get((key, text), text)

        lines.append(f"{label}：{text}")

    return "\n".join(lines)


def build_messages(
    message: str,
    history: list[dict[str, str]] | None = None,
    form_data: dict | None = None,
) -> list[BaseMessage]:
    """组装发给模型的消息：系统提示词 +（首轮）表单上下文 + 历史轮次 + 本轮输入。"""
    messages: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]

    # 对话开始（尚无历史）时，把用户填写的表单作为初始上下文注入
    if form_data and not history:
        context = format_form_data(form_data)
        if context:
            messages.append(
                SystemMessage(
                    content=(
                        "# 用户已填写的产品意图表单（初始上下文）\n"
                        f"{context}\n\n"
                        "请基于以上信息开场：先简要复述你对产品的理解，"
                        "然后按追问策略提出最关键的 1–3 个问题。"
                    )
                )
            )

    for item in history or []:
        if item["role"] == "assistant":
            messages.append(AIMessage(content=item["content"]))
        else:
            messages.append(HumanMessage(content=item["content"]))
    messages.append(HumanMessage(content=message))
    return messages


async def chat_stream(messages: list[BaseMessage]) -> AsyncGenerator[str, None]:
    """逐块产出模型回复文本。"""
    llm = get_llm()
    async for chunk in llm.astream(messages):
        content = chunk.content
        # 多数模型 content 为 str；少数场景为分段列表，MVP 阶段只透传字符串
        if isinstance(content, str) and content:
            yield content
