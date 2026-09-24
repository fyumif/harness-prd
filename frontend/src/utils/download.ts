/**
 * 触发浏览器下载：把文本内容包成 Markdown Blob，
 * 用临时对象 URL 引导 <a> 点击，下载后立即释放 URL。
 */
export function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  // 释放临时对象，避免浏览器一直持有 Blob 引用
  URL.revokeObjectURL(url)
}
