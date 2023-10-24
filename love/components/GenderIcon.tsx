import {
  PiGenderFemaleBold,
  PiGenderMaleBold,
  PiGenderNonbinaryBold,
  PiGenderTransgenderBold,
} from 'react-icons/pi'
import { Gender } from './gender-icon'
import { BsFillPersonFill } from 'react-icons/bs'

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
