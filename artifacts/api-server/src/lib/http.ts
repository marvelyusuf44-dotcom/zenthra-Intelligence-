// lib/http.ts
//
// Vercel's strict typecheck menemukan tabrakan nama tipe `Response` antara
// global fetch() dan Response dari Express di file-file yang import express
// (atau yang import sesuatu yang akhirnya import express). Efeknya properti
// ok/status/text()/json() dari hasil fetch() gak kebaca compiler.
//
// Daripada nempel ke tipe ambient yang ambigu itu, semua fetch ke API luar di
// project ini lewat sini — satu tempat, tipe kita definisikan sendiri.

export interface FetchResult {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function doFetch(url: string, init?: RequestInit): Promise<FetchResult> {
  return (await fetch(url, init)) as unknown as FetchResult;
}
