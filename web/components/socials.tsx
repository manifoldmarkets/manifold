import { MailIcon, NewspaperIcon } from '@heroicons/react/outline'
import Link from 'next/link'
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

export function Socials(props: { className?: string }) {
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
      <h2 className={'text-ink-600 text-xl'}>Socials</h2>

      <MobileAppsQRCodeDialog
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
      className="bg-canvas-0 text-ink-800 hover:text-primary-800 hover:bg-primary-100 flex items-center justify-center gap-1.5 whitespace-nowrap rounded p-2 font-semibold transition-colors"
    >
      <Icon className="h-6 w-6" />
      {children}
    </Link>
  )
}
