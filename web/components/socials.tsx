import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import Link from 'next/link'
import clsx from 'clsx'
import {
  TbBrandAndroid,
  TbBrandApple,
  TbBrandDiscord,
  TbBrandTwitter,
} from 'react-icons/tb'
import { APPLE_APP_URL, GOOGLE_PLAY_APP_URL } from 'common/envs/constants'
import { MobileAppsQRCodeDialog } from './buttons/mobile-apps-qr-code-button'
import { useState } from 'react'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { isIOS } from 'web/lib/util/device'
import { getNativePlatform } from 'web/lib/native/is-native'

export function Socials(props: { className?: string; hideTitle?: boolean }) {
  const { isNative } = getNativePlatform()
  const isMobile = useIsMobile()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const appCallback = isMobile
    ? { href: isIOS() ? APPLE_APP_URL : GOOGLE_PLAY_APP_URL }
    : ({
        href: '#',
        onClick: (e: any) => {
          e.preventDefault()
          setIsModalOpen(true)
        },
      } as { href: string })

  return (
    <div className={props.className}>
      {!props.hideTitle && (
        <h2 className="text-ink-600 mb-4 text-xl">Connect With Us</h2>
      )}

      <MobileAppsQRCodeDialog
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SocialLink
          Icon={TbBrandDiscord}
          href="https://discord.com/invite/eHQBNBqXuh"
          target="_blank"
        >
          Discord
        </SocialLink>
        <SocialLink
          Icon={NewspaperIcon}
          href="https://news.manifold.markets"
          target="_blank"
        >
          Newsletter
        </SocialLink>
        <SocialLink
          Icon={TbBrandTwitter}
          href="https://twitter.com/ManifoldMarkets"
          target="_blank"
        >
          Twitter
        </SocialLink>
        <SocialLink
          Icon={MailIcon}
          href="mailto:info@manifold.markets"
          target="_blank"
        >
          Email
        </SocialLink>
        {!isNative && (
          <SocialLink
            Icon={!isMobile || isIOS() ? TbBrandApple : TbBrandAndroid}
            {...appCallback}
          >
            Mobile App
          </SocialLink>
        )}
      </div>
    </div>
  )
}

const SocialLink = (props: {
  href: string
  onClick?: () => void
  Icon: any
  children: React.ReactNode
  target?: string
}) => {
  const { href, onClick, Icon, children, target } = props
  return (
    <Link
      href={href}
      onClick={onClick}
      target={target}
      className={clsx(
        'bg-canvas-0 border-ink-200 text-ink-700 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-medium',
        'hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 transition-all'
      )}
    >
      <Icon className="h-5 w-5" />
      {children}
    </Link>
  )
}
