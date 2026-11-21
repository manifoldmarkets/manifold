import { promises as fs } from 'fs'
import { join } from 'path'

const root = join(__dirname, '../test/fixtures/bdl')

function containsCredential(text: string) {
  // Decode JSON escapes before checking. Fixture files may never carry auth
  // metadata, even when the accompanying value happens to look synthetic.
  const json = JSON.stringify(JSON.parse(text))
  return (
    /"(?:headers|authorization|api[_-]?key|access[_-]?token)"\s*:/i.test(
      json
    ) || /\b(?:BALLDONTLIE_API_KEY|[a-f\d]{32,}|Bearer\s+[^"\s]+)\b/i.test(json)
  )
}

async function inspect(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) await inspect(file)
    else if (
      entry.name.endsWith('.json') &&
      containsCredential(await fs.readFile(file, 'utf8'))
    )
      throw new Error(
        'Remove credentials and headers from BDL fixture ' + entry.name
      )
  }
}

it('rejects credential-shaped values and authorization fields in fixtures', () => {
  expect(containsCredential(JSON.stringify({ body: { data: [] } }))).toBe(false)
  expect(containsCredential(JSON.stringify({ request: { headers: {} } }))).toBe(
    true
  )
  expect(containsCredential(JSON.stringify({ secret: 'a1'.repeat(16) }))).toBe(
    true
  )
  expect(containsCredential(JSON.stringify({ api_key: 'placeholder' }))).toBe(
    true
  )
})

it('keeps repository BDL fixtures free of headers and credentials', async () => {
  // Family tasks add the directory together with their first fixtures.
  try {
    await fs.access(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  await inspect(root)
})
