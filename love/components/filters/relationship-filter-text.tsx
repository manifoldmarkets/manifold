import clsx from 'clsx'
import GenderIcon, { Gender } from '../gender-icon'
import { Row } from 'web/components/layout/row'
import {
  RelationshipType,
  convertRelationshipType,
} from 'love/lib/util/convert-relationship-type'
import stringOrStringArrayToText from 'love/lib/util/string-or-string-array-to-text'

export function RelationshipFilterText(props: {
  relationship: RelationshipType[] | undefined
  highlightedClass?: string
}) {
  const { relationship, highlightedClass } = props
  const relationshipLength = (relationship ?? []).length

  if (!relationship || relationshipLength < 1) {
    return (
      <span>
        <span className={clsx('text-semibold', highlightedClass)}>Any</span>{' '}
        relationship style
      </span>
    )
  }

  const convertedRelationships = relationship.map((r) =>
    convertRelationshipType(r)
  )

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
