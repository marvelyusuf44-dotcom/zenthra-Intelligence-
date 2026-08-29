-- Run this once in the Supabase SQL editor before creating the first account.
-- The API uses service-role access through the Replit Supabase connection.
create extension if not exists pgcrypto;

create table if not exists public.zenthra_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.zenthra_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zenthra_users(id) on delete cascade,
  title text not null default 'New analyst thread',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zenthra_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.zenthra_chats(id) on delete cascade,
  user_id uuid not null references public.zenthra_users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.zenthra_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zenthra_users(id) on delete cascade,
  kind text not null check (kind in ('token', 'wallet')),
  value text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, value)
);

create table if not exists public.zenthra_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zenthra_users(id) on delete cascade,
  kind text not null check (kind in ('price', 'wallet', 'volume')),
  target text not null,
  condition text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists zenthra_messages_chat_created_idx on public.zenthra_messages(chat_id, created_at);
create index if not exists zenthra_chats_user_updated_idx on public.zenthra_chats(user_id, updated_at desc);

-- "Connect your WhatsApp" — nomor WhatsApp Business milik user sendiri,
-- ditautkan lewat WhatsApp Embedded Signup resmi Meta (bukan automation WA Web).
create table if not exists public.zenthra_wa_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zenthra_users(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null unique,
  business_name text,
  access_token text not null, -- dienkripsi app-level (AES-256-GCM, lib/security/crypto.ts) sebelum disimpan, bukan plaintext
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (user_id, phone_number_id)
);

create index if not exists zenthra_wa_connections_user_idx on public.zenthra_wa_connections(user_id);

-- Monetisasi: tier + kuota harian. Lihat lib/billing/tiers.ts buat definisi tier
-- dan limitnya (source of truth ada di kode, bukan di DB, biar gampang di-tuning).
create table if not exists public.zenthra_subscriptions (
  user_id uuid primary key references public.zenthra_users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pelajar', 'plus', 'pro')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Satu baris per (principal, kategori, hari). principal_type membedakan user
-- yang login (web / Connect your WhatsApp) vs nomor WhatsApp anonim yang cuma
-- pakai "Chat with Zenthra" tanpa akun.
create table if not exists public.zenthra_usage_daily (
  id uuid primary key default gen_random_uuid(),
  principal_type text not null check (principal_type in ('user', 'wa')),
  principal_id text not null, -- uuid user ATAU nomor WhatsApp, disimpan sebagai text biar satu tabel buat dua kasus
  category text not null check (category in ('chat', 'onchain', 'creative')),
  usage_date date not null default current_date,
  count int not null default 0,
  unique (principal_type, principal_id, category, usage_date)
);

create index if not exists zenthra_usage_daily_lookup_idx on public.zenthra_usage_daily(principal_type, principal_id, usage_date);

-- Klaim pembayaran QRIS manual — belum ada payment gateway otomatis, jadi user
-- klik "Saya sudah bayar" setelah scan QRIS, lalu admin (Jefri) cek mutasi
-- manual dan approve lewat POST /billing/admin/confirm-payment.
create table if not exists public.zenthra_payment_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.zenthra_users(id) on delete cascade,
  tier text not null check (tier in ('pelajar', 'plus', 'pro')),
  note text, -- opsional: user bisa isi jam bayar / 4 digit terakhir referensi, bantu admin cocokin mutasi
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists zenthra_payment_claims_status_idx on public.zenthra_payment_claims(status, created_at);

-- History chat WhatsApp anonim ("Chat with Zenthra" tanpa akun) — GANTI dari
-- versi awal yang in-memory (reset tiap restart server). wa_id = nomor pengirim.
create table if not exists public.zenthra_wa_messages (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists zenthra_wa_messages_wa_idx on public.zenthra_wa_messages(wa_id, created_at desc);

-- Atomic increment — PENTING: upsert biasa (Prefer: resolution=merge-duplicates)
-- akan OVERWRITE kolom count jadi nilai yang dikirim, bukan menambahkannya.
-- Fungsi ini yang dipanggil quota.ts lewat /rest/v1/rpc/increment_zenthra_usage.
create or replace function public.increment_zenthra_usage(
  p_principal_type text,
  p_principal_id text,
  p_category text,
  p_date date
) returns int
language plpgsql
as $$
declare
  new_count int;
begin
  insert into public.zenthra_usage_daily (principal_type, principal_id, category, usage_date, count)
  values (p_principal_type, p_principal_id, p_category, p_date, 1)
  on conflict (principal_type, principal_id, category, usage_date)
  do update set count = zenthra_usage_daily.count + 1
  returning count into new_count;
  return new_count;
end;
$$;