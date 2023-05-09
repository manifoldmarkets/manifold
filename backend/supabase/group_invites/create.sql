create table if not exists
  group_invites (
    id text not null primary key default random_alphanumeric (12),
    group_id text not null,
    foreign key (group_id) references groups (id),
    created_time timestamptz not null default now(),
    duration interval default '1 week',
    is_forever boolean generated always as (
      case
        when duration is null then true
        else false
      end
    ) stored,
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

create
or replace function set_expire_time () returns trigger as $$
BEGIN
    IF NEW.duration IS NULL THEN
        NEW.expire_time = NULL;
    ELSE
        NEW.expire_time = NEW.created_time + NEW.duration;
    END IF;
    RETURN NEW;
END;
$$ language plpgsql;

create trigger populate_group_invites_expire_time before insert on group_invites for each row
execute function set_expire_time ();
