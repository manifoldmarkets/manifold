create table if not exists
  manalinks (
    id text not null primary key,
    amount numeric null,
    created_time timestamptz null,
    expires_time timestamptz null,
    creator_id text null,
    max_uses int null,
    message text null,
    data jsonb not null,
    fs_updated_time timestamp not null
  );

create index if not exists manalinks_creator_id on manalinks (creator_id);

alter table manalinks
cluster on manalinks_creator_id;

create
or replace function manalinks_populate_cols () returns trigger language plpgsql as $$ begin
    if new.data is not null then
        new.amount := ((new.data)->>'amount')::numeric;
        new.created_time :=
                case when new.data ? 'createdTime' then millis_to_ts(((new.data) ->> 'createdTime')::bigint) else null end;
        new.expires_time :=
                case when new.data ? 'expiresTime' then millis_to_ts(((new.data) ->> 'expiresTime')::bigint) else null end;
        new.creator_id := (new.data)->>'fromId';
        new.max_uses := ((new.data)->>'maxUses')::numeric;
        new.message := (new.data)->>'message';
        if (new.data)->'claims' is not null then
            delete from manalink_claims where manalink_id = new.id;
            with claims as (select new.id, jsonb_array_elements((new.data)->'claims') as cdata)
            insert into manalink_claims (manalink_id, txn_id) select id, cdata->>'txnId' from claims;
        end if;
    end if;
    return new;
end $$;

drop trigger manalinks_populate on manalinks;

create trigger manalinks_populate before insert
or
update on manalinks for each row
execute function manalinks_populate_cols ();

create table if not exists
  manalink_claims (
    manalink_id text not null,
    txn_id text not null,
    primary key (manalink_id, txn_id)
  );

alter table manalink_claims
cluster on manalink_claims_pkey;
