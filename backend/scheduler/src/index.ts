import * as fs from 'fs'
import * as path from 'path'
import { Cron } from 'croner'
import * as Handlebars from 'handlebars'
import * as express from 'express'
import * as basicAuth from 'express-basic-auth'
import * as admin from 'firebase-admin'
import { sortBy } from 'lodash'
import { CONFIGS } from 'common/envs/constants'
import { isProd } from 'shared/utils'
import { initGoogleCredentialsAndSecrets, log } from './utils'
import { createJobs } from './jobs'

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

function loadTemplate(filename: string) {
  const p = path.join(__dirname, './templates', filename)
  return Handlebars.compile(fs.readFileSync(p, 'utf8'))
}
const indexTemplate = loadTemplate('index.hbs')

const app = express()
app.use(express.json())

const server = app.listen(PORT, async () => {
  await initGoogleCredentialsAndSecrets()
  const prod = isProd()
  log.info(`Running in ${prod ? 'prod' : 'dev'} listening on port ${PORT}.`)
  app.use(
    basicAuth({
      users: { admin: process.env.SCHEDULER_AUTH_PASSWORD ?? '' },
      challenge: true,
      realm: prod
        ? 'scheduler.manifold.markets'
        : 'scheduler.dev.manifold.markets',
    })
  )

  const jobs = createJobs()
  const jobsByName = Object.fromEntries(jobs.map((j) => [j.name, j]))
  log.info(`Loaded ${jobs.length} job(s).`, { names: Object.keys(jobsByName) })

  app.get('/', async (_req, res) => {
    const now = Date.now()
    const jobsData = jobs.map((j) => {
      const currentRun = j.currentRun()
      const currentRunStart = currentRun?.toString()
      const currentRunDurationSecs = currentRun
        ? Math.ceil((now - currentRun.getTime()) / 1000)
        : null
      const nextRun = j.nextRun()
      const nextRunStart = nextRun?.toString()
      const nextRunInSecs = nextRun
        ? Math.ceil((nextRun.getTime() - now) / 1000)
        : null
      return {
        name: j.name,
        pattern: j.getPattern(),
        running: j.isBusy(),
        paused: (j as any)._states.paused,
        status: (j as any)._states.paused
          ? 'paused'
          : j.currentRun()
          ? 'running'
          : 'waiting',
        currentRunStart,
        currentRunDurationSecs,
        nextRunStart,
        nextRunInSecs,
      }
    })
    const sortedJobsData = sortBy(
      jobsData,
      (j) => (j.running ? 0 : 1),
      (j) => j.currentRunStart,
      (j) => j.name
    )
    res.set('Content-Type', 'text/html')
    return res.status(200).send(
      indexTemplate({
        env: isProd() ? 'Prod' : 'Dev',
        jobs: sortedJobsData,
      })
    )
  })

  app.post('/jobs/:name/trigger', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: 'Invalid job name.' })
    }
    job.trigger()
    return res.status(200).json({ success: true })
  })

  app.post('/jobs/:name/pause', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: 'Invalid job name.' })
    }
    job.pause()
    return res.status(200).json({ success: true })
  })

  app.post('/jobs/:name/resume', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: 'Invalid job name.' })
    }
    job.resume()
    return res.status(200).json({ success: true })
  })
})

process.on('SIGTERM', () => {
  log.info('Received SIGTERM.')
  server.close((err) => {
    process.exit(err ? 1 : 0)
  })
})
