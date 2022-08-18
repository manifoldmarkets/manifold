import clsx from 'clsx'
import React from 'react'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/title'
import { useUser } from 'web/hooks/use-user'
import { fromNow } from 'web/lib/util/time'

import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import {
  getChallengeUrl,
  useAcceptedChallenges,
  useUserChallenges,
} from 'web/lib/firebase/challenges'
import { Challenge, CHALLENGES_ENABLED } from 'common/challenge'
import { Tabs } from 'web/components/layout/tabs'
import { SiteLink } from 'web/components/site-link'
import { UserLink } from 'web/components/user-page'
import { Avatar } from 'web/components/avatar'
import Router from 'next/router'
import { contractPathWithoutContract } from 'web/lib/firebase/contracts'
import { Button } from 'web/components/button'
import { ClipboardCopyIcon, QrcodeIcon } from '@heroicons/react/outline'
import { copyToClipboard } from 'web/lib/util/copy'
import toast from 'react-hot-toast'
import { Modal } from 'web/components/layout/modal'
import { QRCode } from 'web/components/qr-code'
import { CreateChallengeModal } from 'web/components/challenges/create-challenge-modal'

dayjs.extend(customParseFormat)
const columnClass = 'sm:px-5 px-2 py-3.5 max-w-[100px] truncate'
const amountClass = columnClass + ' max-w-[75px] font-bold'

export default function ChallengesListPage() {
  const user = useUser()
  const challenges = useAcceptedChallenges()
  const [open, setOpen] = React.useState(false)
  const userChallenges = useUserChallenges(user?.id)
    .concat(
      user ? challenges.filter((c) => c.acceptances[0].userId === user.id) : []
    )
    .sort((a, b) => b.createdTime - a.createdTime)

  const userTab = user
    ? [
        {
          content: <YourChallengesTable links={userChallenges} />,
          title: 'Your Challenges',
        },
      ]
    : []

  const publicTab = [
    {
      content: <PublicChallengesTable links={challenges} />,
      title: 'Public Challenges',
    },
  ]

  return (
    <Page>
      <SEO
        title="Challenges"
        description="Challenge your friends to a bet!"
        url="/send"
      />

      <Col className="w-full px-8">
        <Row className="items-center justify-between">
          <Title text="Challenges" />
          {CHALLENGES_ENABLED && (
            <Button size="lg" color="gradient" onClick={() => setOpen(true)}>
              Create Challenge
              <CreateChallengeModal
                isOpen={open}
                setOpen={setOpen}
                user={user}
              />
            </Button>
          )}
        </Row>
        <p>
          <SiteLink className={'font-bold'} href={'/home'}>
            Find
          </SiteLink>{' '}
          or{' '}
          <SiteLink className={'font-bold'} href={'/create'}>
            create
          </SiteLink>{' '}
          a market to challenge someone to a bet.
        </p>

        <Tabs tabs={[...userTab, ...publicTab]} />
      </Col>
    </Page>
  )
}

