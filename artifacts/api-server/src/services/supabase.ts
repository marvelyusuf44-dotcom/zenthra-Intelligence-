// services/supabase.ts
//
// DIPERBAIKI dari versi awal: yang lama pakai @replit/connectors-sdk
// (connectors.proxy("supabase", ...)) — itu mekanisme khusus Replit yang TIDAK
// akan jalan begitu API server ini di-deploy ke Railway/di luar Replit.
// Sekarang pakai koneksi REST langsung ke Supabase pakai SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY (lihat .env.example) — portable di platform mana pun.

type SupabaseRow = Record<string, unknown>;

function requireEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di environment.");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

export async function supabaseRequest<T = SupabaseRow | SupabaseRow[]>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const { url, key } = requireEnv();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail.slice(0, 240)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listRows<T extends SupabaseRow>(table: string, query: string) {
  return supabaseRequest<T[]>(`${table}?${query}`);
}

export async function insertRow<T extends SupabaseRow>(table: string, row: SupabaseRow) {
  const rows = await supabaseRequest<T[]>(table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return rows[0];
}

export async function deleteRows(table: string, query: string) {
  await supabaseRequest(`${table}?${query}`, { method: "DELETE" });
}
