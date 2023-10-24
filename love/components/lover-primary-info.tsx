import { Lover } from 'love/hooks/use-lover'
import { ReactNode } from 'react'
import { FaLocationDot } from 'react-icons/fa6'
import { Row } from 'web/components/layout/row'
import { Gender } from './gender-icon'
import GenderIcon from './GenderIcon'
import { capitalizeFirstLetter } from 'web/lib/util/capitalize-first-letter'
import { formatLoverValue } from 'love/pages/[username]'
import { MdHeight } from 'react-icons/md'
import { IoLocationOutline } from 'react-icons/io5'

export default function LoverPrimaryInfo(props: { lover: Lover }) {
  const { lover } = props
  return (
    <Row className="text-ink-700 gap-4 text-sm">
      <IconWithInfo
        text={lover.city}
        icon={<IoLocationOutline className="h-4 w-4" />}
      />
      <IconWithInfo
        text={capitalizeFirstLetter(lover.gender)}
        icon={
          <GenderIcon gender={lover.gender as Gender} className="h-4 w-4 " />
        }
      />
      <IconWithInfo
        text={formatLoverValue('height_in_inches', lover.height_in_inches)}
        icon={<MdHeight className="h-4 w-4 " />}
      />
    </Row>
  )
}

export function IconWithInfo(props: { text: string; icon: ReactNode }) {
  const { text, icon } = props
  return (
    <Row className="items-center gap-0.5">
      <div className="text-ink-500">{icon}</div>
      {text}
    </Row>
  )
}
