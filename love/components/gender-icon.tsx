import clsx from 'clsx'
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
  hasColor?: boolean
}) {
  const { gender, className, hasColor } = props
  if (gender == 'male') {
    return (
      <PiGenderMaleBold
        className={clsx(
          className,
          hasColor ? 'text-blue-500 dark:text-blue-300' : ''
        )}
      />
    )
  }
  if (gender == 'female') {
    return (
      <PiGenderFemaleBold
        className={clsx(
          className,
          hasColor ? 'text-pink-500 dark:text-pink-300' : ''
        )}
      />
    )
  }
  if (gender == 'non-binary') {
    return (
      <PiGenderNonbinaryBold
        className={clsx(
          className,
          hasColor ? 'text-purple-500 dark:text-purple-300' : ''
        )}
      />
    )
  }
  if (gender == 'trans-female') {
    return (
      <PiGenderTransgenderBold
        className={clsx(
          className,
          hasColor ? 'text-pink-500 dark:text-pink-300' : ''
        )}
      />
    )
  }
  if (gender == 'trans-male') {
    return (
      <PiGenderTransgenderBold
        className={clsx(
          className,
          hasColor ? 'text-blue-500 dark:text-blue-300' : ''
        )}
      />
    )
  }
  return (
    <BsFillPersonFill
      className={clsx(
        className,
        hasColor ? 'text-blue-500 dark:text-blue-300' : ''
      )}
    />
  )
}
