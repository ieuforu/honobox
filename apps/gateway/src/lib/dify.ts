import { config } from '../config'

export interface DifyChatBody {
  query: string
  conversation_id?: string
  user: string
  response_mode: 'streaming'
}

export interface DifyStreamEvent {
  event: string
  answer?: string
  conversation_id?: string
  message_id?: string
  metadata?: {
    usage?: {
      prompt_tokens: number
      completion_tokens: number
    }
  }
  [key: string]: unknown
}

/**
 * 调用 Dify Chat API，返回 SSE 事件的 AsyncGenerator
 * 每次 yield 一个已解析的 JSON 事件
 */
export async function* callDify(
  body: DifyChatBody,
  signal?: AbortSignal,
): AsyncGenerator<DifyStreamEvent> {
  const res = await fetch(`${config.dify.baseUrl}/chat-messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.dify.apiKey}`,
    },
    body: JSON.stringify({ ...body, inputs: {}, response_mode: 'streaming' }),
    signal,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Dify API error ${res.status}: ${text}`)
  }

  if (!res.body) {
    throw new Error('Dify API returned empty body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr) continue
        try {
          yield JSON.parse(jsonStr) as DifyStreamEvent
        } catch {
          // 跳过无法解析的行
        }
      }
    }

    // 处理剩余 buffer
    if (buffer.trim().startsWith('data:')) {
      const jsonStr = buffer.trim().slice(5).trim()
      if (jsonStr) {
        try {
          yield JSON.parse(jsonStr) as DifyStreamEvent
        } catch {
          // 忽略
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
