import { useEffect, useState } from 'react'
import { User } from 'common/user'
import { formatMoney } from 'common/util/format'
import { LoansModal } from 'web/components/profile/loans-modal'
import { requestLoan } from 'web/lib/firebase/api'
import { toast } from 'react-hot-toast'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useHasReceivedLoanToday } from 'web/hooks/use-has-received-loan'
import { updateUser } from 'web/lib/firebase/users'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { Tooltip } from 'web/components/widgets/tooltip'
import { track } from 'web/lib/service/analytics'
import { DAY_MS } from 'common/util/time'
import { Button } from 'web/components/buttons/button'

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
    track('request loan', {
      amount: res?.payout,
    })
  }

  useEffect(() => {
    if (showLoansModal && !user.hasSeenLoanModal)
      updateUser(user.id, { hasSeenLoanModal: true })
  }, [showLoansModal])

  const createdRecently = user.createdTime > Date.now() - 2 * DAY_MS
  if (createdRecently) {
    return null
  }

  return (
    <Button
      color={'gray-outline'}
      size={'2xs'}
      loading={loaning}
      disabled={loaning || receivedLoanToday || notEligibleForLoan}
      onClick={(e) => {
        e.stopPropagation()
        getLoan()
      }}
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
        Get loan
      </Tooltip>
      {showLoansModal && (
        <LoansModal
          isOpen={showLoansModal}
          user={user}
          setOpen={setShowLoansModal}
        />
      )}
    </Button>
  )
}
