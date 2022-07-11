export function Pagination(props: {
  page: number
  itemsPerPage: number
  totalItems: number
  setPage: (page: number) => void
  scrollToTop?: boolean
}) {
  const { page, itemsPerPage, totalItems, setPage, scrollToTop } = props

  return (
    <nav
      className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6"
      aria-label="Pagination"
    >
      <div className="hidden sm:block">
        <p className="text-sm text-gray-700">
          Showing{' '}
          <span className="font-medium">
            {page === 0 ? page + 1 : page * itemsPerPage}
          </span>{' '}
          to <span className="font-medium">{(page + 1) * itemsPerPage}</span> of{' '}
          <span className="font-medium">{totalItems}</span> results
        </p>
      </div>
      <div className="flex flex-1 justify-between sm:justify-end">
        <a
          href={scrollToTop ? '#' : undefined}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => page > 0 && setPage(page - 1)}
        >
          Previous
        </a>
        <a
          href={scrollToTop ? '#' : undefined}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => page < totalItems / itemsPerPage && setPage(page + 1)}
        >
          Next
        </a>
      </div>
    </nav>
  )
}
