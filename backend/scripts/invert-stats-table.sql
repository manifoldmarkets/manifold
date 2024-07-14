create table daily_stats as
WITH unnested AS (
  SELECT 
    title,
    unnest(daily_values) AS value,
    generate_series(0, array_length(daily_values, 1)) AS day_number
  FROM stats
),
days AS (
  SELECT generate_series(
    (SELECT MIN(day_number) FROM unnested),
    (SELECT MAX(day_number) FROM unnested)
  ) AS day_number
)
SELECT 
  days.day_number AS day,
  max(case when title = 'dailyActiveUsers' then value end) as dau,
  max(case when title = 'weeklyActiveUsers' then value end) as wau,
  max(case when title = 'monthlyActiveUsers' then value end) as mau,
  max(case when title = 'avgDailyUserActions' then value end) as avg_user_actions,
  max(case when title = 'dailySales' then value end) as sales,
  max(case when title = 'engagedUsers' then value end) as engaged_users,
  max(case when title = 'd1' then value end) as d1,
  max(case when title = 'nd1' then value end) as nd1,
  max(case when title = 'nw1' then value end) as nw1,
  max(case when title = 'fracDaysActiveD1ToD3' then value end) as active_d1_to_d3,
  max(case when title = 'dailyBetCounts' then value end) bet_count,
  max(case when title = 'dailyContractCounts' then value end) as contract_count,
  max(case when title = 'dailyCommentCounts' then value end) as comment_count,
  max(case when title = 'dailySignups' then value end) as signups,
  max(case when title = 'dailyNewRealUserSignups' then value end) as signups_real,
  max(case when title = 'weekOnWeekRetention' then value end) as w1,
  max(case when title = 'monthlyRetention' then value end) as m1,
  max(case when title = 'dailyActivationRate' then value end) as activation,
  max(case when title = 'manaBetDaily' then value end) as bet_amount,
  max(case when title = 'd1BetAverage' then value end) as d1_bet_average,
  max(case when title = 'd1Bet3DayAverage' then value end) as d1_bet_3_day_average,
  max(case when title = 'feedConversionScores' then value end) as feed_conversion
FROM 
  days
LEFT JOIN unnested ON days.day_number = unnested.day_number
GROUP BY days.day_number
ORDER BY days.day_number;

-- put finishing touches on table

alter table daily_stats
add column start_date date;

-- select (daily_values) from stats
-- where title = 'startDate'
-- > 1688886000000
update daily_stats
set start_date = date (millis_to_ts (1688886000000)) + day;

alter table daily_stats
drop column day;

alter table daily_stats
add primary key (start_date),
alter column start_date set not null;

create policy "public read" on daily_stats
  for select using (true);
