-- Keep the MILANGA workspace/bootstrap ownership flow, but remove all seeded business data.
-- The first real QR/campaign/destination should be created only when the user requests it.

do $$
declare
  ws uuid;
begin
  select id into ws from public.workspaces where slug = 'milanga';
  if ws is null then return; end if;

  delete from public.alerts where workspace_id = ws;
  delete from public.conversions where workspace_id = ws;
  delete from public.events where workspace_id = ws;
  delete from public.experiment_variants where workspace_id = ws;
  delete from public.experiments where workspace_id = ws;
  delete from public.distribution_units where workspace_id = ws;
  delete from public.distribution_batches where workspace_id = ws;

  update public.qr_codes
    set current_version_id = null, updated_at = now()
    where workspace_id = ws;

  delete from public.qr_versions where workspace_id = ws;
  delete from public.qr_codes where workspace_id = ws;
  delete from public.destinations where workspace_id = ws;
  delete from public.campaigns where workspace_id = ws;
  delete from public.integrations where workspace_id = ws;
end $$;
