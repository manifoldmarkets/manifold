create table if not exists
  dashboard_groups (
    dashboard_id text not null,
    foreign key (dashboard_id) references dashboards (id),
    group_id text not null,
    foreign key (group_id) references groups (id),
    primary key (dashboard_id, group_id)
  );

alter table dashboard_groups enable row level security;

create policy "Enable read access for admin" on public.dashboard_groups for
select
  to service_role using (true);
