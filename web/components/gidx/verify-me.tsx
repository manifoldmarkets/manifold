import {
  ageBlocked,
  getVerificationStatus,
  identityBlocked,
  locationBlocked,
  User,
} from 'common/user'
import { KYC_VERIFICATION_BONUS } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { CoinNumber } from 'web/components/widgets/manaCoinNumber'
import Link from 'next/link'
import clsx from 'clsx'
import { Button, buttonClass } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { GIDXDocument, idNameToCategoryType } from 'common/gidx/gidx'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { getDocumentsStatus } from 'common/gidx/document'
import { useMonitorStatus } from 'web/hooks/use-monitor-status'

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
          'border-ink-400 m-2 justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700'
        }
      >
        <Row className={'w-full items-center justify-between'}>
          <span>
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
          'border-ink-400 m-2 justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700'
        }
      >
        <Row className={'w-full items-center justify-between'}>
          <span>Document verification pending. </span>
          <Button
            color={'indigo-outline'}
            loading={loading}
            disabled={loading}
            onClick={getStatus}
          >
            Refresh status
          </Button>
        </Row>

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
      <Col
        className={
          'm-2 justify-between gap-2 rounded-sm bg-teal-100 p-2 px-3 dark:bg-teal-700'
        }
      >
        <Col className={'w-full items-center justify-between sm:flex-row'}>
          <span>
            <span className={'text-lg'}>🎉</span> Congrats, you've been
            verified! <span className={'text-lg'}>🎉</span>
          </span>

          <Button color={'gray-white'} onClick={() => setShow(false)}>
            Close
          </Button>
        </Col>
      </Col>
    )
  }

  if (ageBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 m-2 justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700'
        }
      >
        <Row className={'w-full items-center justify-between'}>
          <span>Blocked from sweepstakes participation due to underage. </span>
        </Row>
      </Col>
    )
  }

  if (locationBlocked(user, privateUser)) {
    return (
      <Col
        className={
          'border-ink-400 m-2 justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700'
        }
      >
        <Row className={'w-full items-center justify-between'}>
          <span>Blocked from sweepstakes participation due to location. </span>
          <Button
            color={'indigo-outline'}
            loading={loadingMonitorStatus}
            disabled={loadingMonitorStatus}
            onClick={fetchMonitorStatus}
          >
            Refresh status
          </Button>
        </Row>
        {monitorStatus === 'error' && (
          <Row className={'text-error'}>{monitorStatusMessage}</Row>
        )}
      </Col>
    )
  }

  return (
    <Col
      className={
        'border-ink-400 m-2 items-center justify-between gap-2 rounded-sm border bg-indigo-200 p-2 px-3 dark:bg-indigo-700 sm:flex-row'
      }
    >
      <span>
        {getVerificationStatus(user).status !== 'success' &&
          'Verify your identity to collect '}
        <CoinNumber
          amount={KYC_VERIFICATION_BONUS}
          className={'font-bold'}
          isInline
        />
        .{' '}
      </span>
      <Link
        href={'gidx/register'}
        className={clsx(buttonClass('md', 'indigo'))}
      >
        Claim {formatMoney(KYC_VERIFICATION_BONUS)}
      </Link>
    </Col>
  )
}

const documentStatus: { [k: number]: string } = {
  1: 'Not reviewed',
  2: 'Under review',
  3: 'Complete',
}
