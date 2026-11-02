-- BORNTOWIN5 persistent app-state table
-- Run this once in Supabase SQL Editor.
create table if not exists public.app_state (
  id integer primary key,
  data jsonb not null
);

-- This table is accessed only by the BORNTOWIN5 backend using the Supabase Secret Key.
-- Do NOT put the Secret Key in member.html/admin.html or GitHub.
alter table public.app_state disable row level security;
