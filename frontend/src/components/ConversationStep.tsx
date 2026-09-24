import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, SendHorizonal, AlertCircle, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ChatMessage, Project } from '../types'

interface ConversationStepProps {
  project: Project
  /** 消息历史已提升到 App，便于会话持久化 */
  messages: ChatMessage[]
  /** 支持函数式更新，流式 patch 时避免闭包拿到旧 messages */
  onMessagesChange: (
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => void
  onBack: () => void
  /** 澄清完成后进入 PRD 生成 */
  onGeneratePrd: () => void
  /** 是否已有 PRD 产物：有则主按钮只做查看，不重新生成 */
  hasPrd: boolean
  /** 查看已有 PRD（仅切换视图，不发请求） */
  onViewPrd: () => void
}

/** Markdown 排版：未装 typography 插件，用 Tailwind 子选择器补齐列表/代码间距 */
const MARKDOWN_CLASS =
  'text-sm leading-6 text-gray-800 ' +
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ' +
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:my-0.5 [&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs ' +
  '[&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-100 ' +
  '[&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-gray-300 [&_th]:px-2 [&_th]:py-1 ' +
  '[&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1'

function ConversationStep({
  project,
  messages,
  onMessagesChange,
  onBack,
  onGeneratePrd,
  hasPrd,
  onViewPrd,
}: ConversationStepProps) {
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // 新消息 / 流式追加时自动滚到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const patchMessage = (id: string, content: string) => {
    onMessagesChange((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m)),
    )
  }

  /** 解析一帧 SSE：返回 'done' / 'error' / 文本增量 */
  const parseFrame = (
    frame: string,
  ): { type: 'done' | 'error' | 'delta'; data?: string } => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    const raw = dataLines.join('\n')
    if (raw === '[DONE]') return { type: 'done' }
    if (event === 'error') {
      try {
        return { type: 'error', data: JSON.parse(raw).detail ?? raw }
      } catch {
        return { type: 'error', data: raw }
      }
    }
    try {
      return { type: 'delta', data: JSON.parse(raw).content ?? '' }
    } catch {
      return { type: 'delta', data: '' }
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return

    setError(null)
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }
    const history = messages.map(({ role, content }) => ({ role, content }))

    onMessagesChange((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    try {
      const res = await fetch('/api/v1/conversation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          form_data: project.form_data,
          project_id: project.id,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || `请求失败（${res.status}）`)
      }
      if (!res.body) throw new Error('浏览器不支持流式读取')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE 帧以空行（\n\n）分隔；最后一段可能不完整，留在 buffer
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''

        for (const frame of frames) {
          const result = parseFrame(frame)
          if (result.type === 'done') continue
          if (result.type === 'error') throw new Error(result.data)
          acc += result.data ?? ''
          patchMessage(assistantId, acc)
        }
      }

      if (!acc) throw new Error('模型未返回任何内容，请重试')
    } catch (err) {
      setError((err as Error).message)
      // 空的助手占位消息移除，避免界面上留下气泡壳
      onMessagesChange((prev) =>
        prev.filter((m) => m.id !== assistantId || m.content !== ''),
      )
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" /> 返回修改表单
      </button>

      <section className="flex h-[65vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            AI 需求澄清 · {project.name}
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            AI 会围绕用户、场景、功能、流程、数据、规则等持续追问，一次只问 1–3 个问题
          </p>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-gray-50 px-5 py-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center">
              <p className="text-sm text-gray-400">
                AI 已读取你填写的产品表单，发送任意消息即可开始对话
              </p>
              <p className="mt-1 text-xs text-gray-300">
                例如：请先帮我梳理核心功能
              </p>
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary-600 px-4 py-2 text-sm leading-6 text-white">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700">
                  AI
                </div>
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-2.5">
                  {m.content ? (
                    <div className={MARKDOWN_CLASS}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="inline-flex gap-1 py-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300 [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-300" />
                    </span>
                  )}
                </div>
              </div>
            ),
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={input}
              disabled={streaming}
              placeholder={streaming ? 'AI 正在回复…' : '输入你的想法，Enter 发送，Shift+Enter 换行'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              className="max-h-32 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={streaming || !input.trim()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 至少一轮对话（用户提问 + AI 回复）后才允许进入 PRD */}
      {messages.length >= 2 ? (
        hasPrd ? (
          <>
            {/* 已有 PRD：主按钮只查看，不发任何请求；重新生成在文档页内进行 */}
            <button
              type="button"
              onClick={onViewPrd}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <FileText className="h-4 w-4" />
              查看 PRD
            </button>
            <p className="-mt-2 text-center text-xs text-gray-400">
              PRD 已生成，可直接查看；如需更新内容，可在文档页重新生成
            </p>
          </>
        ) : (
          <>
            {/* AI 回复进行中禁用，避免中途切走导致本轮对话未落库 */}
            <button
              type="button"
              onClick={onGeneratePrd}
              disabled={streaming}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              生成 PRD
            </button>
            <p className="-mt-2 text-center text-xs text-gray-400">
              可以继续对话补充需求，信息足够后随时生成
            </p>
          </>
        )
      ) : (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-center text-xs text-gray-400">
          再多聊几句，让 AI 更了解你的产品
        </p>
      )}
    </div>
  )
}

export default ConversationStep
