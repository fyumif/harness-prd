import { useEffect, useState } from 'react'
import {
  Sparkles,
  AlertCircle,
  Check,
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  ArrowRight,
  FileText,
  Network,
  Wand2,
  Download,
  CheckCircle2,
} from 'lucide-react'
import FormStep from './components/FormStep'
import type { FormData } from './components/FormStep'
import ConversationStep from './components/ConversationStep'
import DocumentReview from './components/DocumentReview'
import {
  createProject,
  updateProject,
  generateApiDocsStream,
  generatePrdStream,
  generatePromptsStream,
  getQuestions,
  optimizeDocumentStream,
} from './services/api'
import type {
  ChatMessage,
  DocumentState,
  Project,
  QuestionsConfig,
  ViewState,
} from './types'
import { STEPS, STEP_INDEX } from './types'
import { downloadFile } from './utils/download'

const DRAFT_KEY = 'harness_prd_form_draft'
const SESSION_KEY = 'harness_prd_session'

/** 持久化到 localStorage 的会话快照（不含流式临时内容） */
interface SessionData {
  viewState: ViewState
  formData: FormData
  project: Project
  messages: ChatMessage[]
  prdContent: string
  apiDocsContent: string
  promptsContent: string
  prdState: DocumentState
  apiDocsState: DocumentState
  promptsState: DocumentState
  /** 表单经"返回修改"更新后置 true，提示文档可能与新表单不一致 */
  docsStale: boolean
}

/** 表单更新后，文档页顶部的非阻断提示文案 */
const DOCS_STALE_NOTICE = '表单已更新，建议重新生成文档以确保内容一致。'

function loadDraft(): FormData {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as FormData) : {}
  } catch {
    return {}
  }
}

/**
 * 项目名 → 文件名安全片段：
 * 替换路径/通配等非法字符，空白压成连字符；清空后回退 TaskFlow。
 */
function fileBaseName(name: string): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe || 'TaskFlow'
}

/** 序列化并写入 localStorage；容量超限/隐私模式下静默放弃 */
function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {
    // ignore：持久化失败不影响当前页面使用
  }
}

/** 中断态自动降级，避免刷新后卡在生成中 */
function recoverState(state: DocumentState): DocumentState {
  return state === 'generating' || state === 'optimizing' ? 'reviewing' : state
}

/** 生成中的视图同样退回对应的预览视图 */
function recoverViewState(view: ViewState): ViewState {
  if (view === 'generating-prd') return 'review-prd'
  if (view === 'generating-api-docs') return 'review-api-docs'
  if (view === 'generating-prompts') return 'review-prompts'
  return view
}

/**
 * 校验会话与流程顺序一致，防止手动篡改 localStorage 跳到未授权阶段。
 * 规则：进入某阶段时其前置产物必须存在；不合法则把视图回退到最近的合法阶段。
 */
function sanitizeSession(data: SessionData): SessionData {
  const viewState = recoverViewState(data.viewState)
  const prdState = recoverState(data.prdState)
  const apiDocsState = recoverState(data.apiDocsState)
  const promptsState = recoverState(data.promptsState)

  // 无项目主体：会话无意义，直接丢弃
  if (!data.project) throw new Error('invalid session: missing project')

  let safeView = viewState

  // PRD 阶段必须有 PRD 产物
  if (
    (safeView === 'review-prd' || safeView === 'generating-prd') &&
    !data.prdContent
  ) {
    safeView = 'chatting'
  }

  // 接口文档阶段必须有 PRD 产物
  if (
    (safeView === 'review-api-docs' || safeView === 'generating-api-docs') &&
    !data.prdContent
  ) {
    safeView = data.prdContent ? 'review-prd' : 'chatting'
  }

  // 提示词阶段 / 完成页必须有 PRD，且完成页还要求三份文档齐备
  if (
    safeView === 'review-prompts' ||
    safeView === 'generating-prompts' ||
    safeView === 'done'
  ) {
    if (!data.prdContent) {
      safeView = 'chatting'
    } else if (
      safeView === 'done' &&
      (!data.apiDocsContent || !data.promptsContent)
    ) {
      safeView = 'review-prompts'
    }
  }

  return {
    ...data,
    viewState: safeView,
    prdState,
    apiDocsState,
    promptsState,
  }
}

