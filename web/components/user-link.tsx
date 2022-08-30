import { linkClass, SiteLink } from 'web/components/site-link'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { useState } from 'react'
import { Avatar } from 'web/components/avatar'
import { formatMoney } from 'common/util/format'

function shortenName(name: string) {
  const firstName = name.split(' ')[0]
  const maxLength = 10
  const shortName =
    firstName.length >= 3
      ? firstName.length < maxLength
        ? firstName
        : firstName.substring(0, maxLength - 3) + '...'
      : name.length > maxLength
      ? name.substring(0, maxLength) + '...'
      : name
  return shortName
}

export function UserLink(props: {
  name: string
  username: string
  className?: string
  short?: boolean
}) {
  const { name, username, className, short } = props
  const shortName = short ? shortenName(name) : name
  return (
    <SiteLink
      href={`/${username}`}
      className={clsx('z-10 truncate', className)}
    >
      {shortName}
    </SiteLink>
  )
}

export type MultiUserLinkInfo = {
  name: string
  username: string
  avatarUrl: string | undefined
  amountTipped: number
}

export function MultiUserTipLink(props: {
  userInfos: MultiUserLinkInfo[]
  className?: string
}) {
  const { userInfos, className } = props
  const [open, setOpen] = useState(false)
  const maxShowCount = 2
  return (
    <>
      <Row
        className={clsx('mr-1 inline-flex gap-1', linkClass, className)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {userInfos.map((userInfo, index) =>
          index < maxShowCount ? (
            <span key={userInfo.username + 'shortened'} className={linkClass}>
              {shortenName(userInfo.name) +
                (index < maxShowCount - 1 ? ', ' : '')}
            </span>
          ) : (
            <span className={linkClass}>
              & {userInfos.length - maxShowCount} more
            </span>
          )
        )}
      </Row>
      <Modal open={open} setOpen={setOpen} size={'sm'}>
        <Col className="items-start gap-4 rounded-md bg-white p-6">
          <span className={'text-xl'}>Who tipped you</span>
          {userInfos.map((userInfo) => (
            <Row
              key={userInfo.username + 'list'}
              className="w-full items-center gap-2"
            >
              <span className="text-primary min-w-[3.5rem]">
                +{formatMoney(userInfo.amountTipped)}
              </span>
              <Avatar
                username={userInfo.username}
                avatarUrl={userInfo.avatarUrl}
              />
              <UserLink name={userInfo.name} username={userInfo.username} />
            </Row>
          ))}
        </Col>
      </Modal>
    </>
  )
}
