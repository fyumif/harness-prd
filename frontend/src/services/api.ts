import axios from 'axios'
import type { Project, QuestionConfig, QuestionsConfig, Section } from '../types'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// 响应拦截器：直接返回 data，错误统一整理后抛出
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 后端 HTTPException 的 detail 放在 error.response.data.detail
    const message =
      error.response?.data?.detail ||
      error.message ||
      '请求失败，请稍后重试'
    return Promise.reject(new Error(message))
  },
)

// 后端字段 → 教程类型字段：key→id、label→question、help→description
interface RawField {
  key: string
  label: string
  type: QuestionConfig['type']
  required?: boolean
  placeholder?: string
  help?: string
  options?: { value: string; label: string }[]
  rules?: Record<string, unknown>
}

interface RawSection {
  id: string
  title: string
  fields: RawField[]
  advanced?: boolean
}

interface RawQuestionsConfig {
  version: string
  description: string
  sections: RawSection[]
  autosave?: { enabled: boolean }
  one_liner?: Record<string, unknown>
}

/** 将后端配置整体归一化为教程定义的 QuestionsConfig */
export function normalizeQuestions(data: RawQuestionsConfig): QuestionsConfig {
  return {
    ...data,
    sections: data.sections.map(normalizeSection),
  }
}

function normalizeField(field: RawField): QuestionConfig {
  return {
    id: field.key,
    label: field.label,
    question: field.label,
    description: field.help,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder,
    options: field.options,
    rules: field.rules,
  }
}

function normalizeSection(section: RawSection): Section {
  return {
    id: section.id,
    title: section.title,
    fields: section.fields.map(normalizeField),
    // 后端显式标记优先；否则「补充信息」(extra) 分组默认视为高级项
    advanced: section.advanced ?? section.id === 'extra',
  }
}

/** 获取产品意图表单配置（M1），并归一化为教程定义的字段结构 */
export async function getQuestions(): Promise<QuestionsConfig> {
  const data = await request.get<never, RawQuestionsConfig>('/conversation/questions')
  return normalizeQuestions(data)
}

/** 提交产品意图表单，创建项目（M1） */
export function createProject(payload: {
  name?: string
  form_data: Record<string, unknown>
}): Promise<Project> {
  return request.post('/projects', payload)
}

/** 返回修改表单后重新提交：原地更新项目，对话与文档保留 */
export function updateProject(
  projectId: string,
  payload: { name?: string; form_data: Record<string, unknown> },
): Promise<Project> {
  return request.patch(`/projects/${projectId}`, payload)
}

// ---------------------------------------------------------------------------
// SSE 流式：文档生成（fetch + ReadableStream；axios 不适合长连接流）
// ---------------------------------------------------------------------------

/** 每收到一块时回调：delta 为本次增量，full 为截至目前的完整拼接 */
export type StreamChunkHandler = (delta: string, full: string) => void

/** 解析一帧 SSE：done / error / 文本增量（与 ConversationStep 同一套协议） */
function parseSSEFrame(frame: string): {
  type: 'done' | 'error' | 'delta'
  data?: string
} {
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

/**
 * 发起 SSE POST 并逐帧读取。
 * - HTTP 层错误（404/409/503 等）：响应体里有 detail 则抛出其文案
 * - 建流后的 error 事件：抛出 event:error 中的 detail
 * - 正常结束：resolve 完整文本
 */
async function streamSSE(
  path: string,
  body: Record<string, unknown> | undefined,
  onChunk: StreamChunkHandler,
): Promise<string> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `请求失败（${res.status}）`)
  }
  if (!res.body) throw new Error('浏览器不支持流式读取')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 帧以空行（\n\n）分隔；最后一段可能不完整，留在 buffer
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const result = parseSSEFrame(frame)
      if (result.type === 'done') continue
      if (result.type === 'error') throw new Error(result.data)
      full += result.data ?? ''
      onChunk(result.data ?? '', full)
    }
  }

  return full
}

/** SSE 流式生成 PRD，完成后返回完整文本 */
export function generatePrdStream(
  projectId: string,
  onChunk: StreamChunkHandler,
): Promise<string> {
  return streamSSE(
    `/projects/${projectId}/documents/generate-prd-stream`,
    undefined,
    onChunk,
  )
}

/** SSE 流式生成 OpenAPI 3.0 接口文档（前置：PRD 已生成） */
export function generateApiDocsStream(
  projectId: string,
  onChunk: StreamChunkHandler,
): Promise<string> {
  return streamSSE(
    `/projects/${projectId}/documents/generate-api-docs-stream`,
    undefined,
    onChunk,
  )
}

/** SSE 流式生成 AI 提示词套件（前置：PRD 已生成） */
export function generatePromptsStream(
  projectId: string,
  onChunk: StreamChunkHandler,
): Promise<string> {
  return streamSSE(
    `/projects/${projectId}/documents/generate-prompts-stream`,
    undefined,
    onChunk,
  )
}

/** SSE 流式局部改写文档，完成后返回改写结果（不自动落库，由调用方决定是否替换） */
export function optimizeDocumentStream(
  projectId: string,
  content: string,
  instruction: string,
  onChunk: StreamChunkHandler,
): Promise<string> {
  return streamSSE(
    `/projects/${projectId}/documents/optimize-stream`,
    { document: content, instruction },
    onChunk,
  )
}

export default request
