#!/usr/bin/env node
const { execSync, spawn } = require('child_process')

const [, , project, secret] = process.argv
if (!project || !secret) {
  console.error('usage: mcp-postgres.js <gcp-project> <secret-name>')
  process.exit(2)
}

let conn
try {
  conn = execSync(
    `gcloud secrets versions access latest --secret=${secret} --project=${project}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  ).trim()
} catch (err) {
  console.error(`failed to fetch secret ${secret} from ${project}`)
  process.exit(1)
}

const child = spawn(
  'npx',
  ['-y', '@modelcontextprotocol/server-postgres', conn],
  { stdio: 'inherit', shell: true }
)
child.on('exit', (code) => process.exit(code ?? 1))
