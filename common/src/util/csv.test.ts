import { csvToRecords, parseCsv } from './csv'

describe('parseCsv', () => {
  it('parses plain rows with LF and CRLF endings', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('handles quoted fields with commas, newlines, and escaped quotes', () => {
    const text = 'name,desc\n"GPT-5.5, Pro","said ""hi""\nsecond line"'
    expect(parseCsv(text)).toEqual([
      ['name', 'desc'],
      ['GPT-5.5, Pro', 'said "hi"\nsecond line'],
    ])
  })

  it('keeps empty fields', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ])
  })
})

describe('csvToRecords', () => {
  it('maps header to fields and skips blank trailing lines', () => {
    const text = 'Model version,ECI Score,Release date\nm1,151.5,2026-06-16\n'
    expect(csvToRecords(text)).toEqual([
      {
        'Model version': 'm1',
        'ECI Score': '151.5',
        'Release date': '2026-06-16',
      },
    ])
  })

  it('fills missing trailing fields with empty strings', () => {
    expect(csvToRecords('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }])
  })
})
