import { LoverRow } from 'common/love/lover'

const satisfiesAgeRange = (lover: LoverRow, age: number) => {
  return age >= lover.pref_age_min && age <= lover.pref_age_max
}

export const areAgeCompatible = (lover1: LoverRow, lover2: LoverRow) => {
  return (
    satisfiesAgeRange(lover1, lover2.age) &&
    satisfiesAgeRange(lover2, lover1.age)
  )
}

export const areLocationCompatible = (lover1: LoverRow, lover2: LoverRow) => {
  if (
    !lover1.city_latitude ||
    !lover2.city_latitude ||
    !lover1.city_longitude ||
    !lover2.city_longitude
  )
    return lover1.city.trim().toLowerCase() === lover2.city.trim().toLowerCase()

  const latitudeDiff = Math.abs(lover1.city_latitude - lover2.city_latitude)
  const longigudeDiff = Math.abs(lover1.city_longitude - lover2.city_longitude)

  const root = (latitudeDiff ** 2 + longigudeDiff ** 2) ** 0.5
  return root < 2.5
}
