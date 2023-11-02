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

  console.log(pref_gender)
  if (!pref_gender || pref_gender.length < 1) {
    return (
      <span>
        Interested in{' '}
        <span className={clsx('text-semibold', highlightedClass)}>any</span>
      </span>
    )
  }
  return (
    <Row className="items-center gap-0.5">
      Interested in{' '}
      {pref_gender.map((gender) => {
        return (
          <GenderIcon
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
      choices={
        {
          Male: 'male',
          Female: 'female',
          'Non-binary': 'non-binary',
          'Trans-female': 'trans-female',
          'Trans-male': 'trans-male',
        } as any
      }
      onChange={(c) => {
        updateFilter({ pref_gender: c })
      }}
    />
  )
}
