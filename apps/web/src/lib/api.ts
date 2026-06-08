"use client";

const TOKEN_KEY = "promohub.accessToken";
const NETWORK_ERROR_MESSAGE =
  "Não foi possível conectar à API. Verifique se o backend está rodando.";

type ApiFetchOptions = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { auth = true, ...fetchOptions } = options;
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://localhost:3001";
  const token = getToken();
  const headers = new Headers(fetchOptions.headers);

  if (!headers.has("Content-Type") && fetchOptions.body) {
    headers.set("Content-Type", "application/json");
  }

  if (auth && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers,
    });
  } catch (err) {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE, err);
  }

  if (auth && response.status === 401) {
    clearToken();

    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }

    throw new ApiError(401, "Sessao expirada. Faca login novamente.");
  }

  const text = await response.text();
  const data = text ? parseJson(text) : undefined;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      readErrorMessage(data) ?? `Erro ${response.status}`,
      data,
    );
  }

  return data as T;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const message = (data as { message?: unknown }).message;

  if (Array.isArray(message)) {
    return message.join(", ");
  }

  return typeof message === "string" ? message : undefined;
}
