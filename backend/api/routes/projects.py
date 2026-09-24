"""项目接口（MVP 阶段使用进程内字典暂存，重启后数据丢失）。

后续演进为 SQLite / PostgreSQL 持久化（见功能清单 M6）。
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from api.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from services.store import projects as _projects

router = APIRouter()


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(req: ProjectCreate) -> ProjectResponse:
    """创建项目：产品意图表单提交（M1）。"""
    # 一句话直填（M1-7）未给 name 时，用 quick_brief 截断作为项目名
    name = req.name.strip() if req.name else ""
    if not name:
        quick_brief = str(req.form_data.get("quick_brief", "")).strip()
        name = quick_brief[:50]

    project = ProjectResponse(
        id=uuid.uuid4().hex,
        name=name,
        form_data=req.form_data,
        created_at=datetime.now(timezone.utc),
    )
    _projects[project.id] = project
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, req: ProjectUpdate) -> ProjectResponse:
    """更新项目（返回修改表单后重新提交）：只改名称与表单数据，对话与文档保留。"""
    project = _projects.get(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    project.form_data = req.form_data

    # name 未传或为空串时沿用原名；否则以提交值为准
    name = (req.name or "").strip()
    if name:
        project.name = name

    return project
