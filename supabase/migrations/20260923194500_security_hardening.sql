-- ScanFlow security hardening for current Supabase Data API defaults.
-- Explicit grants avoid relying on platform defaults. Membership checks live in a
-- non-exposed schema to avoid recursive RLS between workspaces and workspace_members.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1
      from public.workspaces w
      where w.id = target_workspace_id
        and w.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = (select auth.uid())
    )
  );
$$;

create or replace function private.can_manage_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    exists (
      select 1
      from public.workspaces w
      where w.id = target_workspace_id
        and w.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.user_id = (select auth.uid())
        and wm.role in ('owner', 'admin')
    )
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public;
revoke all on function private.can_manage_workspace(uuid) from public;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.can_manage_workspace(uuid) to authenticated;

-- Replace first-pass policies with non-recursive versions.
drop policy if exists "workspace owners read own workspace" on public.workspaces;
drop policy if exists "users create own workspaces" on public.workspaces;
drop policy if exists "owners update own workspace" on public.workspaces;
drop policy if exists "members read memberships" on public.workspace_members;
drop policy if exists "users bootstrap own membership" on public.workspace_members;
drop policy if exists "campaign members select" on public.campaigns;
drop policy if exists "campaign members insert" on public.campaigns;
drop policy if exists "campaign members update" on public.campaigns;
drop policy if exists "destination members all" on public.destinations;
drop policy if exists "qr members all" on public.qr_codes;
drop policy if exists "qr version members all" on public.qr_versions;
drop policy if exists "batch members all" on public.distribution_batches;
drop policy if exists "unit members all" on public.distribution_units;
drop policy if exists "experiment members all" on public.experiments;
drop policy if exists "variant members all" on public.experiment_variants;
drop policy if exists "event members select" on public.events;
drop policy if exists "conversion members select" on public.conversions;
drop policy if exists "integration members all" on public.integrations;
drop policy if exists "alert members all" on public.alerts;

create policy "workspace members select"
on public.workspaces for select to authenticated
using ((select private.is_workspace_member(id)));

create policy "users create own workspaces"
on public.workspaces for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "workspace admins update"
on public.workspaces for update to authenticated
using ((select private.can_manage_workspace(id)))
with check ((select private.can_manage_workspace(id)));

create policy "workspace owners delete"
on public.workspaces for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "workspace members read membership"
on public.workspace_members for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy "workspace admins insert membership"
on public.workspace_members for insert to authenticated
with check ((select private.can_manage_workspace(workspace_id)));

create policy "workspace admins update membership"
on public.workspace_members for update to authenticated
using ((select private.can_manage_workspace(workspace_id)))
with check ((select private.can_manage_workspace(workspace_id)));

create policy "workspace admins delete membership"
on public.workspace_members for delete to authenticated
using ((select private.can_manage_workspace(workspace_id)));

create policy "campaign members all"
on public.campaigns for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "destination members all"
on public.destinations for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "qr members all"
on public.qr_codes for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "qr version members all"
on public.qr_versions for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "batch members all"
on public.distribution_batches for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "unit members all"
on public.distribution_units for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "experiment members all"
on public.experiments for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "variant members all"
on public.experiment_variants for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "event members select"
on public.events for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy "conversion members select"
on public.conversions for select to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy "integration members all"
on public.integrations for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy "alert members all"
on public.alerts for all to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

-- Explicit Data API grants. Anonymous clients never touch ScanFlow tables directly.
revoke all on public.workspaces, public.workspace_members, public.campaigns,
  public.destinations, public.qr_codes, public.qr_versions,
  public.distribution_batches, public.distribution_units,
  public.experiments, public.experiment_variants, public.events,
  public.conversions, public.integrations, public.alerts
from anon;

revoke all on public.workspaces, public.workspace_members, public.campaigns,
  public.destinations, public.qr_codes, public.qr_versions,
  public.distribution_batches, public.distribution_units,
  public.experiments, public.experiment_variants, public.events,
  public.conversions, public.integrations, public.alerts
from authenticated;

grant select, insert, update, delete on
  public.workspaces, public.workspace_members, public.campaigns,
  public.destinations, public.qr_codes, public.qr_versions,
  public.distribution_batches, public.distribution_units,
  public.experiments, public.experiment_variants,
  public.integrations, public.alerts
to authenticated;

grant select on public.events, public.conversions to authenticated;

grant all on
  public.workspaces, public.workspace_members, public.campaigns,
  public.destinations, public.qr_codes, public.qr_versions,
  public.distribution_batches, public.distribution_units,
  public.experiments, public.experiment_variants, public.events,
  public.conversions, public.integrations, public.alerts
to service_role;

-- New objects should not become browser-accessible by accident.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
