import * as dayjs from 'dayjs'

export const initialRequiredState = {
  birthdate: dayjs().subtract(18, 'year').format('YYYY-MM-DD'),
  city: '',
  gender: '',
  pref_gender: [],
  pref_age_min: 18,
  pref_age_max: 100,
  pref_relation_styles: [],
  wants_kids_strength: 2,
  looking_for_matches: true,
  messaging_status: 'open',
  visibility: 'public',
}
