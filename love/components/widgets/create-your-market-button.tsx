import clsx from 'clsx'
import Link from 'next/link'

import { Button } from 'web/components/buttons/button'

export const CreateYourMarketButton = ({
  className,
}: {
  className?: string
}) => {
  return (
    <Link href="/create-your-dating-market">
      <Button
        className={clsx(className, 'font-semibold')}
        color="gradient-pink"
      >
        Create your dating prediction market
      </Button>
    </Link>
  )
}
