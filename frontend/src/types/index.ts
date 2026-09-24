export interface QuestionConfig {
  id: string
  label: string
  question: string
  description?: string
  type: 'text' | 'textarea' | 'select' | 'radio' | 'multiselect' | 'tags' | 'list'
  required?: boolean
  placeholder?: string
  options?: { value: string; label: string }[]
  rules?: Record<string, unknown>
}

export interface Section {
  id: string
  title: string
  fields: QuestionConfig[]
  advanced?: boolean
}

export interface QuestionsConfig {
  version: string
  description: string
  sections: Section[]
  autosave?: { enabled: boolean }
  one_liner?: Record<string, unknown>
}

export interface Project {
  id: string
  name: string
  form_data: Record<string, unknown>
  created_at: string
}

/** 全局视图状态：表单 → 对话 → 三份文档的生成/预览 → 完成 */
export type ViewState =
  | 'form'
  | 'chatting'
  | 'generating-prd'
  | 'review-prd'
  | 'generating-api-docs'
  | 'review-api-docs'
  | 'generating-prompts'
  | 'review-prompts'
  | 'done'

/** 顶部步骤条节点 */
export const STEPS = [
  { id: 'form', label: '描述产品' },
  { id: 'chatting', label: 'AI 对话' },
  { id: 'review-prd', label: 'PRD' },
  { id: 'review-api-docs', label: '接口文档' },
  { id: 'review-prompts', label: '提示词' },
] as const

/** 对话消息（同时用于前端状态与 /chat 请求体里的 history） */
export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
}

/** viewState → STEPS 位置（生成态与对应预览态共用一个进度节点） */
export const STEP_INDEX: Record<ViewState, number> = {
  form: 0,
  chatting: 1,
  'generating-prd': 2,
  'review-prd': 2,
  'generating-api-docs': 3,
  'review-api-docs': 3,
  'generating-prompts': 4,
  'review-prompts': 4,
  done: 4,
}

/** 文档类型：与后端 services/document_service.py 的 store key 对齐 */
export type DocumentType = 'prd' | 'api_docs' | 'prompts'

/** 文档生命周期状态 */
export type DocumentState = 'idle' | 'generating' | 'reviewing' | 'optimizing'
