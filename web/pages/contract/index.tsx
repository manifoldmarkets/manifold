import router from 'next/router'
import { useState } from 'react'

import { ContractsList } from '../../components/contracts-list'
import { Header } from '../../components/header'
import { Spacer } from '../../components/layout/spacer'
import { Title } from '../../components/title'
import { useUser } from '../../hooks/use-user'
import { createContract } from '../../lib/service/create-contract'

// Allow user to create a new contract
export default function NewContract() {
  const creator = useUser()

  const [initialProb, setInitialProb] = useState(50)
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit() {
    // TODO: add more rigorous error handling for question, description
    if (!creator || !question || !description) return

    setIsSubmitting(true)

    const contract = await createContract(
      question,
      description,
      initialProb,
      creator
    )
    await router.push(`contract/${contract.id}`)
  }

  const descriptionPlaceholder = `e.g. This market will resolve to “Yes” if, by June 2, 2021, 11:59:59 PM ET, Paxlovid (also known under PF-07321332)...`

  return (
    <div>
      <Header />

      <div className="max-w-4xl py-12 lg:mx-auto px-4">
        <Title text="Create a new prediction market" />

        <div className="w-full bg-gray-100 rounded-lg shadow-xl px-6 py-4">
          {/* Create a Tailwind form that takes in all the fields needed for a new contract */}
          {/* When the form is submitted, create a new contract in the database */}
          <form>
            <div className="form-control">
              <label className="label">
                <span className="label-text">Question</span>
              </label>

              <input
                type="text"
                placeholder="e.g. Will the FDA approve Paxlovid before Jun 2nd, 2022?"
                className="input"
                value={question}
                onChange={(e) => setQuestion(e.target.value || '')}
              />
            </div>

            <Spacer h={4} />

            <div className="form-control">
              <label className="label">
                <span className="label-text">Description</span>
              </label>

              <textarea
                className="textarea h-24 textarea-bordered"
                placeholder={descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value || '')}
              ></textarea>
            </div>

            <Spacer h={4} />

            <div className="form-control">
              <label className="label">
                <span className="label-text">
                  Initial probability: {initialProb}%
                </span>
              </label>

              <input
                type="range"
                min="1"
                max={99}
                value={initialProb}
                onChange={(e) => setInitialProb(parseInt(e.target.value))}
              />
            </div>

            <Spacer h={4} />

            <div className="flex justify-end my-4">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
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

        <ContractsList />
      </div>
    </div>
  )
}
