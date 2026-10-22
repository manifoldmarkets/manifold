import { findPhones, scrubPhones } from './phone'

// Fictional numbers only: NANP 555-01xx, Ofcom's drama range (020 7946 0xxx),
// ACMA's (0491 570 xxx) and ARCEP's (01 99 00 xx xx).
const PHONES = [
  '(201) 555-0123',
  '201-555-0123',
  '201.555.0123',
  '201 555 0123',
  '1-201-555-0123',
  '+1 201 555 0123',
  '+1 (201) 555-0123',
  '+12015550123',
  '+44 20 7946 0958',
  '020 7946 0958',
  '+61 491 570 006',
  '0491 570 006',
  '020 79460958',
  '(020) 7946 0958',
  '01 99 00 12 34',
  '+1--(201)--555--01--23', // spam-style doubled separators
  '+1---(201)--555--0123',
]

const NOT_PHONES = [
  '2025-01-31', // ISO date
  '2025-01-31T22:00:00Z',
  '01/31/2025', // slash dates
  '31.01.2025',
  '12:30:45', // time
  '0.12 0.15 0.18 0.22', // probability list
  'probabilities 0.25, 0.30, 0.45',
  '73.5%',
  '$1,234,567', // currency, thousands separators
  '1,234,567',
  'M$100000',
  '20240131', // ungrouped digit runs: dates, ids, timestamps, counts
  '1700000000000',
  '2147483647',
  '100 250 500 1000 2000', // a run of numbers
  'v1.2.3456',
  '192.168.100.200',
  'ISBN 978-3-16-148410-0',
  'the score was 101-99',
  '2024-2025 season',
  '10.000.000',
  '+5%',
  '+0.25',
  '+12.5% to 47.3%',
  'change +44.2079460958', // a signed decimal
  '/// /// 05 022430 1631N 07600W', // recon data: 8 digits after a trunk 0
  '+130 +146 177126 129', // signed numbers in a data row
  '1. ($518.53 | +1155.74cr settled)',
  'const y = x+12015550123;', // arithmetic in code
  '(555) 123-4567', // shaped like one, but 555 is not an area code
  '123-456-7890',
]

describe('findPhones', () => {
  test.each(PHONES)('finds %s', (p) => {
    const text = `call ${p} today`
    const spans = findPhones(text)
    expect(spans.map(([s, e]) => text.slice(s, e))).toEqual([p])
  })

  test.each(NOT_PHONES)('leaves %s', (s) => {
    expect(findPhones(`value ${s} here`)).toEqual([])
  })

  test('a letter right before the +', () => {
    const text = 'WhatsApp+1 (201) 555-0123 now'
    expect(findPhones(text).map(([s, e]) => text.slice(s, e))).toEqual([
      '+1 (201) 555-0123',
    ])
  })

  test('several in one text, a date between them', () => {
    const text =
      'Reach me on 201-555-0123 or +44 20 7946 0958 before 2025-01-31.'
    expect(scrubPhones(text, '[phone removed]', () => undefined)).toBe(
      'Reach me on [phone removed] or [phone removed] before 2025-01-31.'
    )
  })

  test('counts each match once', () => {
    let n = 0
    scrubPhones('201-555-0123, 201-555-0199', 'x', () => n++)
    expect(n).toBe(2)
  })
})
