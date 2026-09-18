import { describe, expect, it } from 'vitest'
import { CircuitBreaker } from '../circuit-breaker.js'

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and recovers after a successful probe', () => {
    let now = 1_000
    const breaker = new CircuitBreaker(2, 500, () => now)

    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('closed')
    expect(breaker.canAttempt('model-a')).toBe(true)

    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('open')
    expect(breaker.canAttempt('model-a')).toBe(false)

    now += 500
    expect(breaker.getState('model-a')).toBe('half-open')
    expect(breaker.canAttempt('model-a')).toBe(true)
    expect(breaker.canAttempt('model-a')).toBe(false)

    breaker.recordSuccess('model-a')
    expect(breaker.getState('model-a')).toBe('closed')
  })

  it('reopens the circuit when the half-open probe fails', () => {
    let now = 0
    const breaker = new CircuitBreaker(1, 100, () => now)

    breaker.recordFailure('model-a')
    now = 100
    expect(breaker.canAttempt('model-a')).toBe(true)

    breaker.recordFailure('model-a')
    expect(breaker.getState('model-a')).toBe('open')
    expect(breaker.canAttempt('model-a')).toBe(false)
  })
})
