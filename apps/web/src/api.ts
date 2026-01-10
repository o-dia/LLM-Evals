export type Policy = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

export type Suite = {
  id: string;
  policy_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type OllamaModel = {
  name: string;
  modified_at: string;
  size: number;
  digest?: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
};

export type BuiltinSuite = {
  id: string;
  name: string;
  description: string;
  filename: string;
};

export type Run = {
  id: string;
  suite_id: string;
  model_id: string;
  status: string;
  total_cases: number;
  completed_cases: number;
  passed_cases: number;
  failed_cases: number;
  created_at: string;
  completed_at: string | null;
};

export type RunResult = {
  id: string;
  run_id: string;
  case_id: string;
  passed: boolean;
  violations: unknown | null;
  response_excerpt: string | null;
  prompt: string;
  expected_outcome: string;
  expected_notes: string | null;
  created_at: string;
};

type ListResponse<T> = {
  data: T[];
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

const parseJson = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const requestJson = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });

  const payload = await parseJson(response);

  if (!response.ok) {
    const message = payload?.error ?? `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
};

export const listPolicies = async (): Promise<Policy[]> => {
  const response = await requestJson<ListResponse<Policy>>("/policies");
  return response.data;
};

export const createPolicy = async (input: {
  title: string;
  content: string;
  summary?: string;
}): Promise<Policy> => {
  return requestJson<Policy>("/policies", {
    method: "POST",
    body: JSON.stringify(input)
  });
};

export const listSuites = async (): Promise<Suite[]> => {
  const response = await requestJson<ListResponse<Suite>>("/suites");
  return response.data;
};

export const createSuite = async (input: {
  name: string;
  description?: string;
  policy_id?: string;
}): Promise<Suite> => {
  return requestJson<Suite>("/suites", {
    method: "POST",
    body: JSON.stringify(input)
  });
};

export const getOllamaHealth = async (): Promise<{ ok: boolean; error?: string }> => {
  return requestJson<{ ok: boolean; error?: string }>("/providers/ollama/health");
};

export const listOllamaModels = async (): Promise<OllamaModel[]> => {
  const response = await requestJson<{ models: OllamaModel[] }>("/providers/ollama/models");
  return response.models ?? [];
};

export const listOllamaCatalog = async (): Promise<OllamaModel[]> => {
  const response = await requestJson<{ models: OllamaModel[] }>("/providers/ollama/catalog");
  return response.models ?? [];
};

export const pullOllamaModel = async (model: string): Promise<{
  status: string;
  details?: Record<string, unknown> | null;
  updates?: Array<Record<string, unknown> | string>;
}> => {
  return requestJson("/providers/ollama/pull", {
    method: "POST",
    body: JSON.stringify({ model })
  });
};

export const listBuiltinSuites = async (): Promise<BuiltinSuite[]> => {
  const response = await requestJson<{ suites: BuiltinSuite[] }>("/suites/builtin");
  return response.suites ?? [];
};

export const importBuiltinSuite = async (input: {
  suite: string;
  name?: string;
  description?: string;
  policy_id?: string;
}): Promise<{ id: string; name: string; cases: number }> => {
  return requestJson("/suites/builtin/import", {
    method: "POST",
    body: JSON.stringify(input)
  });
};

export const listRuns = async (): Promise<Run[]> => {
  const response = await requestJson<ListResponse<Run>>("/runs");
  return response.data;
};

export const createRun = async (input: {
  suite_id: string;
  model_name: string;
}): Promise<Run> => {
  return requestJson<Run>("/runs", {
    method: "POST",
    body: JSON.stringify(input)
  });
};

export const listRunResults = async (runId: string): Promise<RunResult[]> => {
  const response = await requestJson<ListResponse<RunResult>>(`/runs/${runId}/results`);
  return response.data;
};

export const getRun = async (runId: string): Promise<Run> => {
  return requestJson<Run>(`/runs/${runId}`);
};
