#!/usr/bin/env node
const { execSync, spawn } = require('child_process')

const [, , project, secret] = process.argv
if (!project || !secret) {
  console.error('usage: mcp-grafana.js <gcp-project> <secret-name>')
  process.exit(2)
}

let token
try {
  token = execSync(
    `gcloud secrets versions access latest --secret=${secret} --project=${project}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  ).trim()
} catch (err) {
  console.error(`failed to fetch secret ${secret} from ${project}`)
  process.exit(1)
}

try {
  execSync('command -v uvx', { stdio: 'ignore' })
} catch (err) {
  console.error(
    'uvx not found. Install it with:\n' +
      '  curl -LsSf https://astral.sh/uv/install.sh | sh\n' +
      'or see https://docs.astral.sh/uv/getting-started/installation/ for other options.\n' +
      'Then restart your editor/MCP client so it picks up the updated PATH.'
  )
  process.exit(1)
}

const child = spawn('uvx', ['mcp-grafana', '--disable-write'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    GRAFANA_URL: 'https://manifoldmarkets.grafana.net',
    GRAFANA_SERVICE_ACCOUNT_TOKEN: token,
  },
})
child.on('exit', (code) => process.exit(code ?? 1))
