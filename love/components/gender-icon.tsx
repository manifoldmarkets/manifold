import { BsFillPersonFill } from 'react-icons/bs'
import {
  PiGenderFemaleBold,
  PiGenderMaleBold,
  PiGenderNonbinaryBold,
  PiGenderTransgenderBold,
} from 'react-icons/pi'

export type Gender =
  | 'male'
  | 'female'
  | 'non-binary'
  | 'trans-male'
  | 'trans-female'

export function convertGender(gender: Gender) {
  if (gender == 'male') {
    return 'man'
  }
  if (gender == 'female') {
    return 'woman'
  }
  if (gender == 'trans-female') {
    return 'trans woman'
  }
  if (gender == 'trans-male') {
    return 'trans man'
  }
  return gender
}

export function convertGenderPlural(gender: Gender) {
  if (gender == 'male') {
    return 'men'
  }
  if (gender == 'female') {
    return 'women'
  }
  if (gender == 'trans-female') {
    return 'trans women'
  }
  if (gender == 'trans-male') {
    return 'trans men'
  }
  return gender
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
