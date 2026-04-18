type PostgrestMethod = "GET" | "POST" | "PATCH";

type PostgrestRequestOptions = {
  method?: PostgrestMethod;
  query?: Record<string, string>;
  body?: unknown;
  prefer?: string;
};

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getPostgrestConfig() {
  const baseUrl = getEnv("MANEX_API_URL").replace(/\/$/, "");
  const apiKey = getEnv("MANEX_API_KEY");
  return { baseUrl, apiKey };
}

export async function postgrestRequest<T>(
  path: string,
  options: PostgrestRequestOptions = {},
): Promise<T> {
  const { baseUrl, apiKey } = getPostgrestConfig();
  const method = options.method ?? "GET";
  const queryString = options.query
    ? `?${new URLSearchParams(options.query).toString()}`
    : "";
  const url = `${baseUrl}/${path}${queryString}`;

  const response = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer ?? "",
    },
    cache: "no-store",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
