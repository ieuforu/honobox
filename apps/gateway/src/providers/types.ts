export type ModelProvider = 'openai' | 'anthropic' | 'deepseek' | 'custom'

export interface ModelConfig {
  id: string
  name: string
  provider: ModelProvider
  baseUrl: string
  apiKey: string
  maxTokens?: number
  enabled: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface ChatCompletionChunk {
  id: string
  object: 'chat.completion.chunk'
  created: number
  model: string
  choices: Array<{
    index: number
    delta: { role?: string; content?: string }
    finish_reason: string | null
  }>
}

export interface ChatCompletionResponse {
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Array<{
    index: number
    message: ChatMessage
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ModelProviderInterface {
  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>
  chatCompletionStream(req: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk>
}
