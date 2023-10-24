import {
  PiGenderFemaleBold,
  PiGenderMaleBold,
  PiGenderNonbinaryBold,
  PiGenderTransgenderBold,
} from 'react-icons/pi'
import { BsFillPersonFill } from 'react-icons/bs'
import { capitalizeFirstLetter } from 'web/lib/util/capitalize-first-letter'

export type Gender =
  | 'male'
  | 'female'
  | 'non-binary'
  | 'trans-male'
  | 'trans-female'

export function convertGender(gender: Gender) {
  if (gender == 'male') {
    return 'Man'
  }
  if (gender == 'female') {
    return 'Woman'
  }
  if (gender == 'trans-female') {
    return 'Trans woman'
  }
  if (gender == 'trans-male') {
    return 'Trans man'
  }
  return capitalizeFirstLetter(gender)
}

export function convertGenderPlural(gender: Gender) {
  if (gender == 'male') {
    return 'Men'
  }
  if (gender == 'female') {
    return 'Women'
  }
  if (gender == 'trans-female') {
    return 'Trans women'
  }
  if (gender == 'trans-male') {
    return 'Trans men'
  }
  return capitalizeFirstLetter(gender)
}

export default function GenderIcon(props: {
  gender: Gender
  className: string
}) {
  const { gender, className } = props
  if (gender == 'male') {
    return <PiGenderMaleBold className={className} />
  }
  if (gender == 'female') {
    return <PiGenderFemaleBold className={className} />
  }
  if (gender == 'non-binary') {
    return <PiGenderNonbinaryBold className={className} />
  }
  if (gender == 'trans-female') {
    return <PiGenderTransgenderBold className={className} />
  }
  if (gender == 'trans-male') {
    return <PiGenderTransgenderBold className={className} />
  }
  return <BsFillPersonFill className={className} />
}
