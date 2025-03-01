import { StyleSheet, TouchableOpacity, Text, View } from 'react-native'
import { Row } from '../layout/row'
import { range } from 'lodash'

const PAGE_ELLIPSES = '...'

export function Pagination(props: {
  page: number
  pageSize: number
  totalItems: number
  setPage: (page: number) => void
}) {
  const { page, pageSize, totalItems, setPage } = props
  const maxPage = Math.ceil(totalItems / pageSize) - 1

  if (maxPage <= 0) return null

  const pageNumbers = getPageNumbers(maxPage, page)

  return (
    <View style={styles.container}>
      <Row style={styles.row}>
        <PaginationArrow
          onPress={() => setPage(page - 1)}
          disabled={page <= 0}
          direction="prev"
        />
        <Row style={styles.numbersRow}>
          {pageNumbers.map((pageNumber, index) => (
            <PageNumbers
              key={
                pageNumber === PAGE_ELLIPSES
                  ? `${pageNumber}-${index}`
                  : pageNumber
              }
              pageNumber={pageNumber}
              setPage={setPage}
              page={page}
            />
          ))}
        </Row>
        <PaginationArrow
          onPress={() => setPage(page + 1)}
          disabled={page >= maxPage}
          direction="next"
        />
      </Row>
    </View>
  )
}

function PaginationArrow(props: {
  onPress: () => void
  disabled: boolean
  direction: 'next' | 'prev'
}) {
  const { onPress, disabled, direction } = props
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.arrow, disabled && styles.arrowDisabled]}
    >
      <Text style={[styles.arrowText, disabled && styles.arrowTextDisabled]}>
        {direction === 'prev' ? '←' : '→'}
      </Text>
    </TouchableOpacity>
  )
}

function PageNumbers(props: {
  pageNumber: number | string
  setPage: (page: number) => void
  page: number
}) {
  const { pageNumber, setPage, page } = props
  if (pageNumber === PAGE_ELLIPSES || typeof pageNumber === 'string') {
    return <Text style={styles.ellipsis}>{PAGE_ELLIPSES}</Text>
  }
  return (
    <TouchableOpacity
      onPress={() => setPage(pageNumber)}
      style={[
        styles.pageButton,
        page === pageNumber && styles.pageButtonSelected,
      ]}
    >
      <Text
        style={[
          styles.pageText,
          page === pageNumber && styles.pageTextSelected,
        ]}
      >
        {pageNumber + 1}
      </Text>
    </TouchableOpacity>
  )
}

function getPageNumbers(maxPage: number, page: number): Array<number | string> {
  if (maxPage <= 7) {
    return range(0, maxPage + 1)
  }
  if (page < 4) {
    return Array.from<unknown, number | string>(
      { length: 5 },
      (_, index) => index
    ).concat([PAGE_ELLIPSES, maxPage])
  }
  if (page >= maxPage - 3) {
    return [0, PAGE_ELLIPSES].concat(
      Array.from<unknown, number | string>(
        { length: 5 },
        (_, index) => index + maxPage - 4
      )
    )
  }
  return [0, PAGE_ELLIPSES, page - 1, page, page + 1, PAGE_ELLIPSES, maxPage]
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  row: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  numbersRow: {
    gap: 8,
  },
  arrow: {
    padding: 8,
  },
  arrowDisabled: {
    opacity: 0.5,
  },
  arrowText: {
    fontSize: 20,
    color: '#ffffff',
  },
  arrowTextDisabled: {
    color: '#4b5563',
  },
  pageButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pageButtonSelected: {
    backgroundColor: '#374151',
  },
  pageText: {
    color: '#9ca3af',
    fontSize: 16,
  },
  pageTextSelected: {
    color: '#ffffff',
  },
  ellipsis: {
    color: '#4b5563',
    fontSize: 16,
  },
})
