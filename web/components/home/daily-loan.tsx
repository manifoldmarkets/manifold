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
import { Row } from 'web/components/layout/row'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { updateUser } from 'web/lib/firebase/users'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Tooltip } from 'web/components/widgets/tooltip'

dayjs.extend(utc)
dayjs.extend(timezone)
export function DailyLoan(props: { user: User }) {
  const { user } = props

  const [showLoansModal, setShowLoansModal] = useState(false)
  const [loaning, setLoaning] = useState(false)
  const [justReceivedLoan, setJustReceivedLoan] = usePersistentInMemoryState(
    false,
    `just-received-loan-${user.id}`
  )
  const { receivedLoanToday: receivedTxnLoan, checkTxns } =
    useHasReceivedLoanToday(user)
  const notEligibleForLoan = user.nextLoanCached < 1
  const receivedLoanToday = receivedTxnLoan || justReceivedLoan

  const getLoan = async () => {
    if (receivedLoanToday || notEligibleForLoan) {
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
    if (res) {
      await checkTxns()
      toast.success(`${formatMoney(res.payout)} loan collected!`)
      setJustReceivedLoan(true)
    }
    toast.dismiss(id)
    if (!user.hasSeenLoanModal) setTimeout(() => setShowLoansModal(true), 1000)
    setLoaning(false)
  }

  useEffect(() => {
    if (showLoansModal && !user.hasSeenLoanModal)
      updateUser(user.id, { hasSeenLoanModal: true })
  }, [showLoansModal])

  return (
    <Col
      className={clsx(
        dailyStatsClass,
        receivedLoanToday || notEligibleForLoan
          ? ''
          : 'hover:bg-canvas-100 ring-[1.7px] ring-amber-300'
      )}
    >
      <Tooltip
        text={
          receivedLoanToday
            ? 'Loan already collected'
            : notEligibleForLoan
            ? 'Daily loans'
            : 'Collect a loan on your bets'
        }
        placement={'bottom'}
      >
        <button disabled={loaning} onClick={getLoan}>
          <Row
            className={clsx(
              'items-center justify-center whitespace-nowrap px-1'
            )}
          >
            <Image
              height={25}
              width={25}
              src={
                receivedLoanToday || notEligibleForLoan
                  ? '/chest-empty.svg'
                  : '/coins.svg'
              }
              alt={'treasure icon'}
            />
          </Row>
          <div className="text-ink-600 text-xs">Loan</div>
        </button>
      </Tooltip>
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
