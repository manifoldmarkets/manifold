import clsx from 'clsx'

import { WhatIsAPM, WhatIsMana, WhyManifold } from 'web/pages/about'
import { Col } from './layout/col'

export const ExplainerPanel = (props: { className?: string }) => {
  const { className } = props
  return (
    <Col className={className}>
      <h2 className={clsx('text-ink-600 mb-2 text-xl')}>What is this?</h2>
      <WhatIsAPM />
      <WhatIsMana />
      <WhyManifold />
    </Col>
  )
}
