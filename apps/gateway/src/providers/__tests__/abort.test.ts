import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAIProvider } from '../openai.js'

describe('OpenAIProvider cancellation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('passes the downstream AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'response',
          object: 'chat.completion',
          created: 1,
          model: 'test-model',
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const provider = new OpenAIProvider({
      id: 'test-model',
      name: 'Test',
      provider: 'openai',
      baseUrl: 'https://provider.test/v1',
      apiKey: 'secret',
      enabled: true,
    })

    await provider.chatCompletion({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
      signal: controller.signal,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.test/v1/chat/completions',
      expect.objectContaining({ signal: controller.signal }),
    )
  })
})
