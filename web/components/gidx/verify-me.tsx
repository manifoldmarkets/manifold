import { PrivateUser, User } from 'common/user'
import { Col } from 'web/components/layout/col'
import Link from 'next/link'
import clsx from 'clsx'
import { Button, buttonClass, IconButton } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { GIDXDocument, idNameToCategoryType } from 'common/gidx/gidx'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { SWEEPIES_NAME, TWOMBA_ENABLED } from 'common/envs/constants'
import { getDocumentsStatus } from 'common/gidx/document'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { VerifyButton } from '../sweeps/sweep-verify-section'
import { MdBlock } from 'react-icons/md'
import { XIcon } from '@heroicons/react/solid'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import {
  ageBlocked,
  documentsFailed,
  fraudSession,
  identityBlocked,
  locationBlocked,
} from 'common/gidx/user'

const HideVerifyMeButton = ({
  hideVerifyMe,
  setHideVerifyMe,
  className,
}: {
  hideVerifyMe: boolean
  setHideVerifyMe: (value: boolean) => void
  className?: string
}) => {
  if (hideVerifyMe) return null

  return (
    <IconButton
      className={clsx('h-8', className)}
      size="xs"
      onClick={() => setHideVerifyMe(true)}
    >
      <XIcon className="text-ink-700 h-5 w-5" />
    </IconButton>
  )
}

