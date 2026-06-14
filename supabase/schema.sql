-- Livre de Quête — Supabase schema
-- Run this once in your Supabase project's SQL editor
-- (Dashboard → SQL Editor → New query → paste this whole file → Run).
--
-- Each "data" table stores one JSON blob per record, keyed by the same
-- string id the app already generates (uid()). This mirrors the old
-- localStorage arrays closely so js/db.js can map rows back to the
-- same objects the UI already expects.

create table if not exists public.clients (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quests (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Per-project production data (tasks + budget estimate), one row per project
create table if not exists public.production (
  project_id text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Small key/value store for app-wide data that isn't a list (e.g. quest XP)
create table if not exists public.app_state (
  key   text primary key,
  value jsonb not null
);

-- ─── Row Level Security ────────────────────────────────────────────
-- This app has no login — the anon key ships in the client-side JS,
-- exactly like the previous localStorage-only version had no access
-- control either. These policies grant the anon role full read/write
-- access, which preserves that "no login" behaviour. If you ever add
-- authentication, tighten these to `auth.uid() = ...` checks.

alter table public.clients    enable row level security;
alter table public.projects   enable row level security;
alter table public.invoices   enable row level security;
alter table public.expenses   enable row level security;
alter table public.quests     enable row level security;
alter table public.production enable row level security;
alter table public.app_state  enable row level security;

create policy "anon full access" on public.clients    for all using (true) with check (true);
create policy "anon full access" on public.projects   for all using (true) with check (true);
create policy "anon full access" on public.invoices   for all using (true) with check (true);
create policy "anon full access" on public.expenses   for all using (true) with check (true);
create policy "anon full access" on public.quests     for all using (true) with check (true);
create policy "anon full access" on public.production for all using (true) with check (true);
create policy "anon full access" on public.app_state  for all using (true) with check (true);

-- ─── Bulk-load RPC ──────────────────────────────────────────────────
-- Returns everything the app needs in a single request, so the page
-- can load its data with one round trip instead of seven.
create or replace function public.get_all_data()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'clients',    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data) order by (data->>'createdAt')::bigint desc) from clients), '[]'::jsonb),
    'projects',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data) order by (data->>'createdAt')::bigint desc) from projects), '[]'::jsonb),
    'invoices',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data) order by (data->>'createdAt')::bigint desc) from invoices), '[]'::jsonb),
    'expenses',   coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data) order by (data->>'createdAt')::bigint desc) from expenses), '[]'::jsonb),
    'quests',     coalesce((select jsonb_agg(jsonb_build_object('id', id, 'data', data) order by (data->>'createdAt')::bigint desc) from quests), '[]'::jsonb),
    'production', coalesce((select jsonb_object_agg(project_id, data) from production), '{}'::jsonb),
    'app_state',  coalesce((select jsonb_object_agg(key, value) from app_state), '{}'::jsonb)
  );
$$;

grant execute on function public.get_all_data() to anon;
