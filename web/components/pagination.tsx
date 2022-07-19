import clsx from 'clsx'

export function Pagination(props: {
  page: number
  itemsPerPage: number
  totalItems: number
  setPage: (page: number) => void
  scrollToTop?: boolean
  className?: string
  nextTitle?: string
  prevTitle?: string
}) {
  const {
    page,
    itemsPerPage,
    totalItems,
    setPage,
    scrollToTop,
    nextTitle,
    prevTitle,
    className,
  } = props

  const maxPage = Math.ceil(totalItems / itemsPerPage) - 1

  return (
    <nav
      className={clsx(
        'flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6',
        className
      )}
      aria-label="Pagination"
    >
      <div className="hidden sm:block">
        <p className="text-sm text-gray-700">
          Showing <span className="font-medium">{page * itemsPerPage + 1}</span>{' '}
          to{' '}
          <span className="font-medium">
            {Math.min(totalItems, (page + 1) * itemsPerPage)}
          </span>{' '}
          of <span className="font-medium">{totalItems}</span> results
        </p>
      </div>
      <div className="flex flex-1 justify-between sm:justify-end">
        {page > 0 && (
          <a
            href={scrollToTop ? '#' : undefined}
            className="relative inline-flex cursor-pointer select-none items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => page > 0 && setPage(page - 1)}
          >
            {prevTitle ?? 'Previous'}
          </a>
        )}
        <a
          href={scrollToTop ? '#' : undefined}
          className="relative ml-3 inline-flex cursor-pointer select-none items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          onClick={() => page < maxPage && setPage(page + 1)}
        >
          {nextTitle ?? 'Next'}
        </a>
      </div>
    </nav>
  )
}
