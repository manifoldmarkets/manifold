import router from 'next/router'
import { useEffect, useState } from 'react'

import { CreatorContractsList } from '../components/contracts-list'
import { Spacer } from '../components/layout/spacer'
import { Title } from '../components/title'
import { useUser } from '../hooks/use-user'
import { path } from '../lib/firebase/contracts'
import { createContract } from '../lib/service/create-contract'
import { Page } from '../components/page'
import { Row } from '../components/layout/row'
import clsx from 'clsx'

// Allow user to create a new contract
export default function NewContract() {
  const creator = useUser()

  useEffect(() => {
    if (creator === null) router.push('/')
  })

  const [initialProb, setInitialProb] = useState(50)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [collapsed, setCollapsed] = useState(true)

  async function submit() {
    // TODO: add more rigorous error handling for question
    if (!creator || !question) return

    setIsSubmitting(true)

    const contract = await createContract(
      question,
      description,
      initialProb,
      creator
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
          <div className="flex justify-between gap-4 items-center">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Prediction</span>
              </label>

              <input
                type="text"
                placeholder="e.g. The FDA will approve Paxlovid before Jun 2nd, 2022"
                className="input"
                value={question}
                onChange={(e) => setQuestion(e.target.value || '')}
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Chance</span>
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
          </div>

          <div className="mt-2 mb-4">
            <a
              href="#"
              className="text-sm text-gray-400"
              onClick={() => setCollapsed(!collapsed)}
            >
              ▼ Advanced
            </a>
          </div>

          {/* Collapsible "Advanced" section */}
          <div
            tabIndex={0}
            className={clsx(
              'cursor-pointer relative',
              collapsed ? 'collapse-close' : 'collapse-open'
            )}
            onClick={() => setCollapsed((collapsed) => !collapsed)}
          >
            <Row>
              <div
                className="collapse-title p-0 absolute w-0 h-0 min-h-0"
                style={{ top: -10, right: 4 }}
              />
            </Row>
            <div className="collapse-content !p-0 m-0 !bg-transparent">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Description</span>
                </label>
                <textarea
                  className="textarea w-full h-24 textarea-bordered"
                  placeholder={descriptionPlaceholder}
                  value={description}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDescription(e.target.value || '')}
                ></textarea>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Resolution date</span>
                </label>
                <input
                  type="date"
                  className="input"
                  onClick={(e) => e.stopPropagation()}
                  value="2012-07-22"
                  min="2022-01-01"
                  max="2022-12-31"
                />
              </div>
            </div>
          </div>

          <Spacer h={4} />

          <div className="flex justify-end my-4">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !question}
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
