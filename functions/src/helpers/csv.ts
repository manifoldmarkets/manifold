import * as fs from 'fs'

const SEPARATOR = ','

export const createCsv = <T extends { [field: string]: string }>(
  filename: string,
  fields: string[],
  data: T[]
) => {
  console.log('\n', 'creating', filename, '\n')

  return new Promise<void>((resolve) => {
    const firstLine = fields.join(SEPARATOR) + '\n'

    const lines =
      firstLine +
      data
        .map((datum) => {
          const values = fields.map((field) => datum[field] ?? '')
          return values.join(SEPARATOR)
        })
        .join('\n') +
      '\n'

    fs.writeFile(filename, lines, (err) => {
      if (err) console.log(err)
      resolve()
    })
  })
}

export const readCsv = async <T extends { [field: string]: string }>(
  filename: string
) => {
  const lines = await new Promise<string[]>((resolve, error) => {
    fs.readFile(filename, { encoding: 'utf-8' }, (err, data) => {
      if (err) error(err)
      else resolve(data.split('\n'))
    })
  })

  const fields = lines[0].split(SEPARATOR)

  const rows: T[] = []

  for (const line of lines.slice(1)) {
    const items = line.split(SEPARATOR)
    const row: { [field: string]: string } = {}

    for (let i = 0; i < items.length; i++) row[fields[i]] = items[i]

    rows.push(row as T)
  }

  return { rows, fields }
}
