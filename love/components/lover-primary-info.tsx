import { Lover } from 'love/hooks/use-lover'
import { ReactNode } from 'react'
import { IoLocationOutline } from 'react-icons/io5'
import { MdHeight } from 'react-icons/md'
import { Row } from 'web/components/layout/row'
import GenderIcon, { Gender, convertGender } from './gender-icon'
import { formatLoverValue } from './lover-about'
import { capitalize } from 'lodash'

export default function LoverPrimaryInfo(props: { lover: Lover }) {
  const { lover } = props
  return (
    <Row className="text-ink-700 gap-4 text-sm">
      <IconWithInfo
        text={lover.city}
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
