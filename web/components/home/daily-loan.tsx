import { useEffect, useState } from 'react'
import clsx from 'clsx'

import { Col } from 'web/components/layout/col'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { LoansModal } from 'web/components/profile/loans-modal'
import { requestLoan } from 'web/lib/firebase/api'
import { toast } from 'react-hot-toast'
import Image from 'next/image'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import { DAY_MS } from 'common/util/time'
import { Row } from 'web/components/layout/row'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { updateUser } from 'web/lib/firebase/users'

dayjs.extend(utc)
dayjs.extend(timezone)
export function DailyLoan(props: { user: User }) {
  const { user } = props

  const [showLoansModal, setShowLoansModal] = useState(false)
  const [loaning, setLoaning] = useState(false)
  const getLoan = async () => {
    if (receivedLoanToday) {
      setShowLoansModal(true)
      return
    }
    setLoaning(true)
    const id = toast.loading('Requesting loan...')
    const res = await requestLoan().catch((e) => {
      console.error(e)
      toast.error('Error requesting loan')
      return null
    })
    if (res) toast.success(`${formatMoney(res.payout)} loan collected!`)
    await checkTxns()
    toast.dismiss(id)
    if (!user.hasSeenLoanModal) setTimeout(() => setShowLoansModal(true), 1000)
    setLoaning(false)
  }

  useEffect(() => {
    if (showLoansModal && !user.hasSeenLoanModal)
      updateUser(user.id, { hasSeenLoanModal: true })
  }, [showLoansModal])

  const { receivedLoanToday, checkTxns } = useHasReceivedLoanToday(user)
  if (
    user.createdTime > Date.now() - DAY_MS ||
    !user.lastBetTime ||
    (user.nextLoanCached < 1 && !receivedLoanToday)
  )
    return <div />

  return (
    <Col className={clsx(dailyStatsClass, '')}>
      <button disabled={loaning} onClick={getLoan}>
        <Row
          className={clsx(
            'items-center justify-center whitespace-nowrap px-1 pb-0.5',
            receivedLoanToday ? '' : 'pt-1'
          )}
        >
          <Image
            className={receivedLoanToday ? '' : 'grayscale'}
            height={20}
            width={20}
            src={receivedLoanToday ? '/open-chest.svg' : '/closed-chest.svg'}
            alt={'treasure icon'}
          />
        </Row>
        <div className="text-ink-600 text-xs">Loan</div>
      </button>
      {showLoansModal && (
        <LoansModal
          isOpen={showLoansModal}
          user={user}
          setOpen={setShowLoansModal}
        />
      )}
    </Col>
  )
}
