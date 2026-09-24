import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Check, Copy, Loader2, Wand2 } from 'lucide-react'
import type { DocumentState } from '../types'

interface DocumentReviewProps {
  /** 文档标题（如「PRD 文档」） */
  title: string
  /** 生成完成后的正文，reviewing 状态下由 textarea 双向编辑 */
  content: string
  /** 生成 / 优化进行中的流式内容（只读逐字渲染） */
  streamingContent: string
  /** 当前文档状态 */
  state: DocumentState
  /** 错误信息（流式中断、前置校验失败等），显示在正文上方 */
  error?: string | null
  /** 非阻断提示（如表单更新后建议重新生成），琥珀色，不影响旧文档使用 */
  notice?: string | null
  /** 底部自定义操作按钮区（如「生成接口文档」「重新生成」） */
  actions?: ReactNode
  /** 正文编辑回调 */
  onContentChange?: (next: string) => void
  /** 发起 AI 优化（指令由组件内输入框收集，调用方负责接 optimizeDocumentStream） */
  onOptimize?: (instruction: string) => void
}

const STATE_META: Record<DocumentState, { label: string; badge: string }> = {
  idle: {
    label: '待生成',
    badge: 'border-gray-200 bg-gray-50 text-gray-500',
  },
  generating: {
    label: '生成中',
    badge: 'border-primary-200 bg-primary-50 text-primary-700',
  },
  reviewing: {
    label: '可编辑',
    badge: 'border-green-200 bg-green-50 text-green-700',
  },
  optimizing: {
    label: 'AI 优化中',
    badge: 'border-primary-200 bg-primary-50 text-primary-700',
  },
}

function DocumentReview({
  title,
  content,
  streamingContent,
  state,
  error = null,
  notice = null,
  actions,
  onContentChange,
  onOptimize,
}: DocumentReviewProps) {
  const [instruction, setInstruction] = useState('')
  const [copied, setCopied] = useState(false)

  // 流式正文容器：新块到达时自动滚到底部
  const streamRef = useRef<HTMLPreElement>(null)

  const isStreaming = state === 'generating' || state === 'optimizing'

  useEffect(() => {
    if (isStreaming) {
      streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight })
    }
  }, [streamingContent, isStreaming])

  // 一键复制：优先复制定稿，生成中则复制当前已流出的内容
  const handleCopy = async () => {
    const text = isStreaming ? streamingContent : content
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const submitOptimize = () => {
    const text = instruction.trim()
    if (!text || isStreaming || !onOptimize) return
    onOptimize(text)
    setInstruction('')
  }

  const meta = STATE_META[state]

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* 头部：标题 + 状态徽章 + 复制 */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.badge}`}
          >
            {isStreaming && <Loader2 className="h-3 w-3 animate-spin" />}
            {meta.label}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!content && !streamingContent}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-600" /> 已复制
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> 复制
            </>
          )}
        </button>
      </div>

      {/* 非阻断提示：建议性，用户仍可继续使用当前文档 */}
      {notice && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 正文区 */}
      <div className="flex flex-col gap-3 px-5 py-4">
        {isStreaming ? (
          /* 生成 / 优化中：只读逐字渲染 + 块光标，等宽字体保留 Markdown 原貌 */
          <pre
            ref={streamRef}
            className="h-[55vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-5 text-gray-800"
          >
            {streamingContent}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary-500 align-text-bottom" />
          </pre>
        ) : state === 'reviewing' ? (
          /* 生成完成：可编辑 textarea */
          <textarea
            value={content}
            onChange={(e) => onContentChange?.(e.target.value)}
            spellCheck={false}
            className="h-[55vh] resize-none whitespace-pre-wrap break-words rounded-lg border border-gray-300 p-3 font-mono text-xs leading-5 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="文档内容为空"
          />
        ) : (
          /* idle：尚未生成 */
          <div className="flex h-[20vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
            点击下方按钮开始生成
          </div>
        )}

        {/* AI 优化条：仅定稿可编辑阶段可用 */}
        {state === 'reviewing' && onOptimize && (
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitOptimize()
                }
              }}
              placeholder="AI 优化指令，如：缩写为精简版 / 补充登录功能的验收标准 / 翻译成英文（Enter 发送）"
              className="max-h-24 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={submitOptimize}
              disabled={!instruction.trim() || !content}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-3 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" /> AI 优化
            </button>
          </div>
        )}
      </div>

      {/* 底部自定义操作按钮 */}
      {actions && (
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {actions}
        </div>
      )}
    </section>
  )
}

export default DocumentReview
