drop table group_invites;

create table if not exists
  group_invites (
    id text not null primary key default random_alphanumeric (12),
    group_id text not null,
    foreign key (group_id) references groups (id),
    created_time timestamptz not null default now(),
    duration interval default '1 week',
    is_forever boolean not null default false,
    check (
      (
        duration is null
        and is_forever = true
      )
      or (duration is not null)
    ),
    uses numeric not null default 0,
    max_uses numeric default null,
    is_max_uses_reached boolean generated always as (
      case
        when max_uses is null then false
        else uses >= max_uses
      end
    ) stored,
    expire_time timestamptz
  );

  CREATE OR REPLACE FUNCTION set_expire_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.duration IS NULL THEN
        NEW.expire_time = NULL;
    ELSE
        NEW.expire_time = NEW.created_time + NEW.duration;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER populate_group_invites_expire_time
BEFORE INSERT ON group_invites
FOR EACH ROW
EXECUTE FUNCTION set_expire_time();
