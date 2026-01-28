import { useRouter } from 'next/router'
import { useUser } from 'web/hooks/use-user'
import { Button, SizeType } from '../buttons/button'
import { ManaCoin } from 'web/public/custom-components/manaCoin'

export function AddFundsButton(props: {
  userId?: string
  className?: string
  size?: SizeType
}) {
  const { userId, className, size } = props
  const user = useUser()
  const router = useRouter()

  if (!userId || user?.id !== userId) return null

  return (
    <Button
      onClick={() =>
        router.asPath.includes('/checkout')
          ? router.reload()
          : router.push('/checkout')
      }
      size={size ?? 'md'}
      color="gradient-pink"
      className={className}
    >
      Get mana <ManaCoin className="ml-1" />
    </Button>
  )
}
