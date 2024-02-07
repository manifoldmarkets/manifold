import { Col } from 'web/components/layout/col'
import Image from 'next/image'

export const Flapper = () => {
  return (
    <Col className={'min-h-screen w-full items-center justify-center'}>
      <Image
        alt={'Flappy manifold bird'}
        className="mb-6 block -scale-x-100 self-center"
        src="/logo-flapping-with-money.gif"
        width={200}
        height={200}
      />
    </Col>
  )
}
