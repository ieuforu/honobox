const TOKEN_KEY = 'honobox.admin-token'

export function getAdminToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function isDemoModeEnabled(): Promise<boolean> {
  const response = await fetch('/api/demo/status')
  if (!response.ok) return false
  const body = (await response.json()) as { enabled?: boolean }
  return body.enabled === true
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  const response = await fetch('/api/admin/verify', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return response.ok
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAdminToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(input, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `Request failed (${response.status})`)
  }
  return response
}
