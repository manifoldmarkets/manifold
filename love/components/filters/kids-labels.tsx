import { MdNoStroller, MdOutlineStroller, MdStroller } from 'react-icons/md'
import { Row } from 'web/components/layout/row'

export const NO_PREFERENCE_STRENGTH = -1
export const WANTS_KIDS_STRENGTH = 2
export const DOESNT_WANT_KIDS_STRENGTH = 0

export const kidsLabels = {
  no_preference: {
    name: 'No preference',
    icon: <MdOutlineStroller className="h-4 w-4" />,
  },
  wants_kids: {
    name: 'Wants kids',
    icon: <MdStroller className="h-4 w-4" />,
  },
  doesnt_want_kids: {
    name: `Doesn't want kids`,
    icon: <MdNoStroller className="h-4 w-4" />,
  },
}

export function KidsLabel(props: { strength: number }) {
  const { strength } = props
  return (
    <Row className="items-center gap-0.5">
      {strength == NO_PREFERENCE_STRENGTH
        ? kidsLabels.no_preference.icon
        : strength == WANTS_KIDS_STRENGTH
        ? kidsLabels.wants_kids.icon
        : kidsLabels.doesnt_want_kids.icon}
      {strength == NO_PREFERENCE_STRENGTH
        ? kidsLabels.no_preference.name
        : strength == WANTS_KIDS_STRENGTH
        ? kidsLabels.wants_kids.name
        : kidsLabels.doesnt_want_kids.name}
    </Row>
  )
}
