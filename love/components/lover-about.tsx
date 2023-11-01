import clsx from 'clsx'
import { Lover } from 'love/hooks/use-lover'
import {
  RelationshipType,
  convertRelationshipType,
} from 'love/lib/util/convert-relationship-type'
import stringOrStringArrayToText from 'love/lib/util/string-or-string-array-to-text'
import { ReactNode } from 'react'
import { BiDna, BiSolidDrink } from 'react-icons/bi'
import { BsPersonHeart } from 'react-icons/bs'
import { FaChild } from 'react-icons/fa6'
import {
  LuBriefcase,
  LuCigarette,
  LuCigaretteOff,
  LuGraduationCap,
} from 'react-icons/lu'
import { MdNoDrinks, MdOutlineChildFriendly } from 'react-icons/md'
import {
  PiHandsPrayingBold,
  PiMagnifyingGlassBold,
  PiPlantBold,
} from 'react-icons/pi'
import { RiScales3Line } from 'react-icons/ri'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { fromNow } from 'web/lib/util/time'
import { Gender, convertGenderPlural } from './gender-icon'
import { HiOutlineGlobe } from 'react-icons/hi'
import { UserHandles } from 'web/components/user/user-handles'

export function AboutRow(props: {
  icon: ReactNode
  text?: string | null | string[]
  preText?: string
}) {
  const { icon, text, preText } = props
  if (!text || text.length < 1) {
    return <></>
  }
  return (
    <Row className="items-center gap-2">
      <div className="text-ink-600 w-5">{icon}</div>
      <div>
        {stringOrStringArrayToText({
          text: text,
          preText: preText,
          asSentence: false,
          capitalizeFirstLetterOption: true,
        })}
      </div>
    </Row>
  )
}

export default function LoverAbout(props: { lover: Lover }) {
  const { lover } = props
  return (
    <Col
      className={clsx('bg-canvas-0 relative gap-3 overflow-hidden rounded p-4')}
    >
      <Seeking lover={lover} />
      <RelationshipType lover={lover} />
      <HasKids lover={lover} />
      <AboutRow
        icon={<RiScales3Line className="h-5 w-5" />}
        text={lover.political_beliefs}
      />
      <Education lover={lover} />
      <Occupation lover={lover} />
      <AboutRow
        icon={<PiHandsPrayingBold className="h-5 w-5" />}
        text={lover.religious_beliefs}
      />
      <AboutRow
        icon={<HiOutlineGlobe className="h-5 w-5" />}
        text={lover.ethnicity}
      />
      <Smoker lover={lover} />
      <Drinks lover={lover} />
      <AboutRow
        icon={<PiPlantBold className="h-5 w-5" />}
        text={lover.is_vegetarian_or_vegan ? 'Vegetarian/Vegan' : null}
      />
      <WantsKids lover={lover} />
      <UserHandles website={lover.website} twitterHandle={lover.twitter} />
    </Col>
  )
}

function Seeking(props: { lover: Lover }) {
  const { lover } = props
  const prefGender = lover.pref_gender
  const min = lover.pref_age_min
  const max = lover.pref_age_max
  const seekingGenderText = stringOrStringArrayToText({
    text: prefGender.map((gender) => convertGenderPlural(gender as Gender)),
    preText: 'Interested in',
    asSentence: true,
    capitalizeFirstLetterOption: false,
  })
  if (prefGender.length == 5) {
    seekingGenderText = "Interested in anyone"
  }
  const ageRangeText = `between ${min} - ${max} years old`
  if (min == 18 && max == 99) {
    ageRangeText = "of any age"
  } else if (min == 18) {
    ageRangeText = `younger than ${max}`
  } else if (max == 99) {
    ageRangeText = `older than ${min}`
  }
  if (!prefGender || prefGender.length < 1) {
    return <></>
  }
  return (
    <AboutRow
      icon={<PiMagnifyingGlassBold className="h-5 w-5" />}
      text={`${seekingGenderText} ${ageRangeText}`}
    />
  )
}

function RelationshipType(props: { lover: Lover }) {
  const { lover } = props
  const relationshipTypes = lover.pref_relation_styles
  const seekingGenderText = stringOrStringArrayToText({
    text: relationshipTypes.map((rel) =>
      convertRelationshipType(rel as RelationshipType)
    ),
    preText: 'Seeking',
    postText:
      relationshipTypes.length == 1 && relationshipTypes[0] == 'mono'
        ? 'relationship'
        : 'relationships',
    asSentence: true,
    capitalizeFirstLetterOption: false,
  })
  return (
    <AboutRow
      icon={<BsPersonHeart className="h-5 w-5" />}
      text={seekingGenderText}
    />
  )
}

