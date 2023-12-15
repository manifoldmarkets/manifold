import clsx from 'clsx'
import { Spacer } from '../layout/spacer'
import { Row } from '../layout/row'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/solid'
import { ReactNode, useEffect } from 'react'
import { range } from 'lodash'
import { usePathname, useRouter } from 'next/navigation'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'

export const PAGE_ELLIPSES = '...'

export function PaginationNextPrev(props: {
  className?: string
  prev?: ReactNode
  next?: ReactNode
  onClickPrev: () => void
  onClickNext: () => void
  scrollToTop?: boolean
}) {
  const { className, prev, next, onClickPrev, onClickNext, scrollToTop } = props
  return (
    <Row className={clsx(className, 'flex-1 justify-between sm:justify-end')}>
      {prev != null && (
        <a
          href={scrollToTop ? '#' : undefined}
          className="border-ink-300 text-ink-700 hover:bg-canvas-50 bg-canvas-0 relative inline-flex cursor-pointer select-none items-center rounded-md border px-4 py-2 text-sm font-medium"
          onClick={onClickPrev}
        >
          {prev ?? 'Previous'}
        </a>
      )}
      {next != null && (
        <a
          href={scrollToTop ? '#' : undefined}
          className="border-ink-300 text-ink-700 hover:bg-canvas-50 bg-canvas-0 relative ml-3 inline-flex cursor-pointer select-none items-center rounded-md border px-4 py-2 text-sm font-medium"
          onClick={onClickNext}
        >
          {next ?? 'Next'}
        </a>
      )}
    </Row>
  )
}

export function Pagination(props: {
  page: number
  itemsPerPage: number
  totalItems: number
  setPage: (page: number) => void
  className?: string
  savePageToQuery?: boolean
}) {
  const {
    page,
    itemsPerPage,
    totalItems,
    setPage,
    className,
    savePageToQuery,
  } = props
  const router = useRouter()
  const { searchParams, createQueryString } = useDefinedSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    if (!savePageToQuery) return
    const p = searchParams.get('p')
    if (p && page !== parseInt(p as string)) {
      setPage(parseInt(p as string))
    } else if (!p && page !== 0) {
      setPage(0)
    }
  }, [searchParams])

  const onClick = (page: number) => {
    if (savePageToQuery) {
      router.push(pathname + '?' + createQueryString('p', page.toString()))
    } else setPage(page)
  }

  const maxPage = Math.ceil(totalItems / itemsPerPage) - 1

  if (maxPage <= 0) return <Spacer h={4} />

  const pageNumbers = getPageNumbers(maxPage, page)
  return (
    <nav
      className={clsx(
        'flex w-full items-center bg-inherit pb-4 pt-2',
        className
      )}
      aria-label="Pagination"
    >
      <Row className="mx-auto gap-4">
        <PaginationArrow
          onClick={() => onClick(page - 1)}
          disabled={page <= 0}
          nextOrPrev="prev"
        />
        <Row className="gap-2">
          {pageNumbers.map((pageNumber, index) => (
            <PageNumbers
              key={
                pageNumber === PAGE_ELLIPSES
                  ? `${pageNumber}-${index}`
                  : pageNumber
              }
              pageNumber={pageNumber}
              setPage={onClick}
              page={page}
            />
          ))}
        </Row>
        <PaginationArrow
          onClick={() => onClick(page + 1)}
          disabled={page >= maxPage}
          nextOrPrev="next"
        />
      </Row>
    </nav>
  )
}

export function PaginationArrow(props: {
  onClick: () => void
  disabled: boolean
  nextOrPrev: 'next' | 'prev'
}) {
  const { onClick, disabled, nextOrPrev } = props
  return (
    <div
      onClick={onClick}
      className={clsx(
        'select-none rounded-lg transition-colors',
        disabled
          ? 'text-ink-200 pointer-events-none'
          : 'hover:bg-ink-100 text-primary-700 cursor-pointer'
      )}
    >
      {nextOrPrev === 'prev' && (
        <ChevronLeftIcon className="h-[24px] w-[24px]" />
      )}
      {nextOrPrev === 'next' && (
        <ChevronRightIcon className="h-[24px] w-[24px]" />
      )}
    </div>
  )
}

export function PageNumbers(props: {
  pageNumber: PageNumbers
  setPage: (page: number) => void
  page: number
}) {
  const { pageNumber, setPage, page } = props
  if (pageNumber === PAGE_ELLIPSES || typeof pageNumber === 'string') {
    return <div className="text-ink-400 select-none">{PAGE_ELLIPSES}</div>
  }
  return (
    <button
      onClick={() => setPage(pageNumber)}
      className={clsx(
        'select-none rounded-lg px-2',
        page === pageNumber
          ? 'bg-primary-100 text-primary-700'
          : 'text-ink-400 hover:bg-ink-100'
      )}
    >
      {pageNumber + 1}
    </button>
  )
}

type PageNumbers = number | string

function getPageNumbers(maxPage: number, page: number): Array<PageNumbers> {
  if (maxPage <= 7) {
    return range(0, maxPage + 1)
  }
  if (page < 4) {
    return Array.from<unknown, PageNumbers>(
      { length: 5 },
      (_, index) => index
    ).concat([PAGE_ELLIPSES, maxPage])
  }
  if (page >= maxPage - 3) {
    return [0, PAGE_ELLIPSES].concat(
      Array.from<unknown, PageNumbers>(
        { length: 5 },
        (_, index) => index + maxPage - 4
      )
    )
  }
  return [0, PAGE_ELLIPSES, page - 1, page, page + 1, PAGE_ELLIPSES, maxPage]
}
