import clsx from 'clsx'
import GenderIcon, { Gender } from '../gender-icon'
import { Row } from 'web/components/layout/row'

export function GenderFilterText(props: {
  gender: Gender[] | undefined
  highlightedClass?: string
}) {
  const { gender, highlightedClass } = props

  if (!gender || gender.length < 1) {
    return (
      <span>
        <span className={clsx('text-semibold', highlightedClass)}>Any</span>{' '}
        gender
      </span>
    )
  }
  return (
    <Row className="items-center gap-0.5">
      {gender.map((g) => {
        return (
          <GenderIcon
            gender={g}
            className={clsx('h-4 w-4')}
            hasColor={!!highlightedClass}
          />
        )
      })}{' '}
      <span>gender{gender.length > 1 ? 's' : ''}</span>
    </Row>
  )
}
