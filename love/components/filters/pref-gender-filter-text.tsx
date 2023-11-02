import clsx from 'clsx'
import GenderIcon, { Gender } from '../gender-icon'
import { Row } from 'web/components/layout/row'

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
    <Row className="gap-0.5">
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
