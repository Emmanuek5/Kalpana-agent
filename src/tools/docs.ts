const CONTEXT7_BASE = "https://context7.com/api/v1";

export interface Context7SearchInput {
  query: string;
}

export interface Context7GetDocsInput {
  id: string; // e.g. "/vercel/next.js" or "vercel/next.js"
  topic?: string;
  type?: "json" | "txt";
  tokens?: number;
}

export async function context7Search({ query }: Context7SearchInput) {
  const url = new URL(`${CONTEXT7_BASE}/search`);
  url.searchParams.set("query", query);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.CONTEXT7_API_KEY ?? ""}`,
    },
  });
  if (!res.ok) throw new Error(`Context7 search failed: ${res.status}`);
  return res.json();
}

export async function context7GetDocs({
  id,
  topic,
  type = "json",
  tokens = 5000,
}: Context7GetDocsInput) {
  const path = id.startsWith("/") ? id.slice(1) : id;
  const url = new URL(`${CONTEXT7_BASE}/${path}`);
  url.searchParams.set("type", type);
  if (topic) url.searchParams.set("topic", topic);
  if (tokens) url.searchParams.set("tokens", String(tokens));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.CONTEXT7_API_KEY ?? ""}`,
    },
  });
  if (!res.ok) throw new Error(`Context7 get docs failed: ${res.status}`);
  return res.json();
}

export interface FetchDocsByUrlInput {
  url: string;
}

export async function fetchDocsByUrl({ url }: FetchDocsByUrlInput) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  const text = await res.text();
  return { url, text };
}
