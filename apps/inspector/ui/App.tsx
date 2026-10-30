import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  FlaskConical,
  KeyRound,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  Square,
  Terminal,
  Unplug,
  X,
  Zap,
} from 'lucide-react'
import { assembleOutput, type Trace } from './types'

type Config = { liveConfigured: boolean; model: string; upstream: string; demo: boolean }
const scenarios = [
  { id: 'tool-call', title: 'Tool call', description: 'Watch arguments assemble', icon: Braces },
  {
    id: 'interrupted',
    title: 'Broken stream',
    description: 'A connection ends too early',
    icon: Unplug,
  },
  {
    id: 'upstream-error',
    title: 'Provider outage',
    description: 'An upstream HTTP 503',
    icon: Activity,
  },
  { id: 'timeout', title: 'Timeout', description: 'No response before the deadline', icon: Clock3 },
  { id: 'slow', title: 'Slow stream', description: 'Run it, then try cancelling', icon: Radio },
]
const failures = new Set(['failed', 'interrupted', 'timeout', 'cancelled'])
const ms = (value: number | null | undefined) =>
  value == null ? '—' : `${value.toLocaleString()} ms`
const pretty = (value: unknown) => JSON.stringify(value, null, 2)

export default function App() {
  const [traces, setTraces] = useState<Trace[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<Trace | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [connected, setConnected] = useState(false)
  const [settings, setSettings] = useState(false)
  const [playground, setPlayground] = useState(false)
  const [token, setToken] = useState(() => sessionStorage.getItem('honobox.inspector.admin') ?? '')
  const [gatewayToken, setGatewayToken] = useState(
    () => sessionStorage.getItem('honobox.inspector.gateway') ?? '',
  )
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)
  const controller = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined
    const [list, configuration] = await Promise.all([
      fetch('/api/traces', { headers }),
      fetch('/api/config', { headers }),
    ])
    if (!list.ok || !configuration.ok)
      throw new Error(
        list.status === 401
          ? 'Enter your inspector admin token in Connection.'
          : 'The inspector is unavailable. Check that the Go server is running.',
      )
    setTraces(await list.json())
    setConfig(await configuration.json())
    setConnected(true)
    setConnectionError('')
  }, [token])

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        await refresh()
      } catch (e) {
        if (active) {
          setConnected(false)
          setConnectionError(String((e as Error).message))
        }
      }
    }
    void load()
    const timer = setInterval(() => void load(), 1000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [refresh])

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`/api/traces/${selected}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!response.ok) return
        const item = await response.json()
        if (active) setDetail(item)
      } catch {
        /* The connection notice is managed by the list poll. */
      }
    }
    void load()
    const timer = setInterval(() => void load(), 450)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [selected, token])

  useEffect(() => () => controller.current?.abort(), [])

  const run = async (scenario?: string) => {
    if (config?.demo) {
      const sample = traces.find((item) => item.scenario === scenario)
      if (!sample) {
        setError('This saved example is not available yet.')
        return
      }
      setSelected(sample.id)
      setDetail(null)
      setTab('overview')
      return
    }
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    setTab('overview')
    setPlayground(false)
    try {
      if (!scenario) JSON.parse(body)
      const auth = scenario ? token : gatewayToken
      const response = await fetch(scenario ? `/api/lab/${scenario}` : '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        body: scenario ? undefined : body,
        signal: abort.signal,
      })
      const id = response.headers.get('X-Honobox-Trace-Id')
      if (id) {
        setSelected(id)
        setDetail(null)
      }
      const reader = response.body?.getReader()
      if (reader) {
        try {
          while (!(await reader.read()).done) {
            /* Go persists the observed stream. */
          }
        } finally {
          reader.releaseLock()
        }
      }
      if (!id && !response.ok)
        throw new Error(
          `Request rejected (${response.status}). Check Connection and the request body.`,
        )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      controller.current = null
      setBusy(false)
      try {
        await refresh()
      } catch {
        /* Polling retries connectivity. */
      }
    }
  }

  const rows = traces.filter(
    (item) =>
      (filter === 'all' ||
        (filter === 'failed' ? failures.has(item.status) : item.source === 'live')) &&
      `${item.id} ${item.model} ${item.status}`.toLowerCase().includes(search.toLowerCase()),
  )
  const output = assembleOutput(detail?.events)
  const successful = traces.filter((item) => item.status === 'completed').length
  const failed = traces.filter((item) => failures.has(item.status)).length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="HonoBox home">
          <span className="brand-symbol">H</span>
          <span>
            HonoBox<span className="brand-label">INSPECTOR</span>
          </span>
          <span className="version">0.1</span>
        </a>
        <button
          className="mobile-connection"
          aria-label="Connection settings"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={18} />
        </button>
        <div className="workspace">
          <span className="workspace-icon">
            <Layers3 size={17} />
          </span>
          <div>
            <strong>{config?.demo ? 'Demo workspace' : 'Inspector workspace'}</strong>
            <span>Go + TypeScript</span>
          </div>
          <span className={`connection-dot ${connected ? 'online' : ''}`} />
        </div>
        <div className="nav-item">
          <Activity size={16} /> Requests <span>{traces.length}</span>
        </div>
        <div className="lab-heading">
          <span>FAILURE LAB</span>
          <FlaskConical size={14} />
        </div>
        <p className="lab-description">
          {config?.demo
            ? 'Select a saved simulator example.'
            : 'Real requests to a local simulator.'}
          <br />
          {config?.demo ? 'Read-only. No model credits used.' : 'No model credits needed.'}
        </p>
        <div className="scenarios">
          {scenarios.map((item) => (
            <button key={item.id} disabled={busy || !connected} onClick={() => void run(item.id)}>
              <item.icon size={16} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <ChevronRight size={13} />
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-icon">
              <Terminal size={16} />
            </span>
            <div>
              <strong>Your traces stay here.</strong>
              <p>Stored in this inspector's SQLite file.</p>
            </div>
          </div>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings2 size={16} /> Connection <ArrowRight size={14} />
          </button>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={12} />
            <strong>Request inspector</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection-dot ${connected ? 'online' : ''}`} />
            {connected ? 'Inspector connected' : 'Connecting…'}
            <span className="topbar-divider" />
            <span className="mono">/v1/chat/completions</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">OBSERVE · UNDERSTAND · FIX</div>
              <h1>
                Request inspector<span className="heading-dot">.</span>
              </h1>
              <p>Follow the stream. Find where it breaks.</p>
            </div>
            <button
              className="primary"
              disabled={busy || !connected || config?.demo}
              title={config?.demo ? 'Connect as the owner to send real requests' : undefined}
              onClick={() => {
                setBody(
                  pretty({
                    model: config?.model ?? 'deepseek-flash',
                    messages: [
                      { role: 'user', content: 'Explain streaming in one short sentence.' },
                    ],
                    stream: true,
                    thinking: { type: 'disabled' },
                  }),
                )
                setPlayground(true)
              }}
            >
              <Plus size={16} /> New request
            </button>
          </div>
          {config?.demo && (
            <div className="demo-notice">
              <FlaskConical size={15} />
              <span>
                Read-only demo · explore saved failure scenarios. Private traces and live requests
                require owner access.
              </span>
              <button onClick={() => setSettings(true)}>
                Owner connection <ArrowRight size={13} />
              </button>
            </div>
          )}
          {(error || connectionError) && (
            <div role="alert" className="error-banner">
              {error || connectionError}
              <button
                aria-label="Dismiss error"
                onClick={() => {
                  setError('')
                  setConnectionError('')
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="stats-strip">
            <div>
              <span>Captured requests</span>
              <strong>
                {traces.length}
                <small>latest 100</small>
              </strong>
            </div>
            <div>
              <span>Completed</span>
              <strong>
                {successful}
                <small className="green">with a clean finish</small>
              </strong>
            </div>
            <div>
              <span>Needs attention</span>
              <strong>
                {failed}
                <small>errors, interruptions & cancellations</small>
              </strong>
            </div>
            <div>
              <span>Live provider</span>
              <strong className="provider-name">
                {config?.demo
                  ? 'Owner access'
                  : config?.liveConfigured
                    ? 'DeepSeek'
                    : 'Not configured'}
                <small>
                  {config?.demo
                    ? 'Connect to send live requests'
                    : config?.liveConfigured
                      ? config.model
                      : 'The local lab is ready to use'}
                </small>
              </strong>
            </div>
          </div>

          <section className="inspector-panel" aria-label="Request inspector">
            <div className="request-column">
              <div className="request-toolbar">
                <strong>
                  Requests <span>{rows.length}</span>
                </strong>
                {busy && <LoaderCircle size={15} className="spin" />}
              </div>
              <label className="search">
                <Search size={14} />
                <input
                  aria-label="Search requests"
                  placeholder="Search model, ID, status…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="filters">
                {[
                  ['all', 'All requests'],
                  ['failed', 'Attention'],
                  ['live', 'Live'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={filter === id ? 'active' : ''}
                    onClick={() => setFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="request-list">
                {rows.map((item) => (
                  <button
                    key={item.id}
                    className={`request-row ${selected === item.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelected(item.id)
                      setDetail(null)
                    }}
                  >
                    <div className="row-main">
                      <span className={`row-icon ${failures.has(item.status) ? 'bad' : ''}`}>
                        {item.status === 'running' ? (
                          <LoaderCircle className="spin" size={15} />
                        ) : (
                          <ArrowDownLeft size={16} />
                        )}
                      </span>
                      <div>
                        <strong>{item.model}</strong>
                        <span className="mono">{item.id.slice(0, 10)}</span>
                      </div>
                      <span className={`source ${item.source}`}>{item.source}</span>
                    </div>
                    <div className="row-meta">
                      <Status status={item.status} />
                      <span>{ms(item.durationMs)}</span>
                    </div>
                  </button>
                ))}
                {rows.length === 0 && (
                  <div className="list-empty">
                    {traces.length ? 'No matching requests.' : 'Your next request starts here.'}
                  </div>
                )}
              </div>
              <div className="list-footer">
                <span className="connection-dot online" /> Auto-refreshing · saved across restarts
              </div>
            </div>

            <div className="detail-column">
              {!selected ? (
                <div className="empty-state">
                  <div className="empty-graphic">
                    <span className="empty-line" />
                    <span className="empty-box">
                      <Braces size={27} />
                    </span>
                    <span className="empty-line" />
                    <span className="empty-small">
                      <Check size={17} />
                    </span>
                  </div>
                  <span className="eyebrow">A SMALL LAB FOR REAL FAILURE PATHS</span>
                  <h2>
                    Make a request.
                    <br />
                    See the whole story.
                  </h2>
                  <p>
                    Start with a simulated tool call, then explore
                    <br />
                    broken streams, timeouts, and cancellations.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || !connected}
                    onClick={() => void run('tool-call')}
                  >
                    <Play size={14} /> Run a tool-call example
                  </button>
                  <div className="empty-footnote">
                    <CircleHelp size={13} /> Lab traffic is synthetic and never calls DeepSeek.
                  </div>
                </div>
              ) : !detail ? (
                <div className="empty-state">
                  <LoaderCircle className="spin" size={24} />
                  <p>Loading trace…</p>
                </div>
              ) : (
                <>
                  <div className="detail-heading">
                    <div>
                      <span className="eyebrow">TRACE DETAIL</span>
                      <h2>
                        {detail.model}
                        <span className={`source ${detail.source}`}>
                          {detail.source === 'lab' ? 'Local lab' : 'Live'}
                        </span>
                      </h2>
                      <div className="trace-id mono">
                        {detail.id}
                        <button
                          aria-label="Copy trace ID"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(detail.id)
                              .then(() => {
                                setCopied(true)
                                setTimeout(() => setCopied(false), 1600)
                              })
                              .catch(() =>
                                setError('Clipboard access is unavailable in this browser.'),
                              )
                          }}
                        >
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                    <Status status={detail.status} />
                  </div>
                  <div className="tabs" role="tablist" aria-label="Trace views">
                    {[
                      ['overview', 'Overview'],
                      ['request', 'Request'],
                      ['events', 'Events'],
                      ['response', 'Raw response'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        role="tab"
                        aria-selected={tab === id}
                        className={tab === id ? 'active' : ''}
                        onClick={() => setTab(id)}
                      >
                        {label}
                        {id === 'events' && <span>{detail.events?.length ?? 0}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="detail-body">
                    {tab === 'overview' && (
                      <>
                        <div className="trace-metrics">
                          <div>
                            <span>Total duration</span>
                            <strong>{ms(detail.durationMs)}</strong>
                          </div>
                          <div>
                            <span>First output</span>
                            <strong>{ms(detail.firstOutputMs)}</strong>
                          </div>
                          <div>
                            <span>HTTP status</span>
                            <strong>{detail.httpStatus || 'Pending'}</strong>
                          </div>
                        </div>
                        {detail.error && (
                          <div className="trace-error">
                            <Unplug size={17} />
                            <div>
                              <strong>
                                {detail.status === 'interrupted'
                                  ? 'The stream ended early'
                                  : 'Request needs attention'}
                              </strong>
                              <p>{detail.error}</p>
                              {detail.httpStatus === 200 && (
                                <small>
                                  The HTTP connection started successfully; the stream's final state
                                  is shown separately.
                                </small>
                              )}
                            </div>
                          </div>
                        )}
                        {output.tools.map((tool) => (
                          <div className="output-card" key={tool.id || tool.name}>
                            <div className="card-heading">
                              <Braces size={15} />
                              <strong>{tool.name || 'Tool call'}</strong>
                              <span>assembled arguments</span>
                            </div>
                            <pre>{formatJSON(tool.arguments)}</pre>
                            <div className="card-footnote">
                              Model-requested tool call · execution stays with your application.
                            </div>
                          </div>
                        ))}
                        {output.text && (
                          <div className="output-card">
                            <div className="card-heading">
                              <Zap size={15} />
                              <strong>Streamed output</strong>
                            </div>
                            <p className="stream-output">
                              {output.text}
                              {detail.status === 'running' && <span className="cursor" />}
                            </p>
                          </div>
                        )}
                        <div className="timeline-heading">
                          <strong>Request timeline</strong>
                          <span>Observed by the gateway</span>
                        </div>
                        <div className="timeline">
                          {detail.events
                            ?.filter((event) => !['chunk', 'tool_delta'].includes(event.kind))
                            .map((event, index) => (
                              <div
                                className={`timeline-event ${failures.has(event.kind) || event.kind === 'provider_error' ? 'bad' : ''}`}
                                key={index}
                              >
                                <span className="timeline-point" />
                                <span className="event-time mono">+{event.ms} ms</span>
                                <div>
                                  <strong>{event.kind.replaceAll('_', ' ')}</strong>
                                  <span>{event.data}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                        {detail.truncated && (
                          <div className="capture-note">
                            Capture limit reached. This trace contains a partial recording;
                            forwarding continued.
                          </div>
                        )}
                      </>
                    )}
                    {tab === 'request' && (
                      <div className="code-view">
                        <div className="code-label">
                          <Braces size={14} /> Request body · provider headers are not recorded
                        </div>
                        <pre>{pretty(detail.request)}</pre>
                      </div>
                    )}
                    {tab === 'events' && (
                      <div className="events-view">
                        {detail.events?.map((event, index) => (
                          <details key={index}>
                            <summary>
                              <span className="mono">+{event.ms} ms</span>
                              <strong>{event.kind}</strong>
                              <ChevronRight size={13} />
                            </summary>
                            <pre>{formatJSON(event.data ?? '')}</pre>
                          </details>
                        ))}
                      </div>
                    )}
                    {tab === 'response' && (
                      <div className="code-view">
                        <div className="code-label">
                          <Terminal size={14} /> Captured response bytes
                        </div>
                        <pre>{detail.response || 'Waiting for response…'}</pre>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
          <footer className="page-footer">
            <span>HonoBox Inspector · first working slice</span>
            <span>
              <span className="lab-square" /> LAB = synthetic traffic{' '}
              <span className="live-square" /> LIVE = your configured provider
            </span>
          </footer>
        </main>
      </div>

      {busy && (
        <div className="running-notice" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>Request in progress</span>
          <button onClick={() => controller.current?.abort()}>
            <Square size={11} fill="currentColor" /> Cancel request
          </button>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close connection settings"
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </button>
            <KeyRound size={23} />
            <h2 id="connection-title">Inspector connection</h2>
            <p>
              For an authenticated inspector, enter its access tokens. These are separate from your
              provider API key and stay in this browser tab.
            </p>
            <label>
              Admin token
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              Gateway token
              <input
                type="password"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button
              className="primary"
              onClick={() => {
                sessionStorage.setItem('honobox.inspector.admin', token)
                sessionStorage.setItem('honobox.inspector.gateway', gatewayToken)
                setSettings(false)
                setError('')
                void refresh().catch((e) => setError(e.message))
              }}
            >
              Save connection <ArrowRight size={14} />
            </button>
          </section>
        </div>
      )}
      {playground && (
        <div className="modal-backdrop" onClick={() => setPlayground(false)}>
          <section
            className="modal playground"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close new request"
              onClick={() => setPlayground(false)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">LIVE REQUEST</span>
            <h2 id="request-title">Send through the gateway</h2>
            <p>
              {config?.liveConfigured
                ? 'This sends a real request using your server-configured provider.'
                : 'Live requests need DEEPSEEK_API_KEY in the Go server environment. You can use every local lab without it.'}
            </p>
            <label htmlFor="request-body">Chat Completions JSON</label>
            <textarea
              id="request-body"
              spellCheck={false}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <button
              className="primary"
              disabled={!config?.liveConfigured || busy}
              onClick={() => void run()}
            >
              <Play size={14} /> Send request
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

function Status({ status }: { status: string }) {
  return (
    <span className={`status ${status}`}>
      <span />
      {status}
    </span>
  )
}
function formatJSON(value: string) {
  try {
    return pretty(JSON.parse(value))
  } catch {
    return value
  }
}
