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
