import { messages } from "./messages";

export function apiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorMessage(body: unknown, status: number): string {
  if (status === 401) return messages.unauthorized;
  if (body && typeof body === "object") {
    if (
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof body.error.message === "string"
    ) {
      return body.error.message;
    }
    if ("detail" in body && Array.isArray(body.detail))
      return messages.validationError;
  }
  return status >= 500 ? messages.unavailable : messages.requestError;
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const signal = options.signal ?? AbortSignal.timeout(60000);
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      signal,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    body = await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) return null;
      throw error;
    });
  } catch (error) {
    throw new Error(
      (error instanceof DOMException && error.name === "TimeoutError") ||
        (signal.aborted && signal.reason?.name === "TimeoutError")
        ? messages.timeoutError
        : messages.networkError,
    );
  }
  if (!response.ok)
    throw new ApiError(response.status, errorMessage(body, response.status));
  if (body === null) throw new Error(messages.requestError);
  return body as T;
}

export function displayError(error: unknown): string {
  return error instanceof Error ? error.message : messages.requestError;
}
