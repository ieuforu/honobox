// Model Provider Types
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

// API Key Types
export interface ApiKey {
  id: string
  name: string
  key: string
  teamId: string
  rateLimit: number
  quota: number | null
  enabled: boolean
  createdAt: string
  lastUsedAt: string | null
}

// Stats Types
export interface UsageStats {
  totalRequests: number
  totalTokens: number
  avgLatencyMs: number
  errorRate: number
  byModel: Record<string, { requests: number; tokens: number }>
}

export interface RequestLog {
  id: string
  requestId: string
  model: string
  latencyMs: number
  statusCode: number
  totalTokens: number
  error: string | null
  timestamp: string
  status: string
}

// Provider Interface
export interface ModelProviderInterface {
  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>
  chatCompletionStream(req: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk>
}
