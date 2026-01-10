import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPolicy,
  createSuite,
  createRun,
  getOllamaHealth,
  getRun,
  listOllamaCatalog,
  listBuiltinSuites,
  listOllamaModels,
  listPolicies,
  listRunResults,
  listRuns,
  listSuites,
  importBuiltinSuite,
  pullOllamaModel
} from "./api";
import type { BuiltinSuite, OllamaModel, Policy, Run, RunResult, Suite } from "./api";
import "./App.css";

type RouteView = "overview" | "results";

const resolveRoute = (): RouteView => {
  if (typeof window === "undefined") return "overview";
  return window.location.pathname.startsWith("/results") ? "results" : "overview";
};

function App() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [catalogModels, setCatalogModels] = useState<OllamaModel[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<string | null>(null);
  const [ollamaHealth, setOllamaHealth] = useState<{ ok: boolean; error?: string } | null>(null);
  const [route, setRoute] = useState<RouteView>(resolveRoute());
  const [builtinSuites, setBuiltinSuites] = useState<BuiltinSuite[]>([]);
  const [builtinStatus, setBuiltinStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState("");
  const [pullModelName, setPullModelName] = useState("");
  const [pullStatus, setPullStatus] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<RunResult[]>([]);
  const [runningSuite, setRunningSuite] = useState(false);
  const [importingSuiteId, setImportingSuiteId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pass" | "fail">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [policyForm, setPolicyForm] = useState({
    title: "",
    content: "",
    summary: ""
  });
  const [suiteForm, setSuiteForm] = useState({
    name: "",
    description: "",
    policyId: ""
  });
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingSuite, setSavingSuite] = useState(false);

  const policyLookup = useMemo(() => {
    return new Map(policies.map((policy) => [policy.id, policy.title]));
  }, [policies]);

  const modelLookup = useMemo(() => {
    return new Map(ollamaModels.map((model) => [model.name, model]));
  }, [ollamaModels]);

  const selectedRun = useMemo(() => {
    return runs.find((run) => run.id === selectedRunId) ?? null;
  }, [runs, selectedRunId]);

  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return runResults.filter((result) => {
      if (filterStatus === "pass" && !result.passed) return false;
      if (filterStatus === "fail" && result.passed) return false;
      if (!term) return true;
      const haystack = [
        result.prompt,
        result.expected_outcome,
        result.response_excerpt ?? "",
        result.violations ? JSON.stringify(result.violations) : ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [filterStatus, runResults, searchTerm]);

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unknown";
    return parsed.toLocaleDateString();
  };

  const formatDateTime = (value: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unknown";
    return parsed.toLocaleString();
  };

  const formatBytes = (value?: number) => {
    if (typeof value !== "number") return "Unknown size";
    const mb = value / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [policyList, suiteList, runList] = await Promise.all([
        listPolicies(),
        listSuites(),
        listRuns()
      ]);
      setPolicies(policyList);
      setSuites(suiteList);
      setRuns(runList);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load data";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  const loadOllama = async () => {
    setRefreshingModels(true);
    setPullStatus(null);
    try {
      const health = await getOllamaHealth();
      setOllamaHealth(health);
      if (health.ok) {
        const models = await listOllamaModels();
        setOllamaModels(models);
        if (!activeModel && models.length > 0) {
          setActiveModel(models[0].name);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reach Ollama";
      setOllamaHealth({ ok: false, error: message });
    } finally {
      setRefreshingModels(false);
    }
  };

  const loadCatalog = async () => {
    setRefreshingCatalog(true);
    setCatalogStatus(null);
    try {
      const models = await listOllamaCatalog();
      setCatalogModels(models);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load catalog";
      setCatalogStatus(message);
    } finally {
      setRefreshingCatalog(false);
    }
  };

  const navigate = (path: string) => {
    if (typeof window === "undefined") return;
    window.history.pushState({}, "", path);
    setRoute(resolveRoute());
  };

  useEffect(() => {
    const handlePopState = () => setRoute(resolveRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const loadBuiltinSuites = async () => {
    setBuiltinStatus(null);
    try {
      const suites = await listBuiltinSuites();
      setBuiltinSuites(suites);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load built-in suites";
      setBuiltinStatus(message);
    }
  };

  useEffect(() => {
    void loadData();
    void loadOllama();
    void loadCatalog();
    void loadBuiltinSuites();
  }, []);

  const handlePolicySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!policyForm.title.trim() || !policyForm.content.trim()) return;
    setSavingPolicy(true);
    setErrorMessage(null);
    try {
      await createPolicy({
        title: policyForm.title.trim(),
        content: policyForm.content.trim(),
        summary: policyForm.summary.trim() || undefined
      });
      setPolicyForm({ title: "", content: "", summary: "" });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create policy";
      setErrorMessage(message);
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSuiteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!suiteForm.name.trim()) return;
    setSavingSuite(true);
    setErrorMessage(null);
    try {
      await createSuite({
        name: suiteForm.name.trim(),
        description: suiteForm.description.trim() || undefined,
        policy_id: suiteForm.policyId.trim() || undefined
      });
      setSuiteForm({ name: "", description: "", policyId: "" });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create suite";
      setErrorMessage(message);
    } finally {
      setSavingSuite(false);
    }
  };

  const handlePullModel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pullModelName.trim()) return;
    setPulling(true);
    setPullStatus(null);
    setErrorMessage(null);
    try {
      const result = await pullOllamaModel(pullModelName.trim());
      setPullStatus(`Pull status: ${result.status}`);
      await loadOllama();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to pull model";
      setPullStatus(`Pull failed: ${message}`);
      setErrorMessage(message);
    } finally {
      setPulling(false);
    }
  };

  const handleRunSuite = async () => {
    if (!selectedSuiteId || !activeModel) return;
    setRunningSuite(true);
    setErrorMessage(null);
    try {
      const run = await createRun({ suite_id: selectedSuiteId, model_name: activeModel });
      setRuns((prev) => [run, ...prev.filter((item) => item.id !== run.id)]);
      setSelectedRunId(run.id);
      setRunResults([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to run suite";
      setErrorMessage(message);
    } finally {
      setRunningSuite(false);
    }
  };

  const handleSelectRun = async (runId: string) => {
    if (!runId) {
      setSelectedRunId(null);
      setRunResults([]);
      return;
    }
    setSelectedRunId(runId);
    setErrorMessage(null);
    try {
      const results = await listRunResults(runId);
      setRunResults(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load run results";
      setErrorMessage(message);
    }
  };

  useEffect(() => {
    if (!selectedRunId) return;
    let active = true;
    let timeout: number | undefined;

    const poll = async () => {
      try {
        const run = await getRun(selectedRunId);
        if (!active) return;
        setRuns((prev) => {
          const next = prev.filter((item) => item.id !== run.id);
          return [run, ...next];
        });
        const results = await listRunResults(selectedRunId);
        if (!active) return;
        setRunResults(results);
        if (run.status === "running") {
          timeout = window.setTimeout(poll, 1500);
        }
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Failed to refresh run";
        setErrorMessage(message);
      }
    };

    void poll();

    return () => {
      active = false;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [selectedRunId]);

  const progressPercent =
    selectedRun && selectedRun.total_cases > 0
      ? Math.round((selectedRun.completed_cases / selectedRun.total_cases) * 100)
      : 0;

  const handleImportSuite = async (suite: BuiltinSuite) => {
    setImportingSuiteId(suite.id);
    setImportStatus(null);
    setErrorMessage(null);
    try {
      const result = await importBuiltinSuite({ suite: suite.id });
      setImportStatus(`Imported ${result.name} (${result.cases} cases)`);
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import suite";
      setImportStatus(`Import failed: ${message}`);
      setErrorMessage(message);
    } finally {
      setImportingSuiteId(null);
    }
  };

  return (
    <div className="page">
      <nav className="top-nav">
        <button
          type="button"
          className={`nav-button ${route === "overview" ? "active" : ""}`}
          onClick={() => navigate("/")}
        >
          Overview
        </button>
        <button
          type="button"
          className={`nav-button ${route === "results" ? "active" : ""}`}
          onClick={() => navigate("/results")}
        >
          Results
        </button>
      </nav>

      {route === "overview" ? (
        <>
          <header className="hero">
            <div className="hero__content">
              <span className="eyebrow">Policy Studio</span>
              <h1>Shape model behavior with policies, suites, and evals.</h1>
              <p>
                Use the policy adapter to define what the model should and should not do, then turn those
                requirements into suites you can track over time.
              </p>
            </div>
            <div className="hero__panel">
              <div className="panel-card">
                <h3>Ollama models</h3>
                <p>View what is installed locally and pull new models.</p>
                <div className="model-controls">
                  <label>
                    Active model
                    <select
                      value={activeModel}
                      onChange={(event) => setActiveModel(event.target.value)}
                      disabled={ollamaModels.length === 0}
                    >
                      {ollamaModels.length === 0 ? <option value="">No models found</option> : null}
                      {ollamaModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void loadOllama()}
                    disabled={refreshingModels}
                  >
                    {refreshingModels ? "Refreshing..." : "Refresh list"}
                  </button>
                </div>
                <form className="pull-form" onSubmit={handlePullModel}>
                  <label>
                    Pull a model
                    <input
                      type="text"
                      list="ollama-catalog"
                      value={pullModelName}
                      onChange={(event) => setPullModelName(event.target.value)}
                      placeholder="gpt-oss:20b"
                    />
                  </label>
                  <datalist id="ollama-catalog">
                    {catalogModels.map((model) => (
                      <option key={model.name} value={model.name} />
                    ))}
                  </datalist>
                  <button type="submit" disabled={pulling}>
                    {pulling ? "Pulling..." : "Download"}
                  </button>
                </form>
                <div className="catalog-meta">
                  <span>Catalog source: Ollama public registry</span>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void loadCatalog()}
                    disabled={refreshingCatalog}
                  >
                    {refreshingCatalog ? "Refreshing catalog..." : "Refresh catalog"}
                  </button>
                </div>
                {catalogStatus ? <p className="status">Catalog error: {catalogStatus}</p> : null}
                {pullStatus ? <p className="status">{pullStatus}</p> : null}
              </div>
              <div className="panel-card">
                <h3>Status</h3>
                <ul>
                  <li>API base: /api</li>
                  <li>
                    Ollama: {ollamaHealth?.ok ? "Connected" : "Unavailable"}
                    {ollamaHealth?.error ? ` (${ollamaHealth.error})` : ""}
                  </li>
                  <li>
                    Catalog: {catalogModels.length > 0 ? `${catalogModels.length} models` : "No catalog"}
                  </li>
                  <li>Policies loaded: {policies.length}</li>
                  <li>Suites loaded: {suites.length}</li>
                </ul>
              </div>
            </div>
          </header>

          {errorMessage ? <div className="alert">Error: {errorMessage}</div> : null}

          <main className="content">
            <section className="panel fade-in" style={{ animationDelay: "0.05s" }}>
              <div className="panel__header">
                <div>
                  <h2>Policies</h2>
                  <p>Capture the guardrails you want enforced before a model response is accepted.</p>
                </div>
              </div>
              <div className="panel__body">
                <form className="form" onSubmit={handlePolicySubmit}>
                  <label>
                    Title
                    <input
                      type="text"
                      value={policyForm.title}
                      onChange={(event) => setPolicyForm({ ...policyForm, title: event.target.value })}
                      placeholder="PII protection rules"
                    />
                  </label>
                  <label>
                    Summary (optional)
                    <input
                      type="text"
                      value={policyForm.summary}
                      onChange={(event) => setPolicyForm({ ...policyForm, summary: event.target.value })}
                      placeholder="Short description"
                    />
                  </label>
                  <label>
                    Policy text
                    <textarea
                      value={policyForm.content}
                      onChange={(event) => setPolicyForm({ ...policyForm, content: event.target.value })}
                      placeholder="Paste the policy requirements here..."
                      rows={6}
                    />
                  </label>
                  <button type="submit" disabled={savingPolicy}>
                    {savingPolicy ? "Saving..." : "Create policy"}
                  </button>
                </form>

                <div className="list">
                  <h3>Saved policies</h3>
                  {loading ? <p>Loading policies...</p> : null}
                  {!loading && policies.length === 0 ? <p className="muted">No policies yet.</p> : null}
                  {policies.map((policy) => (
                    <article className="list-item" key={policy.id}>
                      <div>
                        <h4>{policy.title}</h4>
                        <p>{policy.summary ?? "No summary yet."}</p>
                      </div>
                      <div className="meta">
                        <span>Created {formatDate(policy.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel fade-in" style={{ animationDelay: "0.15s" }}>
              <div className="panel__header">
                <div>
                  <h2>Suites</h2>
                  <p>Group related cases into suites you can run and compare.</p>
                </div>
              </div>
              <div className="panel__body">
                <form className="form" onSubmit={handleSuiteSubmit}>
                  <label>
                    Suite name
                    <input
                      type="text"
                      value={suiteForm.name}
                      onChange={(event) => setSuiteForm({ ...suiteForm, name: event.target.value })}
                      placeholder="Integrity checks"
                    />
                  </label>
                  <label>
                    Description (optional)
                    <input
                      type="text"
                      value={suiteForm.description}
                      onChange={(event) => setSuiteForm({ ...suiteForm, description: event.target.value })}
                      placeholder="What should this suite cover?"
                    />
                  </label>
                  <label>
                    Policy (optional)
                    <select
                      value={suiteForm.policyId}
                      onChange={(event) => setSuiteForm({ ...suiteForm, policyId: event.target.value })}
                    >
                      <option value="">No policy linked</option>
                      {policies.map((policy) => (
                        <option key={policy.id} value={policy.id}>
                          {policy.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={savingSuite}>
                    {savingSuite ? "Saving..." : "Create suite"}
                  </button>
                </form>

                <div className="list">
                  <h3>Saved suites</h3>
                  {loading ? <p>Loading suites...</p> : null}
                  {!loading && suites.length === 0 ? <p className="muted">No suites yet.</p> : null}
                  {suites.map((suite) => (
                    <article className="list-item" key={suite.id}>
                      <div>
                        <h4>{suite.name}</h4>
                        <p>{suite.description ?? "No description yet."}</p>
                        <span className="tag">
                          {suite.policy_id ? `Policy: ${policyLookup.get(suite.policy_id) ?? "Unknown"}` : "No policy"}
                        </span>
                      </div>
                      <div className="meta">
                        <span>Created {formatDate(suite.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel fade-in" style={{ animationDelay: "0.25s" }}>
              <div className="panel__header">
                <div>
                  <h2>Installed models</h2>
                  <p>Ollama stores weights locally. Use this view to confirm what is available.</p>
                </div>
              </div>
              <div className="panel__body">
                {refreshingModels ? <p>Loading models...</p> : null}
                {!refreshingModels && ollamaModels.length === 0 ? (
                  <p className="muted">No models found. Use the pull form to download one.</p>
                ) : null}
                <div className="model-list">
                  {ollamaModels.map((model) => (
                    <article className="model-item" key={model.name}>
                      <div>
                        <h4>{model.name}</h4>
                        <p>
                          {model.details?.family ?? "model"} · {model.details?.parameter_size ?? "size unknown"} ·{" "}
                          {model.details?.quantization_level ?? "quantization n/a"}
                        </p>
                        <span className="tag">{model.name === activeModel ? "Active model" : "Ready"}</span>
                      </div>
                      <div className="meta">
                        <span>{formatBytes(model.size)}</span>
                        <span>Updated {formatDate(model.modified_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
                {activeModel ? (
                  <div className="model-detail">
                    <h3>Active model details</h3>
                    <p>
                      {activeModel} · {formatBytes(modelLookup.get(activeModel)?.size)} ·{" "}
                      {modelLookup.get(activeModel)?.details?.format ?? "format unknown"}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="panel fade-in" style={{ animationDelay: "0.3s" }}>
              <div className="panel__header">
                <div>
                  <h2>Built-in suites</h2>
                  <p>Import curated suites bundled with this repo.</p>
                </div>
              </div>
              <div className="panel__body">
                {builtinStatus ? <p className="status">Error: {builtinStatus}</p> : null}
                <div className="list">
                  {builtinSuites.length === 0 ? <p className="muted">No built-in suites found.</p> : null}
                  {builtinSuites.map((suite) => (
                    <article className="list-item" key={suite.id}>
                      <div>
                        <h4>{suite.name}</h4>
                        <p>{suite.description}</p>
                      </div>
                      <div className="meta">
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => void handleImportSuite(suite)}
                          disabled={importingSuiteId === suite.id}
                        >
                          {importingSuiteId === suite.id ? "Importing..." : "Import"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {importStatus ? <p className="status">{importStatus}</p> : null}
              </div>
            </section>

            <section className="panel fade-in" style={{ animationDelay: "0.4s" }}>
              <div className="panel__header">
                <div>
                  <h2>Run a suite</h2>
                  <p>Execute a suite against the active model and track progress.</p>
                </div>
              </div>
              <div className="panel__body">
                <div className="run-controls">
                  <label>
                    Suite
                    <select
                      value={selectedSuiteId}
                      onChange={(event) => setSelectedSuiteId(event.target.value)}
                    >
                      <option value="">Select a suite</option>
                      {suites.map((suite) => (
                        <option key={suite.id} value={suite.id}>
                          {suite.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Model
                    <select value={activeModel} onChange={(event) => setActiveModel(event.target.value)}>
                      {ollamaModels.length === 0 ? <option value="">No models found</option> : null}
                      {ollamaModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => void handleRunSuite()} disabled={runningSuite}>
                    {runningSuite ? "Running..." : "Run suite"}
                  </button>
                </div>

                <div className="list">
                  <h3>Recent runs</h3>
                  {runs.length === 0 ? <p className="muted">No runs yet.</p> : null}
                  {runs.map((run) => (
                    <article
                      className={`list-item ${run.id === selectedRunId ? "selected" : ""}`}
                      key={run.id}
                      onClick={() => void handleSelectRun(run.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div>
                        <h4>{run.status}</h4>
                        <p>
                          Suite {run.suite_id.slice(0, 8)} · Model {run.model_id.slice(0, 8)}
                        </p>
                        <p>
                          Progress {run.completed_cases}/{run.total_cases}
                        </p>
                      </div>
                      <div className="meta">
                        <span>Started {formatDateTime(run.created_at)}</span>
                        <span>Completed {formatDateTime(run.completed_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="run-summary">
                  <div>
                    <h3>Selected run</h3>
                    <p>
                      {selectedRun
                        ? `Status: ${selectedRun.status} · ${selectedRun.completed_cases}/${selectedRun.total_cases}`
                        : "Select a run to view progress."}
                    </p>
                    {selectedRun ? (
                      <p>
                        Started {formatDateTime(selectedRun.created_at)} · Completed{" "}
                        {formatDateTime(selectedRun.completed_at)}
                      </p>
                    ) : null}
                  </div>
                  <div className="progress">
                    <div className="progress-bar">
                      <span style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span>{selectedRun ? `${progressPercent}%` : "—"}</span>
                  </div>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => navigate("/results")}
                    disabled={!selectedRunId}
                  >
                    View full results
                  </button>
                </div>
              </div>
            </section>
          </main>
        </>
      ) : (
        <>
          {errorMessage ? <div className="alert">Error: {errorMessage}</div> : null}
          <main className="results-page">
            <header className="results-hero">
              <div>
                <h2>Run results</h2>
                <p>Explore outcomes, filter by status, and inspect model responses.</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => navigate("/")}>
                Back to overview
              </button>
            </header>
            <div className="results-toolbar">
              <label>
                Run
                <select
                  value={selectedRunId ?? ""}
                  onChange={(event) => handleSelectRun(event.target.value)}
                >
                  <option value="">Select a run</option>
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.status} · {run.created_at.slice(0, 10)} · {run.id.slice(0, 6)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status filter
                <select
                  value={filterStatus}
                  onChange={(event) =>
                    setFilterStatus(event.target.value as "all" | "pass" | "fail")
                  }
                >
                  <option value="all">All</option>
                  <option value="pass">Pass only</option>
                  <option value="fail">Fail only</option>
                </select>
              </label>
              <label>
                Search
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Filter by prompt or response..."
                />
              </label>
              <div className="run-metadata">
                <span>
                  Started {formatDateTime(selectedRun?.created_at ?? null)} · Completed{" "}
                  {formatDateTime(selectedRun?.completed_at ?? null)}
                </span>
                <span>
                  Progress {selectedRun?.completed_cases ?? 0}/{selectedRun?.total_cases ?? 0}
                </span>
              </div>
            </div>

            <div className="results">
              <div className="results-summary">
                <h3>Results</h3>
                <span>
                  Showing {filteredResults.length} of {selectedRun?.total_cases ?? 0}
                </span>
              </div>
              {!selectedRunId ? <p className="muted">Select a run to view results.</p> : null}
              {selectedRunId && runResults.length === 0 ? <p>No results yet.</p> : null}
              {filteredResults.length > 0 ? (
                <div className="results-table">
                  <div className="results-row header">
                    <span>Status</span>
                    <span>Expected</span>
                    <span>Prompt</span>
                    <span>Violations</span>
                    <span>Response</span>
                  </div>
                  {filteredResults.map((result) => (
                    <div className="results-row" key={result.id}>
                      <span className={result.passed ? "pill pass" : "pill fail"}>
                        {result.passed ? "Pass" : "Fail"}
                      </span>
                      <span>{result.expected_outcome}</span>
                      <span className="cell-text">{result.prompt}</span>
                      <span className="cell-text">
                        {result.violations ? JSON.stringify(result.violations) : "—"}
                      </span>
                      <span className="cell-text">{result.response_excerpt ?? "—"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </main>
        </>
      )}
    </div>
  );
}

export default App;
