import { useEffect, useState } from 'react'
import clsx from 'clsx'
import Link from 'next/link'
import { Popover } from '@headlessui/react'

import { useUser } from '../hooks/use-user'

const navigation = [
  {
    name: 'About',
    href: 'https://mantic.notion.site/About-Mantic-Markets-7c44bc161356474cad54cba2d2973fe2',
  },
]

function SignInLink(props: { darkBackground?: boolean }) {
  const { darkBackground } = props

  const user = useUser()

  const themeClasses = darkBackground
    ? 'text-white hover:text-gray-300'
    : 'hover:text-gray-500'

  return (
    <>
      {user ? (
        <>
          <Link href="/create">
            <a className={clsx('text-base font-medium', themeClasses)}>
              Create a market
            </a>
          </Link>

          <Link href="/account">
            <a className={clsx('text-base font-medium', themeClasses)}>
              {user.name}
            </a>
          </Link>
        </>
      ) : (
        <></>
      )}
    </>
  )
}

export function Header(props: { darkBackground?: boolean }) {
  const { darkBackground } = props

  return (
    <Popover as="header" className="relative">
      <div className="pt-6">
        <nav
          className="relative max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 bg-dark-50"
          aria-label="Global"
        >
          <div className="flex items-center flex-1">
            <div className="flex items-center justify-between w-full md:w-auto">
              <Link href="/">
                <a className="flex flex-row items-center align-items-center h-6 sm:h-10">
                  <div className="inline-block mr-3">
                    <img
                      className="h-6 sm:h-10 w-6 sm:w-10"
                      src="/logo-icon.svg"
                    />
                  </div>
                  <span
                    className={clsx(
                      'font-major-mono lowercase sm:text-2xl my-auto',
                      darkBackground && 'text-white'
                    )}
                  >
                    Mantic Markets
                  </span>
                </a>
              </Link>
            </div>

            <div className="space-x-8 md:flex md:ml-16 mr-8">
              {navigation.map((item) => (
                <Link key={item.name} href={item.href}>
                  <a
                    target="_blank"
                    className={clsx(
                      'text-base font-medium',
                      darkBackground
                        ? 'text-white hover:text-gray-300'
                        : 'hover:text-gray-500'
                    )}
                  >
                    {item.name}
                  </a>
                </Link>
              ))}

              <SignInLink darkBackground={darkBackground} />
            </div>
          </div>
        </nav>
      </div>
    </Popover>
  )
}
