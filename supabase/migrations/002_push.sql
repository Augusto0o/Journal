-- Avisos push (Web Push) para Personal OS.
create table if not exists public.pos_push (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  timezone   text not null default 'UTC',
  created_at timestamptz not null default now()
);
create index if not exists pos_push_user_idx on public.pos_push (user_id);
alter table public.pos_push enable row level security; -- solo la función (service role) la usa

create table if not exists public.pos_push_queue (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  send_at  timestamptz not null,
  title    text not null,
  body     text not null default '',
  url      text not null default '/',
  tag      text,
  sent_at  timestamptz
);
create index if not exists pos_push_queue_due_idx on public.pos_push_queue (user_id, send_at) where sent_at is null;
alter table public.pos_push_queue enable row level security;

create table if not exists public.pos_push_sent (
  item_id    text not null,
  key        text not null,
  created_at timestamptz not null default now(),
  primary key (item_id, key)
);
alter table public.pos_push_sent enable row level security;

-- Cada minuto, pg_cron llama a la función «push» (reemplazá TU_CRON_SECRET por el secreto CRON_SECRET).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('pos-push-tick') where exists (select 1 from cron.job where jobname = 'pos-push-tick');
select cron.schedule('pos-push-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://TU_PROYECTO.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'TU_CRON_SECRET'),
    body := '{"action":"tick"}'::jsonb
  );
$$);
