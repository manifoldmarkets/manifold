import { Cron } from 'croner'
import * as express from 'express'
import * as admin from 'firebase-admin'
import { CONFIGS } from 'common/envs/constants'
import { loadSecretsToEnv } from 'common/secrets'
import { log } from './utils'
import { createJobs } from './jobs'

admin.initializeApp()

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

const app = express()
app.use(express.json())

const server = app.listen(PORT, async () => {
  log.info(`Running in ${process.env.ENVIRONMENT} listening on port ${PORT}.`)

  await loadSecretsToEnv()
  log.info('Loaded secrets from GCP.')

  const jobs = createJobs()
  const jobsByName = Object.fromEntries(jobs.map(j => [j.name, j]))
  log.info(`Loaded ${jobs.length} job(s).`, { names: Object.keys(jobsByName) })

  app.get('/', async (_req, res) => {
    return res.status(200).json({ status: 'running' })
  })

  app.get('/jobs', async (req, res) => {
    let candidates = jobs
    if (req.query.running) {
      candidates = candidates.filter(i => i.currentRun() != null)
    }
    if (req.query.paused) {
      candidates = candidates.filter(i => i.options.paused)
    }
    return res.status(200).json({
      jobs: candidates.map(j => ({
        name: j.name,
        schedule: j.getPattern(),
        isPaused: j.options.paused,
        currentRun: j.currentRun()?.toISOString(),
        nextRun: j.nextRun()?.toISOString()
      }))
    })
  })

  app.post('/jobs/:name/trigger', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: "Invalid job name." })
    }
    job.trigger()
    return res.status(200).json({ success: true })
  })

  app.post('/jobs/:name/pause', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: "Invalid job name." })
    }
    job.pause()
    return res.status(200).json({ success: true })
  })

  app.post('/jobs/:name/resume', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: "Invalid job name." })
    }
    job.resume()
    return res.status(200).json({ success: true })
  })
})

process.on('SIGTERM', () => {
  log.info('Received SIGTERM.');
  server.close((err) => { process.exit(err ? 1 : 0) });
});