export const VerifyMe = (props: { user: User; privateUser: PrivateUser }) => {
  const user = useUser() ?? props.user
  const privateUser = usePrivateUser() ?? props.privateUser
  const [show, setShow] = useState(
    TWOMBA_ENABLED &&
      (!user.sweepstakesVerified ||
        !user.idVerified ||
        user.kycDocumentStatus === 'fail' ||
        user.kycDocumentStatus === 'pending')
  )

  const [documents, setDocuments] = useState<GIDXDocument[] | null>(null)
  const [loading, setLoading] = useState(false)

  const [hideVerifyMe, setHideVerifyMe] = usePersistentLocalState(
    false,
    `hideVerifyMe`
  )

  const {
    requestLocationThenFetchMonitorStatus,
    loading: loadingMonitorStatus,
    monitorStatusMessage,
    monitorStatus,
  } = useMonitorStatus(false, user)
  const getStatus = async () => {
    setLoading(true)
    const { documents, message } = await api(
      'get-verification-status-gidx',
      {}
    ).finally(() => setLoading(false))
    if (documents) setDocuments(documents)
    if (message) console.error(message)
  }
  if (!show || !user || !privateUser) return null
  const showUploadDocsButton =
    getDocumentsStatus(documents ?? []).isRejected && documents

  const showUserDocStatus =
    user.kycDocumentStatus === 'pending' || documentsFailed(user, privateUser)

  if (hideVerifyMe && !showUserDocStatus) {
    return null
  }

  if (identityBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 bg-ink-200 text-ink-700 justify-between gap-2 rounded border p-2 px-4'
        }
      >
        <Row className={'w-full items-center justify-between gap-1'}>
          <span>
            <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
            Blocked from sweepstakes participation due to blocked identity.{' '}
          </span>
          <HideVerifyMeButton
            hideVerifyMe={hideVerifyMe}
            setHideVerifyMe={setHideVerifyMe}
            className="-mr-2 -mt-1  sm:mt-0 "
          />
        </Row>
      </Col>
    )
  } else if (showUserDocStatus) {
    return (
      <Col
        className={
          'border-primary-500  bg-primary-100 justify-between gap-2 rounded border p-2 px-4 dark:bg-indigo-700'
        }
      >
        <Col
          className={'w-full items-center justify-between gap-2 sm:flex-row'}
        >
          <Row className="w-full justify-between">
            <span>Document verification pending... </span>
            <HideVerifyMeButton
              hideVerifyMe={hideVerifyMe}
              setHideVerifyMe={setHideVerifyMe}
              className=" -mr-2 -mt-1 sm:hidden"
            />
          </Row>
          <Row className={'w-full justify-end gap-1'}>
            <Button
              color={'indigo-outline'}
              loading={loading}
              disabled={loading}
              onClick={getStatus}
              className="w-full sm:w-fit"
            >
              Refresh status
            </Button>
            <HideVerifyMeButton
              hideVerifyMe={hideVerifyMe}
              setHideVerifyMe={setHideVerifyMe}
              className="-mr-2 hidden sm:block"
            />
          </Row>
        </Col>

        {documents && (
          <Col className={'gap-2'}>
            <Row className={'w-full justify-between sm:w-72'}>
              <span className={'font-semibold'}>Category</span>
              <span className={'font-semibold'}>Status</span>
            </Row>
            {documents.map((doc) => (
              <Col key={doc.DocumentID}>
                <Row className={'w-full justify-between sm:w-72'}>
                  <Col>
                    {
                      Object.entries(idNameToCategoryType).find(
                        ([_, v]) => v === doc.CategoryType
                      )?.[0]
                    }
                  </Col>
                  <Col>{documentStatus[doc.DocumentStatus]}</Col>
                </Row>
                {doc.DocumentNotes.length > 0 && (
                  <span className={'text-red-500'}>
                    {doc.DocumentNotes.map((n) => n.NoteText).join('\n')}
                  </span>
                )}
              </Col>
            ))}
          </Col>
        )}
        {showUploadDocsButton && (
          <Row>
            <Link
              href={user.idVerified ? '/redeem' : 'gidx/register'}
              className={clsx(buttonClass('md', 'indigo'))}
            >
              Re-upload documents
            </Link>
          </Row>
        )}
      </Col>
    )
  } else if (ageBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 bg-ink-200 text-ink-700 gap-2 rounded border p-2 px-4'
        }
      >
        <Row className={'w-full items-center justify-between gap-1'}>
          <span>
            <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
            Blocked from sweepstakes participation due to underage.{' '}
          </span>
          <HideVerifyMeButton
            hideVerifyMe={hideVerifyMe}
            setHideVerifyMe={setHideVerifyMe}
            className="-mr-2 -mt-1  sm:mt-0 "
          />
        </Row>
      </Col>
    )
  } else if (locationBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 bg-ink-200 justify-between gap-2 rounded border p-2 px-4'
        }
      >
        <div
          className={
            'flex w-full flex-col items-center justify-between gap-2 sm:flex-row'
          }
        >
          <Row className="w-full justify-between">
            <span>
              <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
              Blocked from sweepstakes participation due to location.{' '}
            </span>
            <HideVerifyMeButton
              hideVerifyMe={hideVerifyMe}
              setHideVerifyMe={setHideVerifyMe}
              className=" -mr-2 -mt-1 sm:hidden"
            />
          </Row>
          <Button
            color={'indigo-outline'}
            loading={loadingMonitorStatus}
            disabled={loadingMonitorStatus}
            onClick={() => requestLocationThenFetchMonitorStatus()}
            className={'w-full whitespace-nowrap sm:w-fit'}
          >
            Refresh status
          </Button>
          <HideVerifyMeButton
            hideVerifyMe={hideVerifyMe}
            setHideVerifyMe={setHideVerifyMe}
            className="-mr-2 hidden sm:block"
          />
        </div>
        {monitorStatus === 'error' && (
          <Row className={'text-error'}>{monitorStatusMessage}</Row>
        )}
      </Col>
    )
    // This shouldn't be displayed going forward, but previously users were marked as
    // sweepstakes disabled, (would trigger showing this) when they had suspicious activity sessions.
  } else if (fraudSession(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 bg-ink-200 text-ink-700 justify-between gap-2 rounded border p-2 px-4'
        }
      >
        <Row className={'w-full items-center justify-between gap-1'}>
          <span>
            <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
            Blocked from sweepstakes participation due to suspicious activity.
            Turn off vpn if using.{' '}
          </span>
          <HideVerifyMeButton
            hideVerifyMe={hideVerifyMe}
            setHideVerifyMe={setHideVerifyMe}
            className="-mr-2 -mt-1  sm:mt-0 "
          />
        </Row>
      </Col>
    )
  } else if (user.sweepstakesVerified) {
    return (
      <Row
        className={
          ' bg-primary-100 border-primary-500 justify-between gap-2 rounded border p-2 px-4 '
        }
      >
        <span>
          <span className={'text-lg'}>🎉</span> Congrats, you've been verified!{' '}
        </span>
        <button
          onClick={() => setShow(false)}
          className="hover:bg-primary-200 text-primary-500 -mr-2 rounded p-1 px-2 transition-all"
        >
          <XIcon className={'h-4 w-4'} />
        </button>
      </Row>
    )
  }

  return (
    <Col
      className={
        'border-primary-500 bg-primary-100 items-center justify-between gap-2 rounded border px-4 py-2 sm:flex-row'
      }
    >
      <Row className="w-full justify-between">
        {!user.idVerified &&
          `You are not yet verified! Verify to start trading on ${SWEEPIES_NAME} markets.`}
        <HideVerifyMeButton
          hideVerifyMe={hideVerifyMe}
          setHideVerifyMe={setHideVerifyMe}
          className=" -mr-2 -mt-1 sm:hidden"
        />
      </Row>
      <VerifyButton className={'w-full shrink-0 whitespace-nowrap sm:w-fit'} />
      <HideVerifyMeButton
        hideVerifyMe={hideVerifyMe}
        setHideVerifyMe={setHideVerifyMe}
        className="-mr-2 hidden sm:block"
      />
    </Col>
  )
}

const documentStatus: { [k: number]: string } = {
  1: 'Not reviewed',
  2: 'Under review',
  3: 'Complete',
}
