type ApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    value.ok === false &&
    "error" in value &&
    isRecord(value.error)
  );
}

export function buildErrorMessage(payload: unknown, fallback: string) {
  if (isApiErrorResponse(payload)) {
    const message = payload.error.message;
    return typeof message === "string" && message.length > 0 ? message : fallback;
  }

  return fallback;
}

export async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload: unknown = await response.json();

  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, `Request failed with status ${response.status}`));
  }

  return payload as T;
}
