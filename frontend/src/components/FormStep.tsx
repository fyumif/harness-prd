import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, X, Plus, Trash2 } from 'lucide-react'
import type { QuestionConfig, QuestionsConfig } from '../types'

export type FormData = Record<string, string | string[]>

interface FormStepProps {
  questions: QuestionsConfig
  values: FormData
  onFieldChange: (key: string, value: string | string[]) => void
  onSubmit: (formData: FormData) => void
  submitting?: boolean
}

/** 判断字段是否为空（用于必填校验） */
function isEmpty(value: string | string[] | undefined): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.length === 0 || value.every((v) => v.trim() === '')
  return value.trim() === ''
}

/** 按 rules 校验单个字段，返回错误信息（无错误为 null） */
export function validateField(field: QuestionConfig, value: string | string[] | undefined): string | null {
  const rules = (field.rules ?? {}) as Record<string, number>

  if (field.required && isEmpty(value)) return '此项为必填项'

  if (typeof value === 'string' && rules.max_length !== undefined && value.length > rules.max_length) {
    return `不能超过 ${rules.max_length} 个字符`
  }
  if (Array.isArray(value)) {
    const count = value.filter((v) => v.trim() !== '').length
    if (rules.min_items !== undefined && count < rules.min_items) return `至少填写 ${rules.min_items} 项`
    if (rules.max_items !== undefined && count > rules.max_items) return `最多填写 ${rules.max_items} 项`
  }
  return null
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-red-600">{message}</p>
}

function FormStep({ questions, values, onFieldChange, onSubmit, submitting }: FormStepProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasAdvanced = useMemo(
    () => questions.sections.some((s) => s.advanced),
    [questions.sections],
  )

  const visibleSections = showAdvanced
    ? questions.sections
    : questions.sections.filter((s) => !s.advanced)

  // 修改字段时同步清除该项的校验错误
  const handleFieldChange = (key: string, value: string | string[]) => {
    onFieldChange(key, value)
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const handleSubmit = () => {
    const nextErrors: Record<string, string> = {}
    for (const section of questions.sections) {
      for (const field of section.fields) {
        const message = validateField(field, values[field.id])
        if (message) nextErrors[field.id] = message
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) onSubmit(values)
  }

  const renderField = (field: QuestionConfig) => {
    const value = values[field.id]
    const baseInput =
      'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            className={baseInput}
            value={(value as string) ?? ''}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
          />
        )

      case 'textarea':
        return (
          <textarea
            rows={4}
            className={baseInput}
            value={(value as string) ?? ''}
            placeholder={field.placeholder}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
          />
        )

      case 'select':
        return (
          <select
            className={baseInput}
            value={(value as string) ?? ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
          >
            <option value="">请选择…</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case 'multiselect': {
        const selected = Array.isArray(value) ? value : []
        return (
          <div className="flex flex-wrap gap-2">
            {field.options?.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onFieldChange(
                      field.id,
                      checked
                        ? selected.filter((v) => v !== opt.value)
                        : [...selected, opt.value],
                    )
                  }
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    checked
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-300 text-gray-600 hover:border-primary-300'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )
      }

      case 'tags': {
        const tags = Array.isArray(value) ? value : []
        return (
          <div className="rounded-md border border-gray-300 p-2 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleFieldChange(field.id, tags.filter((_, idx) => idx !== i))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                className="flex-1 min-w-[120px] text-sm outline-none"
                placeholder={field.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const tag = e.currentTarget.value.trim()
                    if (tag && !tags.includes(tag)) handleFieldChange(field.id, [...tags, tag])
                    e.currentTarget.value = ''
                  }
                }}
              />
            </div>
          </div>
        )
      }

      case 'list': {
        const items = Array.isArray(value) ? value : ['']
        const list = items.length === 0 ? [''] : items
        return (
          <div className="flex flex-col gap-2">
            {list.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className={baseInput}
                  value={item}
                  placeholder={field.placeholder}
                  onChange={(e) => {
                    const next = [...list]
                    next[i] = e.target.value
                    handleFieldChange(field.id, next)
                  }}
                />
                {list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleFieldChange(field.id, list.filter((_, idx) => idx !== i))}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => handleFieldChange(field.id, [...list, ''])}
              className="inline-flex w-fit items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
            >
              <Plus className="w-3.5 h-3.5" /> 添加一条
            </button>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {visibleSections.map((section) => (
        <section
          key={section.id}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{section.title}</h2>
          <div className="flex flex-col gap-5">
            {section.fields.map((field) => (
              <div key={field.id}>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  {field.required && <span className="mr-0.5 text-red-500">*</span>}
                  {field.question}
                </label>
                {field.description && (
                  <p className="mb-2 text-xs text-gray-500">{field.description}</p>
                )}
                {renderField(field)}
                <FieldError message={errors[field.id] ?? null} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center justify-between">
        {hasAdvanced ? (
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showAdvanced ? '收起高级选项' : '展开高级选项（补充信息，选填）'}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? '提交中…' : '提交'}
        </button>
      </div>
    </div>
  )
}

export default FormStep
