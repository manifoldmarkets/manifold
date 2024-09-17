import {
  ageBlocked,
  getVerificationStatus,
  identityBlocked,
  locationBlocked,
  User,
} from 'common/user'
import { Col } from 'web/components/layout/col'
import Link from 'next/link'
import clsx from 'clsx'
import { Button, buttonClass } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { GIDXDocument, idNameToCategoryType } from 'common/gidx/gidx'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { SWEEPIES_NAME, TWOMBA_ENABLED } from 'common/envs/constants'
import { getDocumentsStatus } from 'common/gidx/document'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'
import { VerifyButton } from '../twomba/toggle-verify-callout'
import { MdBlock } from 'react-icons/md'
import { XIcon } from '@heroicons/react/solid'

export const VerifyMe = (props: { user: User }) => {
  const user = useUser() ?? props.user
  const privateUser = usePrivateUser()
  const [show, setShow] = useState(
    TWOMBA_ENABLED &&
      (!user.sweepstakesVerified ||
        !user.idVerified ||
        user.kycDocumentStatus === 'fail' ||
        user.kycDocumentStatus === 'pending')
  )

  const [documents, setDocuments] = useState<GIDXDocument[] | null>(null)
  const [loading, setLoading] = useState(false)
  const {
    fetchMonitorStatus,
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
  if (!show || !user) return null
  const showUploadDocsButton =
    getDocumentsStatus(documents ?? []).isRejected && documents

  if (identityBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 bg-ink-200 text-ink-700 justify-between gap-2 rounded border p-2 px-4'
        }
      >
        <Row className={'w-full items-center gap-1'}>
          <span>
            <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
            Blocked from sweepstakes participation due to blocked identity.{' '}
          </span>
        </Row>
      </Col>
    )
  }
  if (
    user.kycDocumentStatus === 'pending' ||
    user.kycDocumentStatus === 'fail'
  ) {
    return (
      <Col
        className={
          'border-primary-500  bg-primary-100 justify-between gap-2 rounded border p-2 px-4 dark:bg-indigo-700'
        }
      >
        <Col
          className={'w-full items-center justify-between gap-2 sm:flex-row'}
        >
          <span>Document verification pending... </span>
          <Button
            color={'indigo-outline'}
            loading={loading}
            disabled={loading}
            onClick={getStatus}
            className="w-full sm:w-fit"
          >
            Refresh status
          </Button>
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
              href={'gidx/register'}
              className={clsx(buttonClass('md', 'indigo'))}
            >
              Re-upload documents
            </Link>
          </Row>
        )}
      </Col>
    )
  }

  if (user.sweepstakesVerified) {
    return (
      <Row
        className={
          ' bg-primary-100 border-primary-500 justify-between gap-2 rounded border p-2 px-4 dark:bg-teal-700'
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

  if (ageBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 bg-ink-200 text-ink-700 justify-between gap-2 rounded border p-2 px-4'
        }
      >
        <Row className={'w-full items-center gap-1'}>
          <span>
            <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
            Blocked from sweepstakes participation due to underage.{' '}
          </span>
        </Row>
      </Col>
    )
  }

  if (locationBlocked(user, privateUser)) {
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
          <span>
            <MdBlock className="mb-0.5 mr-1 inline-block h-4 w-4" />
            Blocked from sweepstakes participation due to location.{' '}
          </span>
          <Button
            color={'indigo-outline'}
            loading={loadingMonitorStatus}
            disabled={loadingMonitorStatus}
            onClick={fetchMonitorStatus}
            className={'w-full sm:w-fit'}
          >
            Refresh status
          </Button>
        </div>
        {monitorStatus === 'error' && (
          <Row className={'text-error'}>{monitorStatusMessage}</Row>
        )}
      </Col>
    )
  }

  return (
    <Col
      className={
        'border-primary-500 bg-primary-100 items-center justify-between gap-2 rounded border px-4 py-2 sm:flex-row'
      }
    >
      <span>
        {getVerificationStatus(user).status !== 'success' &&
          `You are not yet verified! Verify to start trading on ${SWEEPIES_NAME} markets.`}
      </span>
      <VerifyButton className={'w-full shrink-0 whitespace-nowrap sm:w-fit'} />
    </Col>
  )
}

const documentStatus: { [k: number]: string } = {
  1: 'Not reviewed',
  2: 'Under review',
  3: 'Complete',
}
