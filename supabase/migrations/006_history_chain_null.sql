-- Fixes: a round that ended before any word was played (timeout, or an instant guess)
-- crashed the Resolution screen. The room's `chain` is JSON null until the first word, and
-- coalesce() only replaces SQL NULL — `room_data -> 'chain'` returns a jsonb 'null' value,
-- so the history entry was stored with "chain": null instead of [].

create or replace function _resolve_round(p_code text, p_round int, p_outcome text, p_guess text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data jsonb;
  target text;
  final_chain jsonb;
  final_checks jsonb;
begin
  select data into room_data from rooms where code = p_code for update;
  if room_data is null
    or room_data ->> 'status' <> 'playing'
    or (room_data ->> 'round')::int <> p_round then
    return false;
  end if;

  select target_word into target from round_secrets where code = p_code and round = p_round;

  final_chain := room_data -> 'chain';
  if final_chain is null or jsonb_typeof(final_chain) <> 'array' then
    final_chain := '[]'::jsonb;
  end if;
  final_checks := room_data -> 'linkChecks';
  if final_checks is null or jsonb_typeof(final_checks) <> 'object' then
    final_checks := '{}'::jsonb;
  end if;

  update rooms
  set data = jsonb_set(
    room_data || jsonb_build_object('status', 'resolution', 'guessPending', null),
    array['history', p_round::text],
    jsonb_build_object(
      'round', p_round,
      'category', room_data ->> 'category',
      'targetWord', target,
      'chain', final_chain,
      'guesserUid', room_data ->> 'guesserUid',
      'outcome', p_outcome,
      'guess', p_guess,
      'linkChecks', final_checks
    ),
    true
  )
  where code = p_code;
  return true;
end;
$$;

revoke all on function _resolve_round(text, int, text, text) from public, anon, authenticated;

-- Repair history entries already stored with a null chain.
update rooms r
set data = jsonb_set(r.data, '{history}', (
  select jsonb_object_agg(
    k,
    case when jsonb_typeof(v -> 'chain') = 'array' then v
         else v || '{"chain": []}'::jsonb end
  )
  from jsonb_each(r.data -> 'history') as h(k, v)
))
where jsonb_typeof(r.data -> 'history') = 'object'
  and exists (
    select 1 from jsonb_each(r.data -> 'history') as h(k, v)
    where jsonb_typeof(v -> 'chain') is distinct from 'array'
  );
