create table if not exists
  contract_movement_notifications (
    id bigint primary key generated always as identity,
    contract_id text not null,
    answer_id text,
    created_time timestamp with time zone default now() not null,
    user_id text not null,
    prev_val numeric not null,
    new_val numeric not null,
    prev_val_start_time timestamp with time zone default now() not null,
    new_val_start_time timestamp with time zone default now() not null,
    destination text not null, -- mobile, browser, email
    notification_id text,
    constraint fk_contract_id foreign key (contract_id) references contracts (id),
    constraint fk_user_id foreign key (user_id) references users (id)
  );

-- Row Level Security
alter table contract_movement_notifications enable row level security;

drop index if exists contract_notifications_contract_user_created_time_idx;

create index contract_notifications_contract_user_created_time_idx on contract_movement_notifications using btree (contract_id, user_id, created_time desc);

-- Add index to support the moving markets query
create index contract_notifications_created_time_contract_idx on contract_movement_notifications using btree (created_time desc, contract_id);
