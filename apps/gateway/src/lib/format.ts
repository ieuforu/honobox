// 时间格式化工具 — 统一转北京时间
export function toShanghai(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}
