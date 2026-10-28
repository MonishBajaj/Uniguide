-- A season pass is reported by my_entitlement and makes AI writing actions free while it lasts.
create or replace function public.my_entitlement() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then 'none'
    when exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.refunded_at is null and now() between e.starts_at and e.ends_at
    ) then 'season_pass'
    else 'free'
  end;
$$;

CREATE OR REPLACE FUNCTION public.record_writing_review(p_version_id uuid, p_kind text, p_model text, p_prompt_version text, p_result jsonb, p_compared_version_id uuid DEFAULT NULL::uuid, p_ai_run_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_cost integer;
  v_id uuid;
begin
  if v_uid is null or not public.can_process_personal_data(v_uid) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.document_versions where id = p_version_id and user_id = v_uid)
     or (p_compared_version_id is not null
         and not exists (select 1 from public.document_versions where id = p_compared_version_id and user_id = v_uid)) then
    raise exception 'Not your draft' using errcode = '42501';
  end if;
  v_cost := case
    when public.my_entitlement() = 'season_pass' then 0
    when p_kind = 'rubric' and not exists (select 1 from public.reviews where user_id = v_uid and kind = 'rubric') then 0
    else 1
  end;
  if v_cost > 0 then
    -- Serialise per user so two simultaneous reviews cannot both spend the last credit.
    perform pg_advisory_xact_lock(hashtext(v_uid::text));
    if public.credit_balance(v_uid) < v_cost then
      raise exception 'insufficient_credits' using errcode = 'P0001';
    end if;
    insert into public.credit_ledger (user_id, delta, reason)
    values (v_uid, -v_cost, case when p_kind = 'rubric' then 'writing_review' else 'draft_comparison' end);
  end if;
  insert into public.reviews (user_id, version_id, compared_version_id, kind, model, prompt_version, result, ai_run_id)
  values (v_uid, p_version_id, p_compared_version_id, p_kind, p_model, p_prompt_version, p_result, p_ai_run_id)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.writing_allowance() returns table (free_review boolean, balance integer)
language sql stable security definer set search_path = '' as $$
  select public.my_entitlement() = 'season_pass'
         or not exists (select 1 from public.reviews where user_id = auth.uid() and kind = 'rubric'),
         public.credit_balance(auth.uid());
$$;
