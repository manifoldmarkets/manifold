import router from 'next/router'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import dayjs from 'dayjs'
import Textarea from 'react-expanding-textarea'

import { CreatorContractsList } from '../components/contracts-list'
import { Spacer } from '../components/layout/spacer'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'
import { Contract, path } from '../lib/firebase/contracts'
import { Page } from '../components/page'
import { formatMoney } from '../lib/util/format'
import { AdvancedPanel } from '../components/advanced-panel'
import { createContract } from '../lib/firebase/api-call'
import { Row } from '../components/layout/row'

// Allow user to create a new contract
export default function NewContract() {
  const creator = useUser()

  useEffect(() => {
    if (creator === null) router.push('/')
  }, [creator])

  useEffect(() => {
    // warm up function
    createContract({}).catch()
  }, [])

  const [initialProb, setInitialProb] = useState(50)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')

  const [ante, setAnte] = useState<number | undefined>(0)
  const [anteError, setAnteError] = useState('')
  const [closeDate, setCloseDate] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const closeTime = dateToMillis(closeDate) || undefined
  // We'd like this to look like "Apr 2, 2022, 23:59:59 PM PT" but timezones are hard with dayjs
  const formattedCloseTime = closeTime ? new Date(closeTime).toString() : ''

  const user = useUser()
  const remainingBalance = (user?.balance || 0) - (ante || 0)

  const isValid =
    initialProb > 0 &&
    initialProb < 100 &&
    question.length > 0 &&
    (ante === undefined || (ante >= 0 && ante <= remainingBalance)) &&
    // If set, closeTime must be in the future
    (!closeTime || closeTime > Date.now())

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return

    setIsSubmitting(true)

    const result: any = await createContract({
      question,
      description,
      initialProb,
      ante,
      closeTime: closeTime || undefined,
    }).then((r) => r.data || {})

    if (result.status !== 'success') {
      console.log('error creating contract', result)
      return
    }

    await router.push(path(result.contract as Contract))
  }

  function onAnteChange(str: string) {
    const amount = parseInt(str)

    if (str && isNaN(amount)) return

    setAnte(str ? amount : undefined)

    if (user && user.balance < amount) setAnteError('Insufficient balance')
    else setAnteError('')
  }

  const descriptionPlaceholder = `e.g. This market will resolve to “Yes” if, by June 2, 2021, 11:59:59 PM ET, Paxlovid (also known under PF-07321332)...`

  if (!creator) return <></>

  return (
    <Page>
      <Title text="Create a new prediction market" />

      <div className="w-full bg-gray-100 rounded-lg shadow-md px-6 py-4">
        {/* Create a Tailwind form that takes in all the fields needed for a new contract */}
        {/* When the form is submitted, create a new contract in the database */}
        <form>
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">Question</span>
            </label>

            <Textarea
              placeholder="e.g. Will the FDA will approve Paxlovid before Jun 2nd, 2022?"
              className="input input-bordered resize-none"
              disabled={isSubmitting}
              value={question}
              onChange={(e) => setQuestion(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="form-control">
            <label className="label">
              <span className="label-text">Initial probability</span>
            </label>
            <Row className="items-center gap-2">
              <label className="input-group input-group-lg w-fit text-xl">
                <input
                  type="number"
                  value={initialProb}
                  className="input input-bordered input-md text-primary text-4xl w-24"
                  disabled={isSubmitting}
                  min={1}
                  max={99}
                  onChange={(e) =>
                    setInitialProb(parseInt(e.target.value.substring(0, 2)))
                  }
                />
                <span>%</span>
              </label>
              <input
                type="range"
                className="range range-primary"
                min={1}
                max={99}
                value={initialProb}
                onChange={(e) => setInitialProb(parseInt(e.target.value))}
              />
            </Row>
          </div>

          <Spacer h={4} />

          <div className="form-control">
            <label className="label">
              <span className="label-text">Description</span>
            </label>
            <Textarea
              className="textarea w-full textarea-bordered"
              rows={3}
              placeholder={descriptionPlaceholder}
              value={description}
              disabled={isSubmitting}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDescription(e.target.value || '')}
            />
          </div>

          <AdvancedPanel>
            <div className="form-control mb-1">
              <label className="label">
                <span className="label-text">Subsidize your market</span>
              </label>

              <label className="input-group">
                <span className="text-sm ">M$</span>
                <input
                  className={clsx(
                    'input input-bordered',
                    anteError && 'input-error'
                  )}
                  type="text"
                  placeholder="0"
                  maxLength={9}
                  value={ante ?? ''}
                  disabled={isSubmitting}
                  onChange={(e) => onAnteChange(e.target.value)}
                />
              </label>
              <label>
                <span className="label-text text-gray-400 ml-1">
                  Remaining balance:{' '}
                  {formatMoney(remainingBalance > 0 ? remainingBalance : 0)}
                </span>
              </label>
            </div>

            <Spacer h={4} />

            <div className="form-control">
              <label className="label">
                <span className="label-text">Close date</span>
              </label>
              <input
                type="date"
                className="input input-bordered"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setCloseDate(e.target.value || '')}
                min={new Date().toISOString().split('T')[0]}
                disabled={isSubmitting}
                value={closeDate}
              />
            </div>
            <label>
              <span className="label-text text-gray-400 ml-1">
                No new trades will be allowed after{' '}
                {closeDate ? formattedCloseTime : 'this time'}
              </span>
            </label>
          </AdvancedPanel>

          <Spacer h={4} />

          <div className="flex justify-end my-4">
            <button
              type="submit"
              className={clsx(
                'btn btn-primary',
                isSubmitting && 'loading disabled'
              )}
              disabled={isSubmitting || !isValid}
              onClick={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              {isSubmitting ? 'Creating...' : 'Create market'}
            </button>
          </div>
        </form>
      </div>

      <Spacer h={10} />

      <Title text="Your markets" />

      {creator && <CreatorContractsList creator={creator} />}
    </Page>
  )
}

// Given a date string like '2022-04-02',
// return the time just before midnight on that date (in the user's local time), as millis since epoch
function dateToMillis(date: string) {
  return dayjs(date)
    .set('hour', 23)
    .set('minute', 59)
    .set('second', 59)
    .valueOf()
}
