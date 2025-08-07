import { Row } from 'web/components/layout/row'
import { PiTelevisionSimple, PiTelevisionSimpleBold } from 'react-icons/pi'

export function LiveTVIcon(props: { className?: string }) {
  const { className } = props

  return (
    <Row className="relative justify-center">
      <div className="absolute -mt-1 ml-1 min-h-[15px] min-w-[15px] rounded-full bg-indigo-500 p-[1px] lg:left-0.5 lg:-mt-1 lg:ml-2"></div>
      <PiTelevisionSimpleBold className={className} />
    </Row>
  )
}

export { PiTelevisionSimple as TVIcon }
