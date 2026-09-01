import type {
  ModelConfig,
  ModelProviderInterface,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from './types.js'

export class OpenAIProvider implements ModelProviderInterface {
  constructor(private config: ModelConfig) {}

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        stream: false,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${text}`)
    }

    return response.json()
  }

  async *chatCompletionStream(req: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${text}`)
    }

    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
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
          if (jsonStr === '[DONE]') return

          try {
            yield JSON.parse(jsonStr) as ChatCompletionChunk
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim().startsWith('data:')) {
        const jsonStr = buffer.trim().slice(5).trim()
        if (jsonStr && jsonStr !== '[DONE]') {
          try {
            yield JSON.parse(jsonStr) as ChatCompletionChunk
          } catch {
            // Ignore
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}
