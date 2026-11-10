// Syncs repo copies of email templates (backend/email-templates/<name>.html)
// to the live Mailgun-hosted templates on mg.manifold.markets. Repo edits do
// nothing until uploaded with this script.
//
// Usage:
//   ts-node update-email-templates.ts interesting-markets sign-up-bonus-with-interesting-markets
//   ts-node update-email-templates.ts interesting-markets --go
//
// Dry-runs by default; pass --go to actually POST a new active version.
// Mailgun keeps prior versions of each template, so this is reversible from
// the Mailgun dashboard (Sending > Templates > <name> > Versions). Mailgun
// also caps the number of stored versions per template — if the POST returns
// a version-limit error, delete old versions in the dashboard and re-run.
import { readFileSync } from 'fs'
import { join } from 'path'
import { runScript } from 'run-script'

const MAILGUN_DOMAIN = 'mg.manifold.markets'

if (require.main === module) {
  runScript(async () => {
    const args = process.argv.slice(2)
    const go = args.includes('--go')
    const templateNames = args.filter((a) => a !== '--go')

    if (templateNames.length === 0) {
      console.log(
        'Usage: ts-node update-email-templates.ts <template-name> [<template-name> ...] [--go]'
      )
      console.log(
        'Template names correspond to files in backend/email-templates/<name>.html'
      )
      console.log(
        'Dry-runs by default; pass --go to upload a new active version to Mailgun.'
      )
      return
    }

    for (const name of templateNames) {
      const filePath = join(__dirname, '..', 'email-templates', `${name}.html`)
      const template = readFileSync(filePath, 'utf8')
      const bytes = Buffer.byteLength(template, 'utf8')
      const url = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/templates/${name}/versions`

      if (!go) {
        console.log(
          `[dry run] ${name}: ${bytes} bytes — would POST a new active version to ${url}`
        )
        continue
      }

      const apiKey = process.env.MAILGUN_KEY
      if (!apiKey) throw new Error('Missing MAILGUN_KEY')

      const tag = `repo-sync-${new Date().toISOString().slice(0, 10)}`
      console.log(`Uploading ${name} (${bytes} bytes) as version ${tag}...`)

      const body = new URLSearchParams({
        template,
        tag,
        active: 'yes',
      })
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString(
            'base64'
          )}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      console.log(`${name}: ${res.status} ${res.statusText}`)
      console.log(await res.text())
    }
  })
}
