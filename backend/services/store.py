"""进程内内存存储：项目 / 对话 / 文档（MVP 阶段，重启丢失）。

路由层与服务层统一通过本模块读写，避免数据散落在各路由文件中。
后续替换为 SQLite 时只需改本模块的实现。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from api.schemas import ProjectResponse

# project_id -> ProjectResponse
projects: dict[str, ProjectResponse] = {}

# project_id -> [{"role": "user"|"assistant", "content": ...}]
conversations: dict[str, list[dict[str, str]]] = {}

# project_id -> {doc_type: markdown/yaml 文本}
documents: dict[str, dict[str, str]] = {}


def get_project(project_id: str) -> ProjectResponse:
    """取项目，不存在抛 KeyError（路由层映射为 404）。"""
    project = projects.get(project_id)
    if project is None:
        raise KeyError(project_id)
    return project


def get_conversation(project_id: str) -> list[dict[str, str]]:
    """取某项目的对话轮次（无对话时返回空列表）。"""
    return conversations.setdefault(project_id, [])


def append_turn(project_id: str, role: str, content: str) -> None:
    """追加一轮对话。"""
    conversations.setdefault(project_id, []).append(
        {"role": role, "content": content}
    )


def get_document(project_id: str, doc_type: str) -> str:
    """取已生成的文档内容，不存在抛 KeyError。"""
    content = documents.get(project_id, {}).get(doc_type)
    if not content:
        raise KeyError(f"{project_id}:{doc_type}")
    return content


def put_document(project_id: str, doc_type: str, content: str) -> None:
    """保存（覆盖）某项目某类型的最新文档。"""
    documents.setdefault(project_id, {})[doc_type] = content
