import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPolicy, createSuite, listPolicies, listSuites, Policy, Suite } from "./api";
import "./App.css";

function App() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState("");
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

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unknown";
    return parsed.toLocaleDateString();
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [policyList, suiteList] = await Promise.all([listPolicies(), listSuites()]);
      setPolicies(policyList);
      setSuites(suiteList);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load data";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
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

  return (
    <div className="page">
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
            <h3>Active model</h3>
            <p>Keep your model choice visible while you work.</p>
            <input
              type="text"
              placeholder="ollama: gpt-oss-20b"
              value={activeModel}
              onChange={(event) => setActiveModel(event.target.value)}
            />
          </div>
          <div className="panel-card">
            <h3>Status</h3>
            <ul>
              <li>API base: /api</li>
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
      </main>
    </div>
  );
}

export default App;
