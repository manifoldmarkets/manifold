export function getCurrentFilter(
  filter: string,
  filterState: string,
  sort: string
) {
  return sort === 'close-date'
    ? 'open'
    : sort === 'resolve-date'
    ? 'resolved'
    : filterState
}
