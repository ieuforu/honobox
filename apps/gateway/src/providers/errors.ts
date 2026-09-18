const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429])

export class ProviderRequestError extends Error {
  readonly retryable: boolean

  constructor(
    readonly provider: string,
    readonly status: number | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderRequestError'
    this.retryable =
      status === undefined || RETRYABLE_STATUS_CODES.has(status) || (status >= 500 && status < 600)
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function isRetryableProviderError(error: unknown): boolean {
  if (isAbortError(error)) return false
  if (error instanceof ProviderRequestError) return error.retryable

  // fetch reports connection failures as TypeError in Node and browsers.
  return error instanceof TypeError
}
