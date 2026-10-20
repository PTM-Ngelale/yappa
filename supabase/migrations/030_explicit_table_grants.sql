-- Yappa: explicit table grants.
--
-- From 2026-10-30 Supabase stops granting the API roles (anon, authenticated, service_role)
-- access to new tables in "public". Every table here relied on that automatic grant, so a
-- database rebuilt from these migrations (a new project, a preview branch, `supabase db
-- reset`) would come up with the app locked out. This states the access each role needs.
--
-- Players read two tables directly, rooms and round_secrets, and RLS decides which rows
-- (migrations 002 and 025). Everything else they do goes through security definer functions,
-- which run as the owner and need no table grants. The automatic grant was "all", which
-- includes TRUNCATE, which RLS doesn't cover; players now get read access only.
--
-- The service role (the validate-guess edge function) keeps full access.

revoke all on all tables in schema public from anon, authenticated;
grant select on rooms, round_secrets to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Two settings helpers that only definer functions call; signed-out visitors could read them.
revoke all on function _used_word_memory() from public, anon, authenticated;
revoke all on function _category_minimum() from public, anon, authenticated;
