import { runMajorLifecycle, type MajorJob } from 'shared/bdl/major-lifecycle'

export const majorSportsJob = (job: MajorJob) => async () => {
  await runMajorLifecycle(job)
}
