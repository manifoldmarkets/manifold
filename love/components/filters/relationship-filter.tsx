import clsx from 'clsx'
import GenderIcon, { Gender } from '../gender-icon'
import { Row } from 'web/components/layout/row'
import {
  RelationshipType,
  convertRelationshipType,
} from 'love/lib/util/convert-relationship-type'
import stringOrStringArrayToText from 'love/lib/util/string-or-string-array-to-text'
import { FilterFields } from './search'
import { MultiCheckbox } from 'web/components/multi-checkbox'

export function RelationshipFilterText(props: {
  relationship: RelationshipType[] | undefined
  highlightedClass?: string
}) {
  const { relationship, highlightedClass } = props
  const relationshipLength = (relationship ?? []).length

  if (!relationship || relationshipLength < 1) {
    return <span className={clsx('text-semibold', highlightedClass)}>Any</span>
  }

  const convertedRelationships = relationship.map((r) =>
    convertRelationshipType(r)
  )

  if (relationshipLength > 1) {
    return (
      <span>
        <span className={clsx('text-semibold', highlightedClass)}>
          Multiple
        </span>
      </span>
    )
  }
  return (
    <div>
      <span className={highlightedClass}>
        {stringOrStringArrayToText({
          text: convertedRelationships,
          capitalizeFirstLetterOption: true,
        })}{' '}
      </span>
    </div>
  )
}

export function RelationshipFilter(props: {
  filters: Partial<FilterFields>
  updateFilter: (newState: Partial<FilterFields>) => void
}) {
  const { filters, updateFilter } = props
  return (
    <MultiCheckbox
      selected={filters.pref_relation_styles ?? []}
      choices={
        {
          Monogamous: 'mono',
          Polyamorous: 'poly',
          'Open Relationship': 'open',
          Other: 'other',
        } as any
      }
      onChange={(c) => {
        updateFilter({ pref_relation_styles: c })
      }}
    />
  )
}
