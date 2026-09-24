"""路由模块集中导入与登记。

每项为 (router, prefix, tags)，prefix 相对于全局的 /api/v1 前缀，
由 api/__init__.py 读取该表统一 include 到 app。
新增路由时只需：1) 在此导入模块；2) 在 registry 中登记一行。
"""

from api.routes import config, conversation, documents, projects, system

# (router, prefix, tags)
routes_registry = [
    (system.router, "/system", ["system"]),
    (conversation.router, "/conversation", ["conversation"]),
    (config.router, "/config", ["config"]),
    (projects.router, "/projects", ["projects"]),
    (documents.router, "/projects", ["documents"]),
]
