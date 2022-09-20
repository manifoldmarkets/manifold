import { ChatAlt2Icon, ClipboardIcon, HomeIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ManifoldLogo } from './manifold-logo'
import { ProfileSummary } from './profile-menu'
import React from 'react'
import TrophyIcon from 'web/lib/icons/trophy-icon'
import { SignInButton } from '../sign-in-button'
import NotificationsIcon from '../notifications-icon'
import { SidebarItem } from './sidebar-item'
import { buildArray } from 'common/util/array'
import { User } from 'common/user'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'

const groupNavigation = [
  { name: 'Markets', key: 'markets', icon: HomeIcon },
  { name: 'About', key: 'about', icon: ClipboardIcon },
  { name: 'Leaderboard', key: 'leaderboards', icon: TrophyIcon },
  { name: 'Posts', key: 'posts', icon: ChatAlt2Icon },
]

const generalNavigation = (user?: User | null) =>
  buildArray(
    user && {
      name: 'Notifications',
      href: `/notifications`,
      key: 'notifications',
      icon: NotificationsIcon,
    }
  )

export function GroupSidebar(props: {
  groupName: string
  className?: string
  onClick: (key: string) => void
  joinOrAddQuestionsButton: React.ReactNode
  currentKey: string
}) {
  const { className, groupName, currentKey } = props

  const user = useUser()

  return (
    <nav
      aria-label="Group Sidebar"
      className={clsx('flex max-h-[100vh] flex-col', className)}
    >
      <ManifoldLogo className="pt-6" twoLine />
      <Row className="pl-2 text-xl text-indigo-700 sm:mt-3">{groupName}</Row>

      <div className=" min-h-0 shrink flex-col items-stretch gap-1  pt-6 lg:flex ">
        {user ? (
          <ProfileSummary user={user} />
        ) : (
          <SignInButton className="mb-4" />
        )}
      </div>

      {/* Desktop navigation */}
      {groupNavigation.map((item) => (
        <SidebarItem
          key={item.key}
          item={item}
          currentPage={currentKey}
          onClick={props.onClick}
        />
      ))}
      {generalNavigation(user).map((item) => (
        <SidebarItem
          key={item.key}
          item={item}
          currentPage={currentKey}
          onClick={props.onClick}
        />
      ))}

      <Spacer h={2} />

      {props.joinOrAddQuestionsButton}
    </nav>
  )
}
