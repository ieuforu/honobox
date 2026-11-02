import { useEffect, useRef, useState } from 'react'
import { Download, Pause, Play, SkipForward, X } from 'lucide-react'
import type { Trace } from './types'
import { readSnapshot, snapshotLimit, writeSnapshot } from './recordings'

export function Playback({
  trace,
  count,
  onChange,
}: {
  trace: Trace
  count: number
  onChange: (count: number) => void
}) {
  const [playing, setPlaying] = useState(false)
  const total = trace.events?.length ?? 0
  useEffect(() => {
    if (!playing || count >= total) return
    const timer = setTimeout(() => onChange(count + 1), 400)
    return () => clearTimeout(timer)
  }, [playing, count, total, onChange])
  const active = playing && count < total
  return (
    <div className="playback">
      <div className="playback-heading">
        <strong>Recording playback</strong>
        <span>No requests sent · one event every 400 ms</span>
      </div>
      <div className="playback-controls">
        <button
          className="secondary"
          onClick={() => {
            if (active) setPlaying(false)
            else {
              if (count >= total) onChange(0)
              setPlaying(true)
            }
          }}
          disabled={!total}
        >
          {active ? <Pause size={14} /> : <Play size={14} />}
          {active ? 'Pause' : 'Play'}
        </button>
        <input
          aria-label="Recorded event position"
          type="range"
          min={0}
          max={total}
          value={count}
          onChange={(e) => {
            setPlaying(false)
            onChange(Number(e.target.value))
          }}
        />
        <span className="mono">
          {count} / {total}
        </span>
        <button
          className="secondary"
          aria-label="Next recorded event"
          disabled={count >= total}
          onClick={() => {
            setPlaying(false)
            onChange(count + 1)
          }}
        >
          <SkipForward size={14} />
        </button>
        <button
          className="secondary"
          disabled={count === total}
          onClick={() => {
            setPlaying(false)
            onChange(total)
          }}
        >
          End
        </button>
      </div>
    </div>
  )
}

export function SnapshotDialog({
  trace,
  onClose,
  onImport,
}: {
  trace?: Trace
  onClose: () => void
  onImport: (trace: Trace) => void
}) {
  const [text, setText] = useState(() => (trace ? writeSnapshot(trace) : ''))
  const [error, setError] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), textarea',
        )
        const first = controls?.[0],
          last = controls?.[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('keydown', escape)
      previous?.focus()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="modal playground"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snapshot-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={close} className="modal-close" aria-label="Close snapshot" onClick={onClose}>
          <X size={18} />
        </button>
        <span className="eyebrow">LOCAL RECORDING</span>
        <h2 id="snapshot-title">{trace ? 'Export trace snapshot' : 'Open a trace snapshot'}</h2>
        <p>
          {trace
            ? 'Review the JSON before sharing. Prompts, responses and tool arguments may contain private data; this export does not automatically redact them.'
            : 'Paste a HonoBox JSON snapshot (up to 1 MiB). It stays in this page’s memory and is cleared on reload. Playback never calls a model or executes tools.'}
        </p>
        <label htmlFor="snapshot-json">Snapshot JSON</label>
        <textarea
          ref={input}
          id="snapshot-json"
          value={text}
          readOnly={Boolean(trace)}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
        />
        {error && (
          <p role="alert" className="snapshot-error">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={!text.trim()}
          onClick={() => {
            try {
              if (!trace) {
                onImport(readSnapshot(text))
                onClose()
                return
              }
              if (new TextEncoder().encode(text).length > snapshotLimit)
                throw new Error('Snapshot exceeds 1 MiB.')
              const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
              const link = document.createElement('a')
              link.href = url
              link.download = 'honobox-trace.json'
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        >
          {trace ? (
            <>
              <Download size={14} /> Download JSON
            </>
          ) : (
            <>
              <Play size={14} /> Open recording
            </>
          )}
        </button>
      </section>
    </div>
  )
}
