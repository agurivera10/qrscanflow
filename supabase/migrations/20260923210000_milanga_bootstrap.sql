-- Seed MILANGA and let the first real auth user claim ownership safely.
alter table public.workspaces alter column owner_id drop not null;

insert into public.workspaces (name, slug, owner_id, timezone)
values ('MILANGA', 'milanga', null, 'America/Argentina/Cordoba')
on conflict (slug) do nothing;

do $$
declare
  ws uuid;
  camp uuid;
  dest uuid;
  qr uuid;
  ver uuid;
begin
  select id into ws from public.workspaces where slug = 'milanga';

  select id into camp from public.campaigns where workspace_id = ws and name = 'Folletos Corrientes' limit 1;
  if camp is null then
    insert into public.campaigns (workspace_id, name, status, objective, metadata)
    values (ws, 'Folletos Corrientes', 'active', 'Generar pedidos por WhatsApp', jsonb_build_object('channel','offline','asset','flyer'))
    returning id into camp;
  end if;

  select id into dest from public.destinations where workspace_id = ws and name = 'WhatsApp MILANGA' limit 1;
  if dest is null then
    insert into public.destinations (workspace_id, name, kind, phone, message, url, config, health_status)
    values (
      ws,
      'WhatsApp MILANGA',
      'whatsapp',
      '5493794141903',
      'Hola MILANGA, vi el folleto y quiero hacer un pedido.',
      'https://wa.me/5493794141903?text=Hola%20MILANGA%2C%20vi%20el%20folleto%20y%20quiero%20hacer%20un%20pedido.',
      jsonb_build_object('source','milanga-folleto'),
      'unknown'
    )
    returning id into dest;
  end if;

  select id into qr from public.qr_codes where slug = 'milanga-folleto' limit 1;
  if qr is null then
    insert into public.qr_codes (workspace_id, campaign_id, name, slug, status, mode, tags, metadata)
    values (ws, camp, 'Folleto MILANGA', 'milanga-folleto', 'active', 'shared', array['milanga','folleto','whatsapp'], jsonb_build_object('print_ready', true))
    returning id into qr;
  end if;

  select id into ver from public.qr_versions where qr_code_id = qr and version = 1 limit 1;
  if ver is null then
    insert into public.qr_versions (workspace_id, qr_code_id, destination_id, version, resolved_url, visual_config, routing_rules, safety_score)
    values (
      ws,
      qr,
      dest,
      1,
      'https://wa.me/5493794141903?text=Hola%20MILANGA%2C%20vi%20el%20folleto%20y%20quiero%20hacer%20un%20pedido.',
      jsonb_build_object('error_correction','H','recommended_print_mm',30),
      '[]'::jsonb,
      100
    )
    returning id into ver;
  end if;

  update public.qr_codes set current_version_id = ver, updated_at = now() where id = qr;
end $$;

create or replace function private.claim_milanga_for_first_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  select id into ws
  from public.workspaces
  where slug = 'milanga' and owner_id is null
  for update;

  if ws is not null then
    update public.workspaces
      set owner_id = new.id, updated_at = now()
      where id = ws and owner_id is null;

    insert into public.workspace_members (workspace_id, user_id, role)
      values (ws, new.id, 'owner')
      on conflict (workspace_id, user_id) do update set role = 'owner';
  end if;

  return new;
end;
$$;

revoke all on function private.claim_milanga_for_first_user() from public, anon, authenticated;

drop trigger if exists scanflow_claim_first_user on auth.users;
create trigger scanflow_claim_first_user
after insert on auth.users
for each row execute function private.claim_milanga_for_first_user();
