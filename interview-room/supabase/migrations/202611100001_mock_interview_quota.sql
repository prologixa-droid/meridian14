create schema if not exists private;
grant usage on schema private to service_role;

create table if not exists private.mock_interview_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

revoke all on table private.mock_interview_usage from public, anon, authenticated;
grant select, insert, update on table private.mock_interview_usage to service_role;

create or replace function public.consume_mock_interview_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path=private,public,auth
as $$
declare v_count integer;
begin
  insert into private.mock_interview_usage(user_id,window_started_at,request_count)
  values(p_user_id,now(),1)
  on conflict(user_id) do update set
    request_count=case when private.mock_interview_usage.window_started_at < now()-interval '24 hours' then 1 else private.mock_interview_usage.request_count+1 end,
    window_started_at=case when private.mock_interview_usage.window_started_at < now()-interval '24 hours' then now() else private.mock_interview_usage.window_started_at end
  returning request_count into v_count;
  return v_count<=60;
end;
$$;

revoke all on function public.consume_mock_interview_quota(uuid) from public,anon,authenticated;
grant execute on function public.consume_mock_interview_quota(uuid) to service_role;
