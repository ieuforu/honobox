import type {
  ModelConfig,
  ModelProviderInterface,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from './types.js'

export class AnthropicProvider implements ModelProviderInterface {
  constructor(private config: ModelConfig) {}

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { system, messages } = this.extractSystemMessage(req.messages)

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.max_tokens ?? 4096,
        system,
        messages,
        stream: false,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${text}`)
    }

    const data = await response.json()

    // Convert Anthropic response to OpenAI format
    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: data.content[0]?.text ?? '' },
          finish_reason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: data.usage.input_tokens,
        completion_tokens: data.usage.output_tokens,
        total_tokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    }
  }

  async *chatCompletionStream(req: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk> {
    const { system, messages } = this.extractSystemMessage(req.messages)

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.max_tokens ?? 4096,
        system,
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Anthropic API error ${response.status}: ${text}`)
    }

    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const requestId = `anthropic-${Date.now()}`

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

          try {
            const event = JSON.parse(jsonStr)

            if (event.type === 'content_block_delta') {
              yield {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: event.delta?.text ?? '' },
                    finish_reason: null,
                  },
                ],
              }
            } else if (event.type === 'message_stop') {
              yield {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: req.model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: 'stop',
                  },
                ],
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private extractSystemMessage(messages: ChatCompletionRequest['messages']) {
    const system = messages.find((m) => m.role === 'system')?.content
    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    return { system, messages: rest }
  }
}
