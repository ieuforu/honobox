import type { ModelConfig, ModelProviderInterface, ModelProvider } from './types.js'
import { OpenAIProvider } from './openai.js'
import { AnthropicProvider } from './anthropic.js'

export type { ModelConfig, ModelProviderInterface, ModelProvider }

// Default models configuration
const openaiBaseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'

export const defaultModels: ModelConfig[] = [
  {
    id: 'mimo-v2.5-pro',
    name: 'MiMo v2.5 Pro',
    provider: 'openai',
    baseUrl: openaiBaseUrl,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    enabled: !!process.env.OPENAI_API_KEY,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    baseUrl: openaiBaseUrl,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    enabled: !!process.env.OPENAI_API_KEY,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    baseUrl: openaiBaseUrl,
    apiKey: process.env.OPENAI_API_KEY ?? '',
    enabled: !!process.env.OPENAI_API_KEY,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    enabled: !!process.env.DEEPSEEK_API_KEY,
  },
]

// Model registry
const models = new Map<string, ModelConfig>(defaultModels.map(m => [m.id, m]))

export function getModel(modelId: string): ModelConfig | undefined {
  return models.get(modelId)
}

export function getEnabledModels(): ModelConfig[] {
  return Array.from(models.values()).filter(m => m.enabled)
}

export function addModel(config: ModelConfig): void {
  models.set(config.id, config)
}

export function removeModel(modelId: string): boolean {
  return models.delete(modelId)
}

// Provider factory
export function createProvider(config: ModelConfig): ModelProviderInterface {
  switch (config.provider) {
    case 'openai':
    case 'deepseek':
      return new OpenAIProvider(config)
    case 'anthropic':
      return new AnthropicProvider(config)
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}

// Get provider for a model
export function getProvider(modelId: string): ModelProviderInterface {
  const config = getModel(modelId)
  if (!config) {
    throw new Error(`Model not found: ${modelId}`)
  }
  if (!config.enabled) {
    throw new Error(`Model is disabled: ${modelId}`)
  }
  return createProvider(config)
}
