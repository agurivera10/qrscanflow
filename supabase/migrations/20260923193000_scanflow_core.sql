-- ScanFlow core schema
-- Designed for multi-workspace physical attribution, immutable QR endpoints,
-- versioned destinations, serialized physical units, experiments and event telemetry.

create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users(id) on delete restrict,
  timezone text not null default 'America/Argentina/Cordoba',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','analyst','member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  objective text,
  starts_at timestamptz,
  ends_at timestamptz,
  budget numeric(14,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('url','whatsapp','landing','instagram','menu','review','custom')),
  url text,
  phone text,
  message text,
  config jsonb not null default '{}'::jsonb,
  health_status text not null default 'unknown' check (health_status in ('unknown','healthy','degraded','down')),
  last_health_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','paused','archived')),
  mode text not null default 'shared' check (mode in ('shared','serialized')),
  current_version_id uuid,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.qr_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  destination_id uuid not null references public.destinations(id) on delete restrict,
  version integer not null,
  resolved_url text not null,
  visual_config jsonb not null default '{}'::jsonb,
  routing_rules jsonb not null default '[]'::jsonb,
  safety_score integer check (safety_score between 0 and 100),
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (qr_code_id, version)
);

alter table public.qr_codes
  add constraint qr_codes_current_version_fk
  foreign key (current_version_id) references public.qr_versions(id) on delete set null;

create table public.distribution_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  code text not null,
  asset_type text not null,
  quantity integer not null check (quantity >= 0),
  print_cost numeric(14,2),
  distribution_cost numeric(14,2),
  location_name text,
  location_lat numeric(9,6),
  location_lon numeric(9,6),
  distributed_at timestamptz,
  distributor text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table public.distribution_units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.distribution_batches(id) on delete cascade,
  qr_code_id uuid not null references public.qr_codes(id) on delete cascade,
  serial text not null unique,
  public_token text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  qr_code_id uuid references public.qr_codes(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  goal_event text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  name text not null,
  weight integer not null default 50 check (weight between 1 and 100),
  destination_id uuid references public.destinations(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  qr_version_id uuid references public.qr_versions(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  distribution_batch_id uuid references public.distribution_batches(id) on delete set null,
  distribution_unit_id uuid references public.distribution_units(id) on delete set null,
  experiment_id uuid references public.experiments(id) on delete set null,
  variant_id uuid references public.experiment_variants(id) on delete set null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  visitor_id text,
  session_id text,
  request_hash text,
  country text,
  region text,
  city text,
  timezone text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  device_type text,
  os text,
  browser text,
  user_agent text,
  referrer text,
  is_exact boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on column public.events.request_hash is 'Daily rotating HMAC used for approximate deduplication. Raw IP must never be persisted.';
comment on column public.events.is_exact is 'False for signals such as IP-derived geo or pseudonymous unique-user estimates.';

create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visitor_id text,
  session_id text,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  source_event_id uuid references public.events(id) on delete set null,
  conversion_type text not null,
  external_id text,
  value numeric(14,2),
  currency text not null default 'ARS',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected' check (status in ('disconnected','connected','degraded')),
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  qr_code_id uuid references public.qr_codes(id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('info','warning','critical')),
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Single, server-only resolution surface for the high-speed redirect path.
create view public.redirect_resolutions
with (security_invoker = true)
as
select
  q.slug,
  q.id as qr_code_id,
  q.workspace_id,
  q.campaign_id,
  q.status,
  v.id as qr_version_id,
  v.resolved_url,
  v.routing_rules,
  v.visual_config
from public.qr_codes q
join public.qr_versions v on v.id = q.current_version_id;

revoke all on public.redirect_resolutions from anon, authenticated;
grant select on public.redirect_resolutions to service_role;

create index events_workspace_occurred_idx on public.events (workspace_id, occurred_at desc);
create index events_qr_occurred_idx on public.events (qr_code_id, occurred_at desc);
create index events_type_occurred_idx on public.events (event_type, occurred_at desc);
create index events_visitor_idx on public.events (workspace_id, visitor_id, occurred_at desc);
create index events_batch_idx on public.events (distribution_batch_id, occurred_at desc);
create index conversions_workspace_occurred_idx on public.conversions (workspace_id, occurred_at desc);
create index conversions_qr_idx on public.conversions (qr_code_id, occurred_at desc);
create index qr_codes_workspace_idx on public.qr_codes (workspace_id, status);
create index distribution_units_batch_idx on public.distribution_units (batch_id);

-- RLS: all dashboard tables are workspace-scoped. Public scan ingestion never uses anon;
-- the redirect runtime writes through a server-only Supabase secret key.
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.destinations enable row level security;
alter table public.qr_codes enable row level security;
alter table public.qr_versions enable row level security;
alter table public.distribution_batches enable row level security;
alter table public.distribution_units enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_variants enable row level security;
alter table public.events enable row level security;
alter table public.conversions enable row level security;
alter table public.integrations enable row level security;
alter table public.alerts enable row level security;

create policy "workspace owners read own workspace" on public.workspaces for select to authenticated using (owner_id = (select auth.uid()) or exists (select 1 from public.workspace_members wm where wm.workspace_id = id and wm.user_id = (select auth.uid())));
create policy "users create own workspaces" on public.workspaces for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owners update own workspace" on public.workspaces for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "members read memberships" on public.workspace_members for select to authenticated using (user_id = (select auth.uid()) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
create policy "users bootstrap own membership" on public.workspace_members for insert to authenticated with check (user_id = (select auth.uid()));

-- Reusable policy shape, expanded explicitly per table to avoid SECURITY DEFINER helpers.
create policy "campaign members select" on public.campaigns for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = (select auth.uid())));
create policy "campaign members insert" on public.campaigns for insert to authenticated with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = (select auth.uid())));
create policy "campaign members update" on public.campaigns for update to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = campaigns.workspace_id and wm.user_id = (select auth.uid())));

create policy "destination members all" on public.destinations for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = destinations.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = destinations.workspace_id and wm.user_id = (select auth.uid())));
create policy "qr members all" on public.qr_codes for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = qr_codes.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = qr_codes.workspace_id and wm.user_id = (select auth.uid())));
create policy "qr version members all" on public.qr_versions for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = qr_versions.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = qr_versions.workspace_id and wm.user_id = (select auth.uid())));
create policy "batch members all" on public.distribution_batches for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = distribution_batches.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = distribution_batches.workspace_id and wm.user_id = (select auth.uid())));
create policy "unit members all" on public.distribution_units for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = distribution_units.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = distribution_units.workspace_id and wm.user_id = (select auth.uid())));
create policy "experiment members all" on public.experiments for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiments.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiments.workspace_id and wm.user_id = (select auth.uid())));
create policy "variant members all" on public.experiment_variants for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_variants.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = experiment_variants.workspace_id and wm.user_id = (select auth.uid())));
create policy "event members select" on public.events for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = events.workspace_id and wm.user_id = (select auth.uid())));
create policy "conversion members select" on public.conversions for select to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = conversions.workspace_id and wm.user_id = (select auth.uid())));
create policy "integration members all" on public.integrations for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = integrations.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = integrations.workspace_id and wm.user_id = (select auth.uid())));
create policy "alert members all" on public.alerts for all to authenticated using (exists (select 1 from public.workspace_members wm where wm.workspace_id = alerts.workspace_id and wm.user_id = (select auth.uid()))) with check (exists (select 1 from public.workspace_members wm where wm.workspace_id = alerts.workspace_id and wm.user_id = (select auth.uid())));
