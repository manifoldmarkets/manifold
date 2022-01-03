import router from 'next/router'
import { useEffect, useState } from 'react'

import { CreatorContractsList } from '../components/contracts-list'
import { Spacer } from '../components/layout/spacer'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'
import { path } from '../lib/firebase/contracts'
import { createContract } from '../lib/service/create-contract'
import { Page } from '../components/page'
import clsx from 'clsx'
import dayjs from 'dayjs'

// Allow user to create a new contract
export default function NewContract() {
  const creator = useUser()

  useEffect(() => {
    if (creator === null) router.push('/')
  })

  const [initialProb, setInitialProb] = useState(50)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [closeDate, setCloseDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  // Given a date string like '2022-04-02',
  // return the time just before midnight on that date (in the user's local time), as millis since epoch
  function dateToMillis(date: string) {
    return dayjs(date)
      .set('hour', 23)
      .set('minute', 59)
      .set('second', 59)
      .valueOf()
  }
  const closeTime = dateToMillis(closeDate)
  // We'd like this to look like "Apr 2, 2022, 23:59:59 PM PT" but timezones are hard with dayjs
  const formattedCloseTime = new Date(closeTime).toString()

  const isValid =
    initialProb > 0 &&
    initialProb < 100 &&
    question.length > 0 &&
    // If set, closeTime must be in the future
    (!closeDate || closeTime > Date.now())

  async function submit() {
    // TODO: Tell users why their contract is invalid
    if (!creator || !isValid) return

    setIsSubmitting(true)

    const contract = await createContract(
      question,
      description,
      initialProb,
      creator,
      closeTime
    )
    await router.push(path(contract))
  }

  const descriptionPlaceholder = `e.g. This market will resolve to “Yes” if, by June 2, 2021, 11:59:59 PM ET, Paxlovid (also known under PF-07321332)...`

  if (!creator) return <></>

  return (
    <Page>
      <Title text="Create a new prediction market" />

      <div className="w-full bg-white rounded-lg shadow-md px-6 py-4">
        {/* Create a Tailwind form that takes in all the fields needed for a new contract */}
        {/* When the form is submitted, create a new contract in the database */}
        <form>
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text">Prediction</span>
            </label>

            <input
              type="text"
              placeholder="e.g. The FDA will approve Paxlovid before Jun 2nd, 2022"
              className="input input-bordered"
              value={question}
              onChange={(e) => setQuestion(e.target.value || '')}
            />
          </div>

          <Spacer h={4} />

          <div className="form-control">
            <label className="label">
              <span className="label-text">Initial probability</span>
            </label>
            <label className="input-group input-group-md w-fit">
              <input
                type="number"
                value={initialProb}
                className="input input-bordered input-md"
                min={1}
                max={99}
                onChange={(e) => setInitialProb(parseInt(e.target.value))}
              />
              <span>%</span>
            </label>
          </div>

          <Spacer h={4} />

          <div className="form-control">
            <label className="label">
              <span className="label-text">Description (optional)</span>
            </label>
            <textarea
              className="textarea w-full h-24 textarea-bordered"
              placeholder={descriptionPlaceholder}
              value={description}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDescription(e.target.value || '')}
            />
          </div>

          {/* Collapsible "Advanced" section */}
          <div
            tabIndex={0}
            className={clsx(
              'cursor-pointer relative collapse collapse-arrow',
              collapsed ? 'collapse-close' : 'collapse-open'
            )}
          >
            <div onClick={() => setCollapsed((collapsed) => !collapsed)}>
              <div className="mt-4 mr-6 text-sm text-gray-400 text-right">
                Advanced
              </div>
              <div
                className="collapse-title p-0 absolute w-0 h-0 min-h-0"
                style={{
                  top: -2,
                  right: -15,
                  color: '#9ca3af' /* gray-400 */,
                }}
              />
            </div>
            <div className="collapse-content !p-0 m-0 !bg-transparent">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Close date (optional)</span>
                </label>
                <input
                  type="date"
                  className="input input-bordered"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setCloseDate(e.target.value || '')}
                  min={new Date().toISOString().split('T')[0]}
                  value={closeDate}
                />
              </div>
              <label>
                {closeDate && (
                  <span className="label-text text-gray-400 ml-1">
                    No new trades will be allowed after {formattedCloseTime}
                  </span>
                )}
              </label>
            </div>
          </div>

          <Spacer h={4} />

          <div className="flex justify-end my-4">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !isValid}
              onClick={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              Create market
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
