-- =====================================================================
-- Personal OS — esquema (ejecutar en Supabase → SQL Editor)
-- Todos los registros se guardan como documentos JSON en pos_items.
-- Las contraseñas NO se sincronizan: viven cifradas en el dispositivo.
-- =====================================================================

create table if not exists public.pos_items (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('journal','note','folder','task','reminder','habit','focus','card','lesson','map','doc','media')),
  payload           jsonb not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default clock_timestamp()
);

create index if not exists pos_items_user_sync_idx on public.pos_items (user_id, server_updated_at);
create index if not exists pos_items_user_kind_idx on public.pos_items (user_id, kind);

create or replace function public.pos_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.server_updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;
  return new;
end $$;

drop trigger if exists pos_items_touch on public.pos_items;
create trigger pos_items_touch before insert or update on public.pos_items
  for each row execute function public.pos_touch();

alter table public.pos_items enable row level security;

drop policy if exists "pos_items_select_own" on public.pos_items;
create policy "pos_items_select_own" on public.pos_items for select using (user_id = (select auth.uid()));
drop policy if exists "pos_items_insert_own" on public.pos_items;
create policy "pos_items_insert_own" on public.pos_items for insert with check (user_id = (select auth.uid()));
drop policy if exists "pos_items_update_own" on public.pos_items;
create policy "pos_items_update_own" on public.pos_items for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "pos_items_delete_own" on public.pos_items;
create policy "pos_items_delete_own" on public.pos_items for delete using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Tokens personales para la app Atajos (solo se guarda el hash SHA-256)
-- ---------------------------------------------------------------------
create table if not exists public.pos_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash   text not null unique,
  label        text not null default 'iPhone',
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists pos_tokens_user_idx on public.pos_tokens (user_id);
alter table public.pos_tokens enable row level security;

drop policy if exists "pos_tokens_select_own" on public.pos_tokens;
create policy "pos_tokens_select_own" on public.pos_tokens for select using (user_id = (select auth.uid()));
drop policy if exists "pos_tokens_insert_own" on public.pos_tokens;
create policy "pos_tokens_insert_own" on public.pos_tokens for insert with check (user_id = (select auth.uid()));
drop policy if exists "pos_tokens_delete_own" on public.pos_tokens;
create policy "pos_tokens_delete_own" on public.pos_tokens for delete using (user_id = (select auth.uid()));
-- (sin política de update: last_used_at lo escribe la función capture con la service role)
