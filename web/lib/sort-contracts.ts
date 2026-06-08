import { Contract } from 'common/contract'

export type SortKey =
  | 'manual'
  | 'date'
  | 'volume'
  | 'title'
  | 'newest'
  | 'oldest'

export function sortContracts(
  contracts: Contract[],
  slugOrder: string[],
  sort: SortKey
): Contract[] {
  if (sort === 'manual') {
    return slugOrder
      .map((slug) => contracts.find((c) => c.slug === slug))
      .filter((c): c is Contract => !!c)
  }
  const sorted = [...contracts]
  if (sort === 'date')
    sorted.sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0))
  else if (sort === 'volume')
    sorted.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  else if (sort === 'title')
    sorted.sort((a, b) => a.question.localeCompare(b.question))
  else if (sort === 'newest')
    sorted.sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0))
  else if (sort === 'oldest')
    sorted.sort((a, b) => (a.createdTime ?? 0) - (b.createdTime ?? 0))
  return sorted
}
