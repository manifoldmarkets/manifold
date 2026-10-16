import { ReactNode } from 'react'
import { useNativeInfo } from 'web/components/native-message-provider'
import { getLinkTarget } from 'web/components/widgets/linkify'

export function SocialLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  const { isNative } = useNativeInfo()
  return (
    <a
      href={href}
      // The app drops new-window requests for Manifold URLs.
      target={getLinkTarget(href, true, isNative)}
      rel="noopener noreferrer ugc"
      className={className}
    >
      {children}
    </a>
  )
}