/** 读取会话；不存在返回 null，解析失败/会话不合法也返回 null */
function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return sanitizeSession(JSON.parse(raw) as SessionData)
  } catch {
    return null
  }
}

/** 顶部步骤进度条 */
function StepProgress({ current }: { current: ViewState }) {
  const activeIndex = STEP_INDEX[current]

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const isDone = i < activeIndex
        const isActive = i === activeIndex

        return (
          <div key={step.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium ${
                  isDone
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : isActive
                      ? 'border-primary-600 bg-white text-primary-600 ring-2 ring-primary-100'
                      : 'border-gray-300 bg-white text-gray-400'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-sm ${
                  isActive ? 'font-medium text-primary-700' : isDone ? 'text-gray-700' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-3 h-px flex-1 ${i < activeIndex ? 'bg-primary-500' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function App() {
  // 整个生命周期只读取一次会话，作为各 state 的初始值来源
  const [session] = useState<SessionData | null>(() => loadSession())

  const [viewState, setViewState] = useState<ViewState>(
    () => session?.viewState ?? 'form',
  )
  const [questions, setQuestions] = useState<QuestionsConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(
    () => session?.formData ?? loadDraft(),
  )
  const [submitting, setSubmitting] = useState(false)
  const [project, setProject] = useState<Project | null>(
    () => session?.project ?? null,
  )
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => session?.messages ?? [],
  )

  // ---- PRD 文档状态 ----
  const [prdContent, setPrdContent] = useState(() => session?.prdContent ?? '')
  const [prdStreamingContent, setPrdStreamingContent] = useState('')
  const [prdState, setPrdState] = useState<DocumentState>(
    () => session?.prdState ?? 'idle',
  )
  const [prdError, setPrdError] = useState<string | null>(null)

  // ---- 接口文档状态 ----
  const [apiDocsContent, setApiDocsContent] = useState(
    () => session?.apiDocsContent ?? '',
  )
  const [apiDocsStreamingContent, setApiDocsStreamingContent] = useState('')
  const [apiDocsState, setApiDocsState] = useState<DocumentState>(
    () => session?.apiDocsState ?? 'idle',
  )
  const [apiDocsError, setApiDocsError] = useState<string | null>(null)

  // ---- 提示词套件状态 ----
  const [promptsContent, setPromptsContent] = useState(
    () => session?.promptsContent ?? '',
  )
  const [promptsStreamingContent, setPromptsStreamingContent] = useState('')
  const [promptsState, setPromptsState] = useState<DocumentState>(
    () => session?.promptsState ?? 'idle',
  )
  const [promptsError, setPromptsError] = useState<string | null>(null)

  // 表单经"返回修改"更新后置 true，文档页据此显示重新生成建议
  const [docsStale, setDocsStale] = useState<boolean>(
    () => session?.docsStale ?? false,
  )

  useEffect(() => {
    getQuestions()
      .then((data) => setQuestions(data))
      .catch((err: Error) => setError(err.message))
  }, [])

  // 会话持久化：项目创建后，任一相关状态变化即写入
  // streamingContent 故意不在依赖里——流式期间不写 localStorage
  useEffect(() => {
    if (!project) return
    saveSession({
      viewState,
      formData,
      project,
      messages,
      prdContent,
      apiDocsContent,
      promptsContent,
      prdState,
      apiDocsState,
      promptsState,
      docsStale,
    })
  }, [
    project,
    viewState,
    formData,
    messages,
    prdContent,
    apiDocsContent,
    promptsContent,
    prdState,
    apiDocsState,
    promptsState,
    docsStale,
  ])

  // 表单双向绑定：更新值并即时写入 localStorage（M1-8 草稿自动保存）
  const handleFieldChange = (key: string, value: string | string[]) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      return next
    })
  }

  // 首次提交 → 创建项目；返回修改表单后重新提交 → 原地更新（保留对话与文档）
  const handleSubmit = async (data: FormData) => {
    setSubmitting(true)
    setError(null)
    const name = (data.product_name as string) || (data.quick_brief as string) || ''

    try {
      if (project) {
        const updated = await updateProject(project.id, { name, form_data: data })
        setProject(updated)
        // 表单已变：已有文档可能与新表单不一致，给出建议但不清空
        setDocsStale(true)
      } else {
        const created = await createProject({ name, form_data: data })
        setProject(created)
        setMessages([])
        setDocsStale(false)
      }
      localStorage.removeItem(DRAFT_KEY)
      setViewState('chatting')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  // 结束任务：三份文档已定稿，进入完成页
  const handleEndTask = () => {
    if (!prdContent || !apiDocsContent || !promptsContent) return
    setViewState('done')
  }

  // 重置：清空本地持久化与全部状态，回到表单页重新开始
  const handleRestart = () => {
    if (!window.confirm('确定要重新开始吗？所有对话和文档将被清空，清空后无法恢复。')) {
      return
    }
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(DRAFT_KEY)

    setViewState('form')
    setFormData({})
    setProject(null)
    setMessages([])

    setPrdContent('')
    setPrdStreamingContent('')
    setPrdState('idle')
    setPrdError(null)

    setApiDocsContent('')
    setApiDocsStreamingContent('')
    setApiDocsState('idle')
    setApiDocsError(null)

    setPromptsContent('')
    setPromptsStreamingContent('')
    setPromptsState('idle')
    setPromptsError(null)

    setDocsStale(false)
    setError(null)
  }

  // -------------------------------------------------------------------------
  // 文档生成
  // -------------------------------------------------------------------------

  /** 生成 PRD：流式逐块渲染，结束后落定稿并切到 reviewing */
  const handleGeneratePrd = async () => {
    if (!project || prdState === 'generating') return

    setViewState('generating-prd')
    setPrdState('generating')
    setPrdStreamingContent('')
    setPrdError(null)

    try {
      const full = await generatePrdStream(project.id, (_delta, acc) =>
        setPrdStreamingContent(acc),
      )
      setPrdContent(full)
      setPrdState('reviewing')
      setDocsStale(false)
      setViewState('review-prd')
    } catch (err) {
      setPrdError((err as Error).message)
      // 已有旧定稿则退回可编辑态；首次生成失败回到 idle
      setPrdState(prdContent ? 'reviewing' : 'idle')
    }
  }

  /** 生成接口文档：依赖 PRD 已定稿 */
  const handleGenerateApiDocs = async () => {
    if (!project || apiDocsState === 'generating') return
    if (!prdContent) {
      setApiDocsError('请先生成 PRD')
      return
    }

    setViewState('generating-api-docs')
    setApiDocsState('generating')
    setApiDocsStreamingContent('')
    setApiDocsError(null)

    try {
      const full = await generateApiDocsStream(project.id, (_delta, acc) =>
        setApiDocsStreamingContent(acc),
      )
      setApiDocsContent(full)
      setApiDocsState('reviewing')
      setDocsStale(false)
      setViewState('review-api-docs')
    } catch (err) {
      setApiDocsError((err as Error).message)
      setApiDocsState(apiDocsContent ? 'reviewing' : 'idle')
    }
  }

  /** 生成提示词套件：依赖 PRD 已定稿 */
  const handleGeneratePrompts = async () => {
    if (!project || promptsState === 'generating') return
    if (!prdContent) {
      setPromptsError('请先生成 PRD')
      return
    }

    setViewState('generating-prompts')
    setPromptsState('generating')
    setPromptsStreamingContent('')
    setPromptsError(null)

    try {
      const full = await generatePromptsStream(project.id, (_delta, acc) =>
        setPromptsStreamingContent(acc),
      )
      setPromptsContent(full)
      setPromptsState('reviewing')
      setDocsStale(false)
      setViewState('review-prompts')
    } catch (err) {
      setPromptsError((err as Error).message)
      setPromptsState(promptsContent ? 'reviewing' : 'idle')
    }
  }

  // -------------------------------------------------------------------------
  // AI 局部优化（不落库；结束后用结果替换正文）
  // -------------------------------------------------------------------------

  const handleOptimizePrd = async (instruction: string) => {
    if (!project || prdState !== 'reviewing') return

    setPrdState('optimizing')
    setPrdStreamingContent('')
    setPrdError(null)

    try {
      const next = await optimizeDocumentStream(
        project.id,
        prdContent,
        instruction,
        (_delta, acc) => setPrdStreamingContent(acc),
      )
      setPrdContent(next)
    } catch (err) {
      setPrdError((err as Error).message)
    } finally {
      // 成功或失败都回到 reviewing：成功展示新正文，失败保留旧正文
      setPrdState('reviewing')
    }
  }

  const handleOptimizeApiDocs = async (instruction: string) => {
    if (!project || apiDocsState !== 'reviewing') return

    setApiDocsState('optimizing')
    setApiDocsStreamingContent('')
    setApiDocsError(null)

    try {
      const next = await optimizeDocumentStream(
        project.id,
        apiDocsContent,
        instruction,
        (_delta, acc) => setApiDocsStreamingContent(acc),
      )
      setApiDocsContent(next)
    } catch (err) {
      setApiDocsError((err as Error).message)
    } finally {
      setApiDocsState('reviewing')
    }
  }

  const handleOptimizePrompts = async (instruction: string) => {
    if (!project || promptsState !== 'reviewing') return

    setPromptsState('optimizing')
    setPromptsStreamingContent('')
    setPromptsError(null)

    try {
      const next = await optimizeDocumentStream(
        project.id,
        promptsContent,
        instruction,
        (_delta, acc) => setPromptsStreamingContent(acc),
      )
      setPromptsContent(next)
    } catch (err) {
      setPromptsError((err as Error).message)
    } finally {
      setPromptsState('reviewing')
    }
  }

  // -------------------------------------------------------------------------
  // 各文档底部操作按钮
  // -------------------------------------------------------------------------

  // 三份文档齐备时，文档页可直接返回完成页（done 视图受 sanitizeSession 同条件保护）
  const allDocsReady = Boolean(prdContent && apiDocsContent && promptsContent)

  // 左侧导航区：返回完成页（仅三份文档齐备时出现）+ 返回对话
  const docNavActions = (
    <div key="doc-nav" className="mr-auto flex items-center gap-2">
      {allDocsReady && (
        <button
          type="button"
          onClick={() => setViewState('done')}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          <CheckCircle2 className="h-4 w-4" /> 返回完成页
        </button>
      )}
      <button
        type="button"
        onClick={() => setViewState('chatting')}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> 返回对话
      </button>
    </div>
  )

  const restartButton = (
    <button
      key="restart"
      type="button"
      onClick={handleRestart}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
    >
      <RotateCcw className="h-4 w-4" /> 重置
    </button>
  )

  const prdActions = (
    <>
      {docNavActions}
      <button
        type="button"
        onClick={() => void handleGeneratePrd()}
        disabled={prdState === 'generating'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${prdState === 'generating' ? 'animate-spin' : ''}`} />
        重新生成
      </button>
      <button
        type="button"
        onClick={() => void handleGenerateApiDocs()}
        disabled={prdState !== 'reviewing'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        生成接口文档
        <ArrowRight className="h-4 w-4" />
      </button>
      {restartButton}
    </>
  )

  const apiDocsActions = (
    <>
      {docNavActions}
      <button
        type="button"
        onClick={() => void handleGenerateApiDocs()}
        disabled={apiDocsState === 'generating'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${apiDocsState === 'generating' ? 'animate-spin' : ''}`} />
        重新生成
      </button>
      <button
        type="button"
        onClick={() => void handleGeneratePrompts()}
        disabled={apiDocsState !== 'reviewing'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        生成提示词套件
        <ArrowRight className="h-4 w-4" />
      </button>
      {restartButton}
    </>
  )

  const promptsActions = (
    <>
      {docNavActions}
      <button
        type="button"
        onClick={() => void handleGeneratePrompts()}
        disabled={promptsState === 'generating'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${promptsState === 'generating' ? 'animate-spin' : ''}`} />
        重新生成
      </button>
      <button
        type="button"
        onClick={handleEndTask}
        disabled={promptsState !== 'reviewing'}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check className="h-4 w-4" /> 完成
      </button>
      {restartButton}
    </>
  )

  const isPrdView = viewState === 'generating-prd' || viewState === 'review-prd'
  const isApiDocsView =
    viewState === 'generating-api-docs' || viewState === 'review-api-docs'
  const isPromptsView =
    viewState === 'generating-prompts' || viewState === 'review-prompts'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-500" />
            <h1 className="text-lg font-semibold text-gray-900">Harness PRD · 创建项目</h1>
          </div>
          <StepProgress current={viewState} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {error && viewState === 'form' && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {viewState === 'form' &&
          (questions ? (
            <>
              <p className="mb-6 text-sm text-gray-500">
                描述你想做的产品，带 <span className="text-red-500">*</span> 为必填项；草稿会自动保存到本地。
              </p>
              <FormStep
                questions={questions}
                values={formData}
                onFieldChange={handleFieldChange}
                onSubmit={handleSubmit}
                submitting={submitting}
              />
            </>
          ) : (
            !error && <p className="text-sm text-gray-400">正在加载表单…</p>
          ))}

        {viewState === 'chatting' && project && (
          <ConversationStep
            project={project}
            messages={messages}
            onMessagesChange={setMessages}
            onBack={() => setViewState('form')}
            onGeneratePrd={() => void handleGeneratePrd()}
            hasPrd={prdContent.length > 0}
            onViewPrd={() => setViewState('review-prd')}
          />
        )}

        {isPrdView && project && (
          <DocumentReview
            title="PRD 文档"
            content={prdContent}
            streamingContent={prdStreamingContent}
            state={prdState}
            error={prdError}
            notice={docsStale ? DOCS_STALE_NOTICE : null}
            onContentChange={setPrdContent}
            onOptimize={(instruction) => void handleOptimizePrd(instruction)}
            actions={prdActions}
          />
        )}

        {isApiDocsView && project && (
          <DocumentReview
            title="接口文档"
            content={apiDocsContent}
            streamingContent={apiDocsStreamingContent}
            state={apiDocsState}
            error={apiDocsError}
            notice={docsStale ? DOCS_STALE_NOTICE : null}
            onContentChange={setApiDocsContent}
            onOptimize={(instruction) => void handleOptimizeApiDocs(instruction)}
            actions={apiDocsActions}
          />
        )}

        {isPromptsView && project && (
          <DocumentReview
            title="提示词套件"
            content={promptsContent}
            streamingContent={promptsStreamingContent}
            state={promptsState}
            error={promptsError}
            notice={docsStale ? DOCS_STALE_NOTICE : null}
            onContentChange={setPromptsContent}
            onOptimize={(instruction) => void handleOptimizePrompts(instruction)}
            actions={promptsActions}
          />
        )}

        {viewState === 'done' && project && (
          <div className="flex flex-col items-center gap-6">
            <div className="mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>

            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900">
                恭喜！三份文档已全部生成
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {project.name} · 可下载 Markdown，也可返回查看与编辑
              </p>
            </div>

            <div className="w-full space-y-4">
              {[
                {
                  icon: FileText,
                  title: 'PRD 文档',
                  content: prdContent,
                  suffix: 'PRD',
                  view: 'review-prd' as const,
                },
                {
                  icon: Network,
                  title: '接口文档',
                  content: apiDocsContent,
                  suffix: 'API-Docs',
                  view: 'review-api-docs' as const,
                },
                {
                  icon: Wand2,
                  title: '提示词套件',
                  content: promptsContent,
                  suffix: 'Prompts',
                  view: 'review-prompts' as const,
                },
              ].map(({ icon: Icon, title, content, suffix, view }) => {
                const generated = content.length > 0
                const filename = `${fileBaseName(project.name)}-${suffix}.md`

                return (
                  <div
                    key={title}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                  >
                    {/* 卡片信息区：图标 / 标题 / 字数 / 状态徽标 */}
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                        <Icon className="h-5 w-5 text-primary-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{title}</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {generated ? `${content.length} 字` : '0 字'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          generated
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {generated ? '已生成' : '未生成'}
                      </span>
                    </div>

                    {/* 卡片底部操作区：查看 / 下载 Markdown */}
                    <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3">
                      <button
                        type="button"
                        onClick={() => setViewState(view)}
                        disabled={!generated}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        查看
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadFile(filename, content)}
                        disabled={!generated}
                        title={generated ? filename : '未生成'}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        下载 Markdown
                      </button>
                      {!generated && (
                        <span className="text-xs text-gray-400">未生成</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 重新开始：走 handleRestart（含确认弹窗 + 清空双 key + 全状态重置） */}
            <button
              type="button"
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <RotateCcw className="h-4 w-4" /> 重新开始
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
