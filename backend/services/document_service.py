"""文档生成流式服务。

- generate_prd_stream：根据「表单 + 澄清对话」生成 PRD（M3）
- generate_api_docs_stream：根据已生成的 PRD 产出 OpenAPI 3.0 接口文档（M4）
- generate_prompts_stream：根据已生成的 PRD 产出 AI 提示词套件（M5）
- optimize_document_stream：按指令局部改写文档（M3-6）

全部使用 astream 逐块返回；生成成功后写入 services.store。
"""

from collections.abc import AsyncGenerator

from langchain_core.messages import HumanMessage

from services.chat import format_form_data
from services.llm_factory import get_llm
from services.prompts import (
    API_DOCS_GENERATION_PROMPT,
    PRD_GENERATION_PROMPT,
    PROMPTS_GENERATION_PROMPT,
    render_optimize_prompt,
)
from services.store import (
    get_conversation,
    get_document,
    get_project,
    put_document,
)

# 文档类型标识（store 中的 key）
PRD = "prd"
API_DOCS = "api_docs"
PROMPTS = "prompts"


async def _astream_text(prompt: str) -> AsyncGenerator[str, None]:
    """把单条任务提示发给模型，逐块产出文本。"""
    llm = get_llm()
    async for chunk in llm.astream([HumanMessage(content=prompt)]):
        if isinstance(chunk.content, str) and chunk.content:
            yield chunk.content


def _build_requirement_spec(project_id: str) -> str:
    """把项目表单 + 澄清对话拼成需求规格文本，作为 PRD 生成的输入。"""
    project = get_project(project_id)

    parts: list[str] = []
    form_text = format_form_data(project.form_data)
    if form_text:
        parts.append(f"# 产品意图表单\n{form_text}")

    turns = get_conversation(project_id)
    if turns:
        lines = [
            f"{'用户' if turn['role'] == 'user' else 'AI'}：{turn['content']}"
            for turn in turns
        ]
        parts.append("# 需求澄清对话记录\n" + "\n".join(lines))

    return "\n\n".join(parts)


def _fill_template(template: str, requirement_spec: str) -> str:
    """填充 {requirement_spec} 占位。

    用 replace 而非 str.format：提示词正文里本身含有花括号
    （如提示词套件模板中的 ``{{变量名}}``），format 会误解析。
    """
    return template.replace("{requirement_spec}", requirement_spec)


async def generate_prd_stream(project_id: str) -> AsyncGenerator[str, None]:
    """根据对话流式生成 PRD，完成后存入 store。"""
    spec = _build_requirement_spec(project_id)
    if not spec.strip():
        raise ValueError("缺少生成所需信息：项目表单与对话均为空")

    prompt = _fill_template(PRD_GENERATION_PROMPT, spec)

    content = ""
    async for delta in _astream_text(prompt):
        content += delta
        yield delta
    put_document(project_id, PRD, content)


async def generate_api_docs_stream(project_id: str) -> AsyncGenerator[str, None]:
    """根据已生成的 PRD 流式产出 OpenAPI 3.0 接口文档。"""
    prd = get_document(project_id, PRD)  # 未生成 PRD 时抛 KeyError

    prompt = _fill_template(API_DOCS_GENERATION_PROMPT, prd)

    content = ""
    async for delta in _astream_text(prompt):
        content += delta
        yield delta
    put_document(project_id, API_DOCS, content)


async def generate_prompts_stream(project_id: str) -> AsyncGenerator[str, None]:
    """根据已生成的 PRD 流式产出 AI 提示词套件。"""
    prd = get_document(project_id, PRD)

    prompt = _fill_template(PROMPTS_GENERATION_PROMPT, prd)

    content = ""
    async for delta in _astream_text(prompt):
        content += delta
        yield delta
    put_document(project_id, PROMPTS, content)


async def optimize_document_stream(
    document: str,
    instruction: str,
) -> AsyncGenerator[str, None]:
    """按用户指令对文档做局部改写，流式返回（不自动落库，由调用方决定是否保存）。"""
    prompt = render_optimize_prompt(instruction, document)
    async for delta in _astream_text(prompt):
        yield delta
