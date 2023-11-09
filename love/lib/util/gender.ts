import { Lover } from 'common/love/lover'

const isPreferredGender = (
  preferredGenders: string[] | undefined,
  gender: string | undefined
) => {
  if (preferredGenders === undefined || gender === undefined) return true

  return preferredGenders.includes(gender) || gender === 'non-binary'
}

export const areGenderCompatible = (lover1: Lover, lover2: Lover) => {
  return (
    isPreferredGender(lover1.pref_gender, lover2.gender) &&
    isPreferredGender(lover2.pref_gender, lover1.gender)
  )
}
