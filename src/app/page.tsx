"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  CreditCard,
  FlaskConical,
  GitBranch,
  History,
  Layers3,
  Loader2,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Truck,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { scenarios } from "@/lib/types";
import type { Run, RunEvent, ScenarioId, Strategy } from "@/lib/types";
type View = "studio" | "history" | "compare" | "connections" | "guide";
const serviceIcons = {
  inventory: Box,
  payment: CreditCard,
  delivery: Truck,
  workflow: GitBranch,
};
export default function Home() {
  const [view, setView] = useState<View>("studio");
  const [interactive, setInteractive] = useState(false);
  const [scenario, setScenario] = useState<ScenarioId>("lost-response");
  const [strategy, setStrategy] = useState<Strategy>("baseline");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [result, setResult] = useState<Run | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [services, setServices] = useState<
    { name: string; online: boolean; address?: string }[]
  >([]);
  const [transport, setTransport] = useState("direct-http");
  const [managedServices, setManagedServices] = useState<string[]>([]);
  const [location, setLocation] = useState('local');
  const [selectedEvent, setSelectedEvent] = useState<RunEvent | null>(null);
  const running = useRef(false);
  const trace = useRef<HTMLDivElement>(null);
  const preset = scenarios.find((s) => s.id === scenario)!;
  async function health() {
    try {
      const r = await fetch("/api/health");
      if (!r.ok) throw Error();
      const data = await r.json();
      setServices(data.services);
      setTransport(data.transport);
      setManagedServices(data.gatewayServices || []);
      setLocation(data.location || 'local');
    } catch {
      setServices([]);
      setManagedServices([]);
    }
  }
  async function history() {
    try {
      const r = await fetch("/api/runs");
      if (!r.ok) {
        const data = await r.json().catch(() => null);
        if (r.status === 503) {
          setError(data?.error || "The hosted backend is not connected yet. The interface is online; complete VPS setup to run rehearsals.");
          return;
        }
        throw Error(data?.error || "Run history could not be loaded.");
      }
      setRuns(await r.json());
    } catch {
      setError("Run history could not be loaded. Try refreshing.");
    }
  }
  useEffect(() => {
    setInteractive(true);
    void history();
    void health();
    const interval = setInterval(() => void health(), 15000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (busy && trace.current) trace.current.scrollTo({top:trace.current.scrollHeight,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }, [events, busy]);
  function choose(id: ScenarioId) {
    if (busy) return;
    setScenario(id);
    setResult(null);
    setEvents([]);
    setError("");
    setSelectedEvent(null);
  }
  async function launch(nextStrategy = strategy) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setEvents([]);
    setResult(null);
    setSelectedEvent(null);
    setView("studio");
    setStrategy(nextStrategy);
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, strategy: nextStrategy }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(()=>null);
        throw Error(data?.error || 'Could not start the rehearsal.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "event") {
            setEvents((e) => [...e, msg.event]);
            // Presentation pacing only. The report keeps the server's real timings.
            if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve=>setTimeout(resolve,140));
          }
          if (msg.type === "result") {
            setResult(msg.run);
            completed = true;
          }
          if (msg.type === "error") throw Error(msg.message);
        }
      }
      if (!completed)
        throw Error(
          "The connection ended before a result arrived. Check run history before retrying.",
        );
      await history();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed.");
    } finally {
      setBusy(false);
      running.current = false;
      void health();
    }
  }
  function load(run: Run) {
    setScenario(run.scenario);
    setStrategy(run.strategy);
    setResult(run);
    setEvents(run.events);
    setSelectedEvent(null);
    setView("studio");
    setError("");
  }
  function download(run: Run) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `rehearsal-${run.scenario}-${run.strategy}-${run.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const nav = [
    { id: "studio", icon: FlaskConical, title: "Rehearsal studio" },
    { id: "history", icon: History, title: "Run history" },
    { id: "compare", icon: Layers3, title: "Compare strategies" },
    { id: "connections", icon: Unplug, title: "Connections" },
    { id: "guide", icon: BookOpen, title: "Field guide" },
  ] as const;
  const online = services.length === 3 && services.every((s) => s.online);
  const activeService = busy ? events.at(-1)?.service : undefined;
  const title = {
    studio: "Rehearsal studio",
    history: "Run history",
    compare: "Compare strategies",
    connections: "Connections",
    guide: "Field guide",
  }[view];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Rehearsal home">
          <span className="brand-mark">
            <GitBranch size={24} />
          </span>
          rehearsal<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">R</span>
          <div>
            Personal workspace<small>{location === 'hosted' ? 'Hosted HTTP sandbox' : 'Local development'}</small>
          </div>
          <span className="version">01</span>
        </div>
        <div className="nav-caption">WORKBENCH</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              disabled={!interactive || (busy && n.id !== "studio")}
              aria-current={view === n.id ? "page" : undefined}
              title={n.title}
              onClick={() => setView(n.id)}
              className={view === n.id ? "nav active" : "nav"}
            >
              <n.icon size={18} />
              {n.title}
              {n.id === "history" && (
                <span className="nav-count">{runs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="lab-note">
            <FlaskConical size={21} />
            <strong>A safe place to fail.</strong>
            <p>
              Rehearse the unexpected.
              <br />
              Ship with a little more certainty.
            </p>
            <span>ISOLATED SANDBOX</span>
          </div>
          <div className="profile">
            <span>KT</span>
            <div>
              Your engineering lab<small>Rehearsal · v0.1</small>
            </div>
            <CircleDot size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <div className="top-actions">
            <span className={`connection-dot ${online ? "online" : ""}`} />
            <span>{online ? "Sandbox online" : "Sandbox unavailable"}</span>
            <span className="local-tag">{location === 'hosted' ? 'HOSTED' : 'LOCAL'}</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">BUILD CONFIDENCE BEFORE PRODUCTION</div>
              <h1>
                {title}
                <span>.</span>
              </h1>
              <p>
                {view === "studio"
                  ? "Find out what happens when your happy path takes a wrong turn."
                  : view === "history"
                    ? "Every attempt tells you something. Keep the evidence."
                    : view === "compare"
                      ? "Same fault. Different decisions. See what actually changed."
                      : view === "connections"
                        ? "Know exactly where your requests are going."
                        : "A small guide to the things a timeout cannot tell you."}
              </p>
            </div>
            {view === "studio" && (
              <button
                className="button secondary"
                onClick={() => setView("guide")}
              >
                <BookOpen size={16} />
                How it works
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {view === "studio" && (
            <>
              <section className={`workflow-panel ${busy ? 'is-running' : ''}`} aria-busy={busy}>
                <div className="section-top">
                  <div>
                    <span className="eyebrow muted">YOUR WORKFLOW</span>
                    <h2>One order. Three moving parts.</h2>
                  </div>
                  <span className="tag">
                    <span className="connection-dot online" />
                    HTTP sandbox
                  </span>
                </div>
                <div className="workflow-graph">
                  {(["inventory", "payment", "delivery"] as const).map(
                    (name, i) => {
                      const Icon = serviceIcons[name];
                      const ev = events
                        .filter((e) => e.service === name)
                        .at(-1);
                      return (
                        <div className="node-group" key={name}>
                          <div className={`service-node ${ev?.status || ""} ${activeService === name ? 'is-active' : ''}`}>
                            <div className="node-top">
                              <span className="node-icon">
                                <Icon size={21} />
                              </span>
                              <span className="mono">0{i + 1}</span>
                              {ev && (
                                <span className={`node-light ${ev.status}`} />
                              )}
                            </div>
                            <strong>
                              {name === "inventory"
                                ? "Reserve stock"
                                : name === "payment"
                                  ? "Authorize payment"
                                  : "Book delivery"}
                            </strong>
                            <small>
                              {name === "inventory"
                                ? "Inventory service"
                                : name === "payment"
                                  ? "Payment sandbox"
                                  : "Delivery provider"}
                            </small>
                            <div className="node-footer">
                              <span>POST</span>/execute
                            </div>
                          </div>
                          {i < 2 && (
                            <div className={`node-connector ${busy && (activeService === name || activeService === (i===0?'payment':'delivery')) ? 'is-flowing' : ''}`}>
                              <span />
                              <ArrowRight size={15} />
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
                <div className="workflow-bottom">
                  <ShieldCheck size={15} />
                  <span>Isolated per run</span>
                  <span className="divider-dot">·</span>
                  <span>No real payments or deliveries</span>
                  <span className="workflow-transport">
                    {transport === "direct-http"
                      ? "Direct HTTP · gateway not connected"
                      : `Gateway route · ${managedServices.join(', ') || 'checking'}`}
                  </span>
                </div>
              </section>
              <div className="studio-columns">
                <section className="scenario-panel">
                  <div className="section-top">
                    <div>
                      <span className="eyebrow muted">
                        01 / SET THE CONDITIONS
                      </span>
                      <h2>Choose a failure scenario</h2>
                    </div>
                  </div>
                  <div className="presets">
                    {scenarios.map((s, i) => (
                      <button
                        className={`preset ${s.id === scenario ? "selected" : ""}`}
                        disabled={!interactive || busy}
                        onClick={() => choose(s.id)}
                        key={s.id}
                      >
                        <span className="preset-number">0{i + 1}</span>
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.label}</small>
                        </span>
                        <span className="radio-indicator">
                          {s.id === scenario && <span />}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="scenario-description">
                    <span className="tag orange">
                      <Zap size={12} />
                      INJECTED FAULT
                    </span>
                    <p>{preset.description}</p>
                  </div>
                  <label className="control-label">Execution strategy</label>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Execution strategy"
                  >
                    <button
                      disabled={!interactive || busy}
                      className={strategy === "baseline" ? "chosen" : ""}
                      onClick={() => {
                        setStrategy("baseline");
                        setResult(null);
                        setEvents([]);
                      }}
                    >
                      Baseline
                    </button>
                    <button
                      disabled={!interactive || busy}
                      className={strategy === "recovery" ? "chosen" : ""}
                      onClick={() => {
                        setStrategy("recovery");
                        setResult(null);
                        setEvents([]);
                      }}
                    >
                      With recovery
                    </button>
                  </div>
                  <p className="strategy-hint">
                    {strategy === "baseline"
                      ? "Observe how a naive workflow handles the failure."
                      : preset.recovery}
                  </p>
                  <button
                    className="button primary run-button"
                    disabled={busy || !online}
                    onClick={() => void launch()}
                  >
                    {busy ? (
                      <Loader2 className="spin" size={17} />
                    ) : (
                      <Play size={16} fill="currentColor" />
                    )}
                    {busy ? "Rehearsal in progress…" : "Run rehearsal"}
                    <span>↵</span>
                  </button>
                </section>
                <section className="trace-panel">
                  <div className="section-top">
                    <div>
                      <span className="eyebrow muted">
                        02 / FOLLOW THE STORY
                      </span>
                      <h2>Execution trace</h2>
                    </div>
                    <span className={`tag ${busy ? "orange" : ""}`}>
                      <Radio size={12} />
                      {busy
                        ? "TRACE PLAYBACK"
                        : events.length
                          ? `${events.length} EVENTS`
                          : "READY"}
                    </span>
                  </div>
                  <div className="trace-scroll" ref={trace} aria-live="polite">
                    {events.length === 0 ? (
                      <div className="empty-trace">
                        <div className="trace-art">
                          <span />
                          <Activity size={37} />
                          <span />
                        </div>
                        <h3>Ready to run a rehearsal.</h3>
                        <p>
                          Choose a scenario and start a rehearsal.
                          <br />
                          Every request, retry and recovery will appear here.
                        </p>
                        <div className="empty-steps">
                          <span>REQUEST</span>
                          <ArrowRight size={13} />
                          <span>FAULT</span>
                          <ArrowRight size={13} />
                          <span>OUTCOME</span>
                        </div>
                      </div>
                    ) : (
                      events.map((e) => {
                        const Icon = serviceIcons[e.service];
                        return (
                          <button
                            className={`event-row ${e.status}`}
                            onClick={() => setSelectedEvent(e)}
                            key={e.id}
                          >
                            <span className="event-time">+{e.elapsed}ms</span>
                            <span className="event-icon">
                              <Icon size={15} />
                            </span>
                            <span className="event-copy">
                              <strong>{e.action}</strong>
                              <small>{e.detail}</small>
                            </span>
                            {e.code && (
                              <span className="event-code">{e.code}</span>
                            )}
                            <ChevronRight size={13} />
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="trace-footer">
                    <span
                      className={`connection-dot ${busy ? "online" : ""}`}
                    />
                    {busy
                      ? "Presenting observed events · original timings preserved"
                      : result
                        ? `Run ${result.id.slice(0, 8)} · ${result.duration}ms · ${result.transport}`
                        : "Waiting for a rehearsal"}
                    {result && (
                      <button
                        onClick={() => download(result)}
                        aria-label="Download run report"
                      >
                        <ArrowDownToLine size={16} />
                      </button>
                    )}
                  </div>
                </section>
              </div>
              <section className="outcome-panel">
                <div className="section-top">
                  <div>
                    <span className="eyebrow muted">
                      03 / CHECK WHAT MATTERS
                    </span>
                    <h2>Did the business rules hold?</h2>
                  </div>
                  {result ? (
                    <span
                      className={`tag ${result.outcome === "passed" ? "green" : "orange"}`}
                    >
                      {result.checks.filter((c) => c.passed).length}/4 CHECKS
                      PASSED
                    </span>
                  ) : (
                    <span className="muted small">
                      Results appear after a run
                    </span>
                  )}
                </div>
                <div className="checks-grid">
                  {(
                    result?.checks || [
                      { name: "Stock reserved once" },
                      { name: "Payment authorized once" },
                      { name: "One delivery per paid order" },
                      { name: "Payment outcome verified" },
                    ]
                  ).map((check, i) => {
                    const c = "passed" in check ? check : null;
                    return (
                      <div className="check-item" key={i}>
                        <span
                          className={`check-icon ${c ? (c.passed ? "passed" : "failed") : ""}`}
                        >
                          {c ? (
                            c.passed ? (
                              <Check size={17} />
                            ) : (
                              <X size={17} />
                            )
                          ) : (
                            <CircleDot size={17} />
                          )}
                        </span>
                        <div>
                          <strong>{check.name}</strong>
                          <small>{c ? c.actual : "Not evaluated yet"}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {result?.strategy === "baseline" && (
                  <div className="recovery-nudge">
                    <span>
                      <RotateCcw size={16} />
                      Now give the workflow a second chance.
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => void launch("recovery")}
                    >
                      Run with recovery <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "history" && (
            <section className="surface">
              <div className="section-top">
                <h2>
                  Saved rehearsals{" "}
                  <span className="muted">({runs.length})</span>
                </h2>
                <button
                  className="button secondary"
                  onClick={() => void history()}
                >
                  <RotateCcw size={15} />
                  Refresh
                </button>
              </div>
              {!runs.length ? (
                <div className="blank-state">
                  <History size={34} />
                  <h3>Your evidence starts here.</h3>
                  <p>
                    Run a scenario in the studio. {location === 'hosted' ? 'Reports are saved to your private browser workspace on the backend.' : 'Results are saved on this Mac.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setView("studio")}
                  >
                    Open studio <ArrowRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="history-list">
                  {runs.map((run) => (
                    <button
                      className="history-row"
                      onClick={() => load(run)}
                      key={run.id}
                    >
                      <span
                        className={`check-icon ${run.outcome === "passed" ? "passed" : "failed"}`}
                      >
                        {run.outcome === "passed" ? (
                          <Check size={16} />
                        ) : (
                          <X size={16} />
                        )}
                      </span>
                      <div>
                        <strong>
                          {scenarios.find((s) => s.id === run.scenario)?.name}
                        </strong>
                        <small>
                          {new Date(run.startedAt).toLocaleString()} ·{" "}
                          {run.id.slice(0, 8)}
                        </small>
                      </div>
                      <span className="tag">{run.strategy}</span>
                      <span className="mono">{run.duration}ms</span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {view === "compare" && (
            <>
              <div className="comparison-select">
                <label htmlFor="comparison-scenario">Scenario</label>
                <select
                  id="comparison-scenario"
                  value={scenario}
                  onChange={(e) => choose(e.target.value as ScenarioId)}
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="muted small">
                  Latest completed run for each strategy
                </span>
              </div>
              <div className="compare-grid">
                {(["baseline", "recovery"] as const).map((mode) => {
                  const run = runs.find(
                    (r) => r.scenario === scenario && r.strategy === mode,
                  );
                  return (
                    <section className="surface compare-card" key={mode}>
                      <span className="eyebrow muted">
                        {mode === "baseline" ? "BEFORE" : "AFTER"}
                      </span>
                      <h2>
                        {mode === "baseline"
                          ? "Baseline behavior"
                          : "With recovery"}
                      </h2>
                      {run ? (
                        <>
                          <div className={`big-result ${run.outcome}`}>
                            <span>
                              {run.checks.filter((c) => c.passed).length}
                              <small>/4</small>
                            </span>
                            <p>business checks passed</p>
                          </div>
                          {run.checks.map((c) => (
                            <div className="compare-check" key={c.name}>
                              {c.passed ? (
                                <CheckCircle2 size={17} />
                              ) : (
                                <X size={17} />
                              )}
                              <span>
                                {c.name}
                                <small>{c.actual}</small>
                              </span>
                            </div>
                          ))}
                          <div className="compare-footer">
                            <span>{run.duration}ms elapsed</span>
                            <button onClick={() => download(run)}>
                              <ArrowDownToLine size={15} />
                              Report
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="blank-state">
                          <FlaskConical size={27} />
                          <p>No {mode} run for this scenario yet.</p>
                          <button
                            className="button primary"
                            disabled={!online}
                            onClick={() => void launch(mode)}
                          >
                            Run {mode}
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
              <p className="footnote">
                Each run uses a fresh sandbox ledger. Durations are measured
                on the execution host and can vary; they are not production benchmarks.
              </p>
            </>
          )}
          {view === "connections" && (
            <div className="connections-grid">
              <section className="surface">
                <span className="eyebrow muted">ACTIVE RUNTIME</span>
                <h2>Three real HTTP services</h2>
                <p className="body-copy">
                  Every rehearsal sends network requests to isolated sandbox
                  providers. Their ledgers are the source of truth for each
                  result.
                </p>
                {["inventory", "payment", "delivery"].map((name, i) => (
                  <div className="connection-row" key={name}>
                    <span className="node-icon">
                      {name === "inventory" ? (
                        <Box size={20} />
                      ) : name === "payment" ? (
                        <CreditCard size={20} />
                      ) : (
                        <Truck size={20} />
                      )}
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <small>
                        {services.find((s) => s.name === name)?.address ||
                          "Checking endpoint…"}
                      </small>
                    </div>
                    <span
                      className={`tag ${services.find((s) => s.name === name)?.online ? "green" : "orange"}`}
                    >
                      {services.find((s) => s.name === name)?.online
                        ? "ONLINE"
                        : "OFFLINE"}
                    </span>
                  </div>
                ))}
                <button
                  className="button secondary"
                  onClick={() => void health()}
                >
                  <RotateCcw size={15} />
                  Check connection
                </button>
              </section>
              <section className="surface">
                <span className="eyebrow muted">WSO2 INTEGRATION</span>
                <h2>The managed API boundary</h2>
                <div className="integration-state">
                  <Unplug size={25} />
                  <strong>
                    {transport === "direct-http"
                      ? "Not connected"
                      : managedServices.length > 0 && managedServices.every(name => services.some(service => service.name === name && service.online))
                        ? "Gateway route online"
                        : "Gateway route needs attention"}
                  </strong>
                </div>
                <p className="body-copy">
                  {transport === "direct-http"
                    ? "This local setup calls the sandbox APIs directly. The public deployment routes delivery through WSO2 API Manager 4.7.0; inventory and payment stay on direct HTTP."
                    : `Managed services: ${managedServices.join(', ') || 'checking'}. Other providers stay on direct HTTP. OAuth credentials remain on the backend, never in your browser.`}
                </p>
                <p className="body-copy">
                  A health check confirms connectivity, not every policy.
                  The integration notes record separate token-rejection and
                  gateway-quota checks. The quota probe is isolated from
                  the sandbox failures you select here.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setView("guide")}
                >
                  Read the field guide <ArrowRight size={15} />
                </button>
              </section>
            </div>
          )}
          {view === "guide" && (
            <div className="guide-layout">
              <section className="surface prose">
                <span className="eyebrow muted">THE IDEA</span>
                <h2>A timeout is a question, not an answer.</h2>
                <p>
                  Your delivery API can accept an order and lose its reply. If
                  you immediately retry as a new operation, you may book two
                  deliveries. A successful HTTP response is only part of the
                  story.
                </p>
                <h3>Start with a controlled failure</h3>
                <p>
                  Pick Lost delivery response and run Baseline. The delivery provider
                  records a booking before delaying its response. Our
                  deliberately naive client retries with a new key. The final
                  ledger reveals two bookings.
                </p>
                <h3>Then change the decision</h3>
                <p>
                  Run With recovery. Both requests use the same operation key.
                  The provider recognizes the retry and returns the existing
                  booking. The business check now passes because one paid order
                  has exactly one delivery.
                </p>
                <h3>What the results prove</h3>
                <p>
                  Each run makes actual HTTP calls to isolated sandbox services.
                  Checks inspect their ledgers. The payment amount is a fixed
                  LKR 4,800 test authorization. There are no real financial
                  transactions. Evidence applies to these scenarios and this
                  implementation.
                </p>
                <h3>Why WSO2 belongs here</h3>
                <p>
                  API Manager provides the managed API boundary; Ballerina is
                  the planned integration runtime. The current runner is
                  TypeScript so the lab is usable before those runtimes are
                  configured. See docs/WSO2.md for the setup and verification
                  boundary.
                </p>
                <h3>What comes next</h3>
                <p>
                  Ballerina workflow execution, verified gateway enforcement,
                  custom contracts, persisted provider ledgers and team access.
                </p>
              </section>
              <aside className="surface guide-aside">
                <Code2 size={26} />
                <h3>Built to be inspected.</h3>
                <p>
                  Download a run report to see the timestamps, events, ledgers
                  and check results behind the UI.
                </p>
                <div className="guide-command">npm run dev</div>
                <small>Starts the app and all three sandbox providers.</small>
                <div className="guide-command">npm test</div>
                <small>Exercises failures and recovery over HTTP.</small>
              </aside>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <GitBranch size={13} /> REHEARSAL
            </span>
            <span>Small failures. Better decisions.</span>
            <span>v0.1 · {location === 'hosted' ? 'hosted HTTP sandbox' : 'local sandbox'}</span>
          </footer>
        </main>
      </div>
      {selectedEvent && (
        <EventDialog onClose={() => setSelectedEvent(null)}>
          <section className="event-modal" onClick={(e) => e.stopPropagation()}>
            <button
              autoFocus
              className="modal-close"
              aria-label="Close event details"
              onClick={() => setSelectedEvent(null)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSelectedEvent(null);
              }}
            >
              <X size={20} />
            </button>
            <span className="eyebrow muted">
              EVENT {selectedEvent.id} · {selectedEvent.service}
            </span>
            <h2 id="event-title">{selectedEvent.action}</h2>
            <p>{selectedEvent.detail}</p>
            <dl>
              <dt>Observed at</dt>
              <dd>{selectedEvent.at}</dd>
              <dt>Elapsed</dt>
              <dd>{selectedEvent.elapsed}ms</dd>
              <dt>Status</dt>
              <dd>{selectedEvent.status}</dd>
              {selectedEvent.code && (
                <>
                  <dt>HTTP status</dt>
                  <dd>{selectedEvent.code}</dd>
                </>
              )}
            </dl>
          </section>
        </EventDialog>
      )}
    </div>
  );
}

function EventDialog({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="native-dialog"
      aria-labelledby="event-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
