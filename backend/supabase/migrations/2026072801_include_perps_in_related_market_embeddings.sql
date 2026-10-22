-- Include active perpetual markets in embedding-based related-market results.
-- Perps intentionally have no close_time, while ordinary markets retain the
-- existing requirement that their finite close_time is still in the future.
begin;

create or replace function public.close_contract_embeddings (
  input_contract_id text,
  similarity_threshold double precision,
  match_count integer
) returns table (
  contract_id text,
  similarity double precision,
  data jsonb
) language sql as $function$
with embedding as (
  select embedding
  from contract_embeddings
  where contract_id = input_contract_id
)
select contract_id,
  similarity,
  data
from public.search_contract_embeddings(
  (
    select embedding
    from embedding
  ),
  similarity_threshold,
  match_count + 500
)
join contracts on contract_id = contracts.id
where contract_id != input_contract_id
  and resolution_time is null
  and contracts.visibility = 'public'
  and (
    contracts.close_time > now()
    or (
      contracts.mechanism = 'perp'
      and contracts.close_time is null
      and public.is_valid_contract(contracts)
    )
  )
order by similarity * similarity * importance_score desc
limit match_count;
$function$;

commit;
