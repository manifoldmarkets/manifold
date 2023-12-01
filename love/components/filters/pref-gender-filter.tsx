import clsx from 'clsx'
import GenderIcon, { Gender } from '../gender-icon'
import { Row } from 'web/components/layout/row'
import { MultiCheckbox } from 'web/components/multi-checkbox'
import { FilterFields } from './search'

export function PrefGenderFilterText(props: {
  pref_gender: Gender[] | undefined
  highlightedClass?: string
}) {
  const { pref_gender, highlightedClass } = props

  if (!pref_gender || pref_gender.length < 1) {
    return (
      <span>
        <span className="hidden sm:inline">Interested in </span>
        <span
          className={clsx(
            'text-semibold capitalize sm:normal-case',
            highlightedClass
          )}
        >
          any
        </span>
      </span>
    )
  }
  return (
    <Row className="items-center gap-0.5">
      <span className="hidden sm:inline">Interested in </span>
      {pref_gender.map((gender) => {
        return (
          <GenderIcon
            key={gender}
            gender={gender}
            className={clsx('h-4 w-4')}
            hasColor={!!highlightedClass}
          />
        )
      })}
    </Row>
  )
}

export function PrefGenderFilter(props: {
  filters: Partial<FilterFields>
  updateFilter: (newState: Partial<FilterFields>) => void
}) {
  const { filters, updateFilter } = props
  return (
    <MultiCheckbox
      selected={filters.pref_gender ?? []}
      choices={{
        Women: 'female',
        Men: 'male',
        'Non-binary': 'non-binary',
        'Trans-women': 'trans-female',
        'Trans-men': 'trans-male',
      }}
      onChange={(c) => {
        updateFilter({ pref_gender: c })
      }}
    />
  )
}
