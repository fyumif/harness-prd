"""LLM 实例工厂。

根据 core.config 中的 DEFAULT_LLM_PROVIDER 返回对应的 LangChain ChatModel：
- openai：通过火山方舟的 OpenAI 兼容协议接入（langchain-openai）
- anthropic：预留，暂不实现（避免引入未安装的 langchain-anthropic 依赖）

所有模型调用统一经本工厂获取实例，路由 / service 层不直接构造客户端。
"""

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from core.config import get_settings


def get_llm() -> BaseChatModel:
    """按当前运行配置返回一个 LangChain ChatModel 实例。

    读取 Settings 中的：
    - DEFAULT_LLM_PROVIDER：供应商标识（当前仅支持 openai）
    - DEFAULT_LLM_MODEL：模型名（如 doubao-seed-2.1-turbo）
    - ARK_API_KEY：火山方舟 API Key（仅在后端使用，不下发前端）
    - ARK_CODING_BASE_URL：火山方舟 Coding 入口（可在 .env 中覆盖）
    """
    settings = get_settings()
    provider = settings.DEFAULT_LLM_PROVIDER

    if provider == "openai":
        if not settings.ARK_API_KEY:
            raise RuntimeError(
                "ARK_API_KEY 未配置：请在 backend/.env 中设置后再调用 LLM。"
            )
        return ChatOpenAI(
            model=settings.DEFAULT_LLM_MODEL,
            api_key=settings.ARK_API_KEY,
            base_url=settings.ARK_CODING_BASE_URL,
            temperature=0.7,
            # doubao-seed 默认先输出大量思考链（reasoning_content），
            # 它不在 chunk.content 中——既不会流式透传给用户，也不会落库，
            # 却会让对话/文档生成在"无任何可见输出"下等待数十秒，故关闭。
            # thinking 是方舟扩展参数，经 extra_body 透传给底层 OpenAI SDK。
            extra_body={"thinking": {"type": "disabled"}},
        )

    if provider == "anthropic":
        # 预留：接入时需先新增 langchain-anthropic 依赖，
        # 再在此返回 ChatAnthropic 实例。
        raise NotImplementedError(
            "Anthropic provider 暂未接入，当前版本仅支持 openai（火山方舟）。"
        )

    raise ValueError(f"不支持的 LLM provider: {provider!r}，可选值：openai")
