-- Yappa: rooms table + patch_room RPC (Firebase RTDB -> Supabase migration)
-- Run this in the Supabase SQL Editor for project bwpnefdnhorjvhflbwhb.

create table if not exists rooms (
  code text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Realtime needs full row data on UPDATE payloads, not just changed columns.
alter table rooms replica identity full;

alter table rooms enable row level security;

-- Anonymous sign-ins get role 'authenticated' in Supabase, so this matches the
-- "auth != null" rule the app relied on under Firebase.
create policy "authenticated read rooms" on rooms
  for select using (auth.role() = 'authenticated');

create policy "authenticated insert rooms" on rooms
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated update rooms" on rooms
  for update using (auth.role() = 'authenticated');

-- Applies one or more path-scoped patches to a room's JSON state in a single
-- call, mirroring Firebase's update(ref, { 'a/b/c': value }) semantics.
-- p_ops: jsonb array of { "path": ["a","b"], "value": <any> }
create or replace function patch_room(p_code text, p_ops jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  op jsonb;
  op_path text[];
begin
  for op in select * from jsonb_array_elements(p_ops)
  loop
    select array_agg(value order by ordinality) into op_path
    from jsonb_array_elements_text(op -> 'path') with ordinality;

    update rooms
    set data = jsonb_set(coalesce(data, '{}'::jsonb), op_path, op -> 'value', true)
    where code = p_code;
  end loop;
end;
$$;

alter publication supabase_realtime add table rooms;
