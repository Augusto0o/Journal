-- Conexión con YouTube Music (la usa solo la función «youtube» con la service role).
create table if not exists public.pos_google (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  refresh_token  text,
  playlist_id    text,
  playlist_title text,
  auto           boolean not null default true,
  state          text,
  return_to      text,
  updated_at     timestamptz not null default now()
);
create index if not exists pos_google_state_idx on public.pos_google (state);
alter table public.pos_google enable row level security;
