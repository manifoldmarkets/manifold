create table
  leagues_season_end_times (
    season int primary key,
    end_time timestamp with time zone not null,
    status text not null default 'active' check (status in ('active', 'processing', 'complete'))
  );

-- Row Level Security
alter table leagues_season_end_times enable row level security;

-- Backfill script for leagues_season_end_times table
insert into
  leagues_season_end_times (season, end_time, status) -- Changed processed to status
values
  (1, '2023-06-01T12:06:23-07:00', 'complete'), -- Set status to complete
  (2, '2023-07-01T12:22:53-07:00', 'complete'),
  (3, '2023-08-01T17:05:29-07:00', 'complete'),
  (4, '2023-09-01T20:20:04-07:00', 'complete'),
  (5, '2023-10-01T11:17:16-07:00', 'complete'),
  (6, '2023-11-01T14:01:38-07:00', 'complete'),
  (7, '2023-12-01T14:02:25-08:00', 'complete'),
  (8, '2024-01-01T19:06:12-08:00', 'complete'),
  (9, '2024-02-01T17:51:49-08:00', 'complete'),
  (10, '2024-03-01T15:30:22-08:00', 'complete'),
  (11, '2024-04-01T21:43:18-08:00', 'complete'),
  (12, '2024-05-01T16:32:08-07:00', 'complete'),
  (13, '2024-06-01T11:10:19-07:00', 'complete'),
  (14, '2024-07-01T18:41:35-07:00', 'complete'),
  (15, '2024-08-01T22:11:54-07:00', 'complete'),
  (16, '2024-09-01T12:54:14-07:00', 'complete'),
  (17, '2024-10-01T15:55:00-07:00', 'complete'),
  (18, '2024-11-02T22:18:29+00:00', 'complete'),
  (19, '2024-12-02T10:19:34-08:00', 'complete'),
  (20, '2025-01-01T22:06:13-08:00', 'complete'),
  (21, '2025-02-01T22:18:13-08:00', 'complete'),
  (22, '2025-03-02T02:25:41-08:00', 'complete'),
  (23, '2025-04-01T20:32:23-08:00', 'complete')
  -- Add season 24 with status 'active' if it should be the current one
  -- (24, '2025-05-01T00:00:00-07:00', 'active') -- Example: Needs a placeholder or actual end time
on conflict (season) do
update
set
  end_time = EXCLUDED.end_time,
  status = EXCLUDED.status;

-- Changed processed to status