function YourChallengesTable(props: { links: Challenge[] }) {
  const { links } = props
  return links.length == 0 ? (
    <p>There aren't currently any challenges.</p>
  ) : (
    <div className="overflow-scroll">
      <table className="w-full divide-y divide-gray-300 rounded-lg border border-gray-200">
        <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
          <tr>
            <th className={amountClass}>Amount</th>
            <th
              className={clsx(
                columnClass,
                'text-center sm:pl-10 sm:text-start'
              )}
            >
              Link
            </th>
            <th className={columnClass}>Accepted By</th>
          </tr>
        </thead>
        <tbody className={'divide-y divide-gray-200 bg-white'}>
          {links.map((link) => (
            <YourLinkSummaryRow challenge={link} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function YourLinkSummaryRow(props: { challenge: Challenge }) {
  const { challenge } = props
  const { acceptances } = challenge

  const [open, setOpen] = React.useState(false)
  const className = clsx(
    'whitespace-nowrap text-sm hover:cursor-pointer text-gray-500 hover:bg-sky-50 bg-white'
  )
  return (
    <>
      <Modal open={open} setOpen={setOpen} size={'sm'}>
        <Col
          className={
            'items-center justify-center gap-4 rounded-md bg-white p-8 py-8 '
          }
        >
          <span className={'mb-4  text-center text-xl text-indigo-700'}>
            Have your friend scan this to accept the challenge!
          </span>
          <QRCode url={getChallengeUrl(challenge)} />
        </Col>
      </Modal>
      <tr id={challenge.slug} key={challenge.slug} className={className}>
        <td className={amountClass}>
          <SiteLink href={getChallengeUrl(challenge)}>
            {formatMoney(challenge.creatorAmount)}
          </SiteLink>
        </td>
        <td
          className={clsx(
            columnClass,
            'text-center sm:max-w-[200px] sm:text-start'
          )}
        >
          <Row className="items-center gap-2">
            <Button
              color="gray-white"
              size="xs"
              onClick={() => {
                copyToClipboard(getChallengeUrl(challenge))
                toast('Link copied to clipboard!')
              }}
            >
              <ClipboardCopyIcon className={'h-5 w-5 sm:h-4 sm:w-4'} />
            </Button>
            <Button
              color="gray-white"
              size="xs"
              onClick={() => {
                setOpen(true)
              }}
            >
              <QrcodeIcon className="h-5 w-5 sm:h-4 sm:w-4" />
            </Button>
            <SiteLink
              href={getChallengeUrl(challenge)}
              className={'mx-1 mb-1 hidden sm:inline-block'}
            >
              {`...${challenge.contractSlug}/${challenge.slug}`}
            </SiteLink>
          </Row>
        </td>

        <td className={columnClass}>
          <Row className={'items-center justify-start gap-1'}>
            {acceptances.length > 0 ? (
              <>
                <Avatar
                  username={acceptances[0].userUsername}
                  avatarUrl={acceptances[0].userAvatarUrl}
                  size={'sm'}
                />
                <UserLink
                  name={acceptances[0].userName}
                  username={acceptances[0].userUsername}
                />
              </>
            ) : (
              <span>
                No one -
                {challenge.expiresTime &&
                  ` (expires ${fromNow(challenge.expiresTime)})`}
              </span>
            )}
          </Row>
        </td>
      </tr>
    </>
  )
}

function PublicChallengesTable(props: { links: Challenge[] }) {
  const { links } = props
  return links.length == 0 ? (
    <p>There aren't currently any challenges.</p>
  ) : (
    <div className="overflow-scroll">
      <table className="w-full divide-y divide-gray-300 rounded-lg border border-gray-200">
        <thead className="bg-gray-50 text-left text-sm font-semibold text-gray-900">
          <tr>
            <th className={amountClass}>Amount</th>
            <th className={columnClass}>Creator</th>
            <th className={columnClass}>Acceptor</th>
            <th className={columnClass}>Market</th>
          </tr>
        </thead>
        <tbody className={'divide-y divide-gray-200 bg-white'}>
          {links.map((link) => (
            <PublicLinkSummaryRow challenge={link} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PublicLinkSummaryRow(props: { challenge: Challenge }) {
  const { challenge } = props
  const {
    acceptances,
    creatorUsername,
    creatorName,
    creatorAvatarUrl,
    contractCreatorUsername,
    contractQuestion,
    contractSlug,
  } = challenge

  const className = clsx(
    'whitespace-nowrap text-sm hover:cursor-pointer text-gray-500 hover:bg-sky-50 bg-white'
  )
  return (
    <tr
      id={challenge.slug + '-public'}
      key={challenge.slug + '-public'}
      className={className}
      onClick={() => Router.push(getChallengeUrl(challenge))}
    >
      <td className={amountClass}>
        <SiteLink href={getChallengeUrl(challenge)}>
          {formatMoney(challenge.creatorAmount)}
        </SiteLink>
      </td>

      <td className={clsx(columnClass)}>
        <Row className={'items-center justify-start gap-1'}>
          <Avatar
            username={creatorUsername}
            avatarUrl={creatorAvatarUrl}
            size={'sm'}
            noLink={true}
          />
          <UserLink name={creatorName} username={creatorUsername} />
        </Row>
      </td>

      <td className={clsx(columnClass)}>
        <Row className={'items-center justify-start gap-1'}>
          {acceptances.length > 0 ? (
            <>
              <Avatar
                username={acceptances[0].userUsername}
                avatarUrl={acceptances[0].userAvatarUrl}
                size={'sm'}
                noLink={true}
              />
              <UserLink
                name={acceptances[0].userName}
                username={acceptances[0].userUsername}
              />
            </>
          ) : (
            <span>
              No one -
              {challenge.expiresTime &&
                ` (expires ${fromNow(challenge.expiresTime)})`}
            </span>
          )}
        </Row>
      </td>
      <td className={clsx(columnClass, 'font-bold')}>
        <SiteLink
          href={contractPathWithoutContract(
            contractCreatorUsername,
            contractSlug
          )}
        >
          {contractQuestion}
        </SiteLink>
      </td>
    </tr>
  )
}
