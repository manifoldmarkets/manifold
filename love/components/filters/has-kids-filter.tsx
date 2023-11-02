import { ReactNode } from 'react'
import { MdNoStroller, MdOutlineStroller, MdStroller } from 'react-icons/md'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { FilterFields } from './search'
import { FaChild } from 'react-icons/fa6'

export const NO_PREFERENCE_STRENGTH = -1
export const WANTS_KIDS_STRENGTH = 2
export const DOESNT_WANT_KIDS_STRENGTH = 0

interface HasKidLabel {
  name: string
  shortName: string
  value: number
}

interface HasKidsLabelsMap {
  [key: string]: HasKidLabel
}

export const hasKidsLabels: HasKidsLabelsMap = {
  no_preference: {
    name: 'Either',
    shortName: 'Either',
    value: -1,
  },
  has_kids: {
    name: 'Has kids',
    shortName: 'Yes',
    value: 1,
  },
  doesnt_have_kids: {
    name: `Doesn't have kids`,
    shortName: 'No',
    value: 0,
  },
}

const generateChoicesMap = (
  labels: HasKidsLabelsMap
): Record<string, number> => {
  return Object.values(labels).reduce(
    (acc: Record<string, number>, label: HasKidLabel) => {
      acc[label.shortName] = label.value
      return acc
    },
    {}
  )
}

export function HasKidsLabel(props: {
  has_kids: number
  highlightedClass?: string
}) {
  const { has_kids, highlightedClass } = props
  return (
    <Row className="items-center gap-0.5">
      <FaChild className="h-4 w-4" />
      <span className={highlightedClass}>
        {has_kids == hasKidsLabels.has_kids.value
          ? hasKidsLabels.has_kids.name
          : has_kids == hasKidsLabels.doesnt_have_kids.value
          ? hasKidsLabels.doesnt_have_kids.name
          : hasKidsLabels.no_preference.name}
      </span>
    </Row>
  )
}

export function HasKidsFilter(props: {
  filters: Partial<FilterFields>
  updateFilter: (newState: Partial<FilterFields>) => void
}) {
  const { filters, updateFilter } = props
  return (
    <ChoicesToggleGroup
      currentChoice={filters.wants_kids_strength ?? 0}
      choicesMap={generateChoicesMap(hasKidsLabels)}
      setChoice={(c) => updateFilter({ wants_kids_strength: Number(c) })}
      toggleClassName="w-1/3 justify-center"
    />
  )
}
