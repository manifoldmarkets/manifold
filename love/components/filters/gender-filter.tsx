import clsx from 'clsx'
import GenderIcon, { Gender } from '../gender-icon'
import { Row } from 'web/components/layout/row'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { FilterFields } from './search'

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
            key={g}
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

export function GenderFilter(props: {
  filters: Partial<FilterFields>
  updateFilter: (newState: Partial<FilterFields>) => void
}) {
  const { filters, updateFilter } = props
  return (
    <>
      <MultiCheckbox
        selected={filters.genders ?? []}
        choices={
          {
            Women: 'female',
            Men: 'male',
            'Non-binary': 'non-binary',
            'Trans-women': 'trans-female',
            'Trans-men': 'trans-male',
          } as any
        }
        onChange={(c) => {
          updateFilter({ genders: c })
        }}
      />
    </>
  )
}
