import { ReactNode } from 'react'
import { capitalize } from 'lodash'
import { IoLocationOutline } from 'react-icons/io5'
import { MdHeight } from 'react-icons/md'

import { Row } from 'web/components/layout/row'
import GenderIcon, { Gender, convertGender } from '../gender-icon'
import { formatLoverValue } from '../lover-about'
import { Lover } from 'common/love/lover'

export default function LoverPrimaryInfo(props: { lover: Lover }) {
  const { lover } = props
  const stateOrCountry =
    lover.country === 'United States of America'
      ? lover.region_code
      : lover.country
  return (
    <Row className="text-ink-700 gap-4 text-sm">
      <IconWithInfo
        text={`${lover.city}, ${stateOrCountry}`}
        icon={<IoLocationOutline className="h-4 w-4" />}
      />
      <IconWithInfo
        text={capitalize(convertGender(lover.gender as Gender))}
        icon={
          <GenderIcon gender={lover.gender as Gender} className="h-4 w-4 " />
        }
      />
      {lover.height_in_inches != null && (
        <IconWithInfo
          text={formatLoverValue('height_in_inches', lover.height_in_inches)}
          icon={<MdHeight className="h-4 w-4 " />}
        />
      )}
    </Row>
  )
}

function IconWithInfo(props: { text: string; icon: ReactNode }) {
  const { text, icon } = props
  return (
    <Row className="items-center gap-0.5">
      <div className="text-ink-500">{icon}</div>
      {text}
    </Row>
  )
}
