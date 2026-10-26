-- Users who applied to an employer's roles via the /jobs board.
--
-- One row per (user, employer), inserted by the set-job-applied endpoint when
-- a signed-in user clicks an apply link. Applying to any of an employer's
-- roles counts for all of them. Employer slugs come from JOB_EMPLOYERS in
-- common/src/job-seeker.ts.
--
-- Use it to keep applicants out of that employer's update emails to the
-- registered job seekers in job_seeker_interest:
--   select i.user_id
--   from job_seeker_interest i
--   where i.open_to_contact
--     and not exists (
--       select 1 from job_board_applications a
--       where a.user_id = i.user_id and a.employer = 'upstart'
--     );
create table if not exists
  job_board_applications (
    user_id text not null references users (id),
    employer text not null,
    created_time timestamptz not null default now(),
    primary key (user_id, employer)
  );

-- Private applicant data, same model as job_seeker_interest: backend endpoints
-- use the direct client (bypasses RLS); REST clients may only read their own
-- rows.
alter table job_board_applications enable row level security;

drop policy if exists "own read" on job_board_applications;

create policy "own read" on job_board_applications for
select
  using (firebase_uid () = user_id);
