-- Data retention, so the privacy policy's promises hold:
--   * game rooms (player names, words, guesses) are deleted 24 hours after they were created —
--     leave_room already deletes a room once everyone leaves, this catches abandoned ones;
--   * anonymous accounts unused for 30 days are deleted (the app signs in again on next launch);
--   * ai_usage rows already age out after an hour (take_ai_quota, migration 007).
-- Runs hourly with pg_cron (scheduled at the bottom). Safe to re-run.

create or replace function purge_expired_data()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- round_secrets go with their room (on delete cascade).
  delete from public.rooms where created_at < now() - interval '24 hours';

  delete from public.ai_usage where at < now() - interval '1 hour';

  -- "Unused" = no sign-in and no session refresh (the app refreshes on every launch) in 30 days.
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
    and not exists (
      select 1 from auth.sessions s
      where s.user_id = u.id and s.updated_at > now() - interval '30 days'
    );
end;
$$;

-- Only the scheduler should run this.
revoke all on function purge_expired_data() from public, anon, authenticated;

-- Supabase ships pg_cron; skipped where it isn't available (the local PGlite test database).
do $do$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron not available: purge_expired_data() is not scheduled';
    return;
  end if;
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.unschedule(jobid) from cron.job where jobname = 'yappa-purge-expired-data';
  perform cron.schedule('yappa-purge-expired-data', '17 * * * *', 'select public.purge_expired_data()');
end
$do$;
