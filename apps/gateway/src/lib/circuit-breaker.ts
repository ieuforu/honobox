type CircuitState = 'closed' | 'open' | 'half-open'

interface CircuitEntry {
  failures: number
  openedAt?: number
  probeInFlight: boolean
}

export class CircuitBreaker {
  private readonly circuits = new Map<string, CircuitEntry>()

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownMs = 30_000,
    private readonly now = () => Date.now(),
  ) {}

  canAttempt(key: string): boolean {
    const entry = this.circuits.get(key)
    if (entry?.openedAt === undefined) return true

    if (this.now() - entry.openedAt < this.cooldownMs) return false
    if (entry.probeInFlight) return false

    entry.probeInFlight = true
    return true
  }

  recordSuccess(key: string): void {
    this.circuits.delete(key)
  }

  recordFailure(key: string): void {
    const entry = this.circuits.get(key) ?? { failures: 0, probeInFlight: false }

    if (entry.openedAt !== undefined) {
      entry.openedAt = this.now()
      entry.probeInFlight = false
      this.circuits.set(key, entry)
      return
    }

    entry.failures += 1
    if (entry.failures >= this.failureThreshold) {
      entry.openedAt = this.now()
      entry.probeInFlight = false
    }
    this.circuits.set(key, entry)
  }

  getState(key: string): CircuitState {
    const entry = this.circuits.get(key)
    if (entry?.openedAt === undefined) return 'closed'
    return this.now() - entry.openedAt >= this.cooldownMs ? 'half-open' : 'open'
  }

  reset(): void {
    this.circuits.clear()
  }
}

export const modelCircuitBreaker = new CircuitBreaker()