function Education(props: { lover: Lover }) {
  const { lover } = props
  const educationLevel = lover.education_level
  const university = lover.university

  const NoUniDegree = !educationLevel || educationLevel == 'high-school'

  if (!university) {
    return <></>
  }
  const universityText = `${
    NoUniDegree ? '' : capitalizeAndRemoveUnderscores(educationLevel) + ' at '
  }${capitalizeAndRemoveUnderscores(university)}`
  return (
    <AboutRow
      icon={<LuGraduationCap className="h-5 w-5" />}
      text={universityText}
    />
  )
}

function Occupation(props: { lover: Lover }) {
  const { lover } = props
  const occupation_title = lover.occupation_title
  const company = lover.company

  if (!company && !occupation_title) {
    return <></>
  }
  const occupationText = `${
    occupation_title ? capitalizeAndRemoveUnderscores(occupation_title) : ''
  }${occupation_title && company ? ' at ' : ''}${
    company ? capitalizeAndRemoveUnderscores(company) : ''
  }`
  return (
    <AboutRow
      icon={<LuBriefcase className="h-5 w-5" />}
      text={occupationText}
    />
  )
}

function Smoker(props: { lover: Lover }) {
  const { lover } = props
  const isSmoker = lover.is_smoker
  if (isSmoker) {
    return (
      <AboutRow icon={<LuCigarette className="h-5 w-5" />} text={'Smokes'} />
    )
  }
  return (
    <AboutRow
      icon={<LuCigaretteOff className="h-5 w-5" />}
      text={`Doesn't smoke`}
    />
  )
}

function Drinks(props: { lover: Lover }) {
  const { lover } = props
  const drinksPerMonth = lover.drinks_per_month
  const noDrinking = !drinksPerMonth || drinksPerMonth == 0
  if (noDrinking) {
    return (
      <AboutRow
        icon={<MdNoDrinks className="h-5 w-5" />}
        text={`Doesn't drink`}
      />
    )
  }
  return (
    <AboutRow
      icon={<BiSolidDrink className="h-5 w-5" />}
      text={`${drinksPerMonth} ${drinksPerMonth == 1 ? 'drink' : 'drinks'} per month`}
    />
  )
}

function WantsKids(props: { lover: Lover }) {
  const { lover } = props
  const wantsKidsStrength = lover.wants_kids_strength
  const wantsKidsText =
    wantsKidsStrength == 0
      ? 'Does not want children'
      : wantsKidsStrength == 1
      ? 'Prefers not to have children'
      : wantsKidsStrength == 2
      ? 'Neutral or open to having children'
      : wantsKidsStrength == 3
      ? 'Leaning towards wanting children'
      : 'Wants children'

  return (
    <AboutRow
      icon={<MdOutlineChildFriendly className="h-5 w-5" />}
      text={wantsKidsText}
    />
  )
}

function HasKids(props: { lover: Lover }) {
  const { lover } = props
  const hasKidsText =
    lover.has_kids && lover.has_kids > 0
      ? `Has ${lover.has_kids} ${lover.has_kids > 1 ? 'kids' : 'kid'}`
      : null
  return <AboutRow icon={<FaChild className="h-5 w-5" />} text={hasKidsText} />
}
export const formatLoverValue = (key: string, value: any) => {
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  switch (key) {
    case 'birthdate':
      return fromNow(new Date(value).valueOf()).replace(' ago', '')
    case 'created_time':
    case 'last_online_time':
      return fromNow(new Date(value).valueOf())
    case 'is_smoker':
    case 'is_vegetarian_or_vegan':
    case 'has_pets':
      return value ? 'Yes' : 'No'
    case 'height_in_inches':
      return `${Math.floor(value / 12)}' ${value % 12}"`
    case 'pref_age_max':
    case 'pref_age_min':
      return null // handle this in a special case
    case 'wants_kids_strength':
      return renderAgreementScale(value)
    default:
      return value
  }
}

const renderAgreementScale = (value: number) => {
  if (value == 1) return 'Strongly disagree'
  if (value == 2) return 'Disagree'
  if (value == 3) return 'Neutral'
  if (value == 4) return 'Agree'
  if (value == 5) return 'Strongly agree'
  return ''
}

const capitalizeAndRemoveUnderscores = (str: string) => {
  const withSpaces = str.replace(/_/g, ' ')
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
}
