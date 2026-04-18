# Supabase POC Setup (No Real Auth)

This app supports a shared-data proof of concept using Supabase.  
If Supabase env vars are missing, it falls back to local IndexedDB.

## 1) Create a free Supabase project

- Go to [https://supabase.com](https://supabase.com)
- Create a new project
- Open **Project Settings -> API**
- Copy:
  - `Project URL` -> `VITE_SUPABASE_URL`
  - `anon public key` -> `VITE_SUPABASE_ANON_KEY`

## 2) Create `.env.local`

In the project root:

```bash
VITE_SUPABASE_URL=YOUR_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_SHARED_WORKSPACE_ID=nypd-poc
```

## 3) Create the shared table

Run this in Supabase SQL editor:

```sql
create table if not exists public.vc_app_state (
  workspace_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

## 4) Allow POC access (demo only)

For quick POC without real auth, temporarily disable RLS:

```sql
alter table public.vc_app_state disable row level security;
```

## 5) Run app

```bash
npm install
npm run dev
```

With env vars + table present, data is shared across devices under `VITE_SHARED_WORKSPACE_ID`.
