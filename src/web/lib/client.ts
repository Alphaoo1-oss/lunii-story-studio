import type { ApiError } from "@shared/api";

// Erreur renvoyée par l'API locale, avec son message en français.
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined || body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError("network", "Le serveur de l'application ne répond pas. Est-il bien lancé ?", 0, null);
  }
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiRequestError(err?.code ?? "http", err?.message ?? `Erreur ${res.status}.`, res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Une erreur inattendue est survenue.";
}
