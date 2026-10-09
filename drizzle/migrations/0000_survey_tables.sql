create table public.projects (
  id text primary key, team_code text not null, name text not null, place text not null default '',
  created_at timestamptz not null, updated_at timestamptz not null);
create index projects_team_idx on public.projects (team_code);
create table public.features (
  id text primary key, team_code text not null,
  project_id text not null references public.projects (id) on delete cascade,
  type text not null, kind text not null, seq integer not null,
  lat double precision not null, lng double precision not null, geometry jsonb not null,
  accuracy double precision, heading double precision, speed double precision,
  note text not null default '', length_m double precision,
  point_count integer not null default 1, sample_count integer not null default 1,
  origin text not null default 'gps', recorded_at timestamptz not null, updated_at timestamptz not null);
create index features_team_idx on public.features (team_code);
create table public.deletions (
  id text primary key, team_code text not null, kind text not null, deleted_at timestamptz not null);
create index deletions_team_idx on public.deletions (team_code);
grant all on public.projects, public.features, public.deletions to service_role;
alter table public.projects enable row level security;
alter table public.features enable row level security;
alter table public.deletions enable row level security;