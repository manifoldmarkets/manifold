-- Every ranked user's place on each sports board, which the scheduler's
-- update-sports-leaderboards job rewrites hourly with the boards. The boards
-- (sports_leaderboards) keep the top 50; this lets a page show a signed-in
-- user where they stand on any board. `board` is a sport key ('all' for every
-- sport) or a topic's ('topic:<id>'); `kind` is 'profit' or 'creator'.
create table if not exists
  sports_leaderboard_positions (
    board text not null,
    kind text not null,
    user_id text not null,
    rank int not null,
    score numeric not null,
    primary key (board, kind, user_id)
  );

-- The scheduler writes and the API reads.
alter table sports_leaderboard_positions enable row level security;
