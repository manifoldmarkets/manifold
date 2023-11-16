import { sortBy } from 'lodash'
import { useState } from 'react'

import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { areGenderCompatible } from 'love/lib/util/gender'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useUser } from 'web/hooks/use-user'
import { AddAMatchButton } from '../add-a-match-button'
import { MatchTile } from './match-tile'
import { Carousel } from 'web/components/widgets/carousel'
import { Row } from 'web/components/layout/row'

export const Matches = (props: { userId: string }) => {
  const { userId } = props
  const lovers = useLovers()
  const matches = useMatches(userId)
  const user = useUser()

  const truncatedSize = 5

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === userId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers
    .filter((l) => l.user_id !== userId)
    .filter((l) => !matchesSet.has(l.user_id))
    .filter((l) => !lover || areGenderCompatible(lover, l))
    .filter((l) => l.looking_for_matches)

  // const currentMatches = sortBy(
  //   matches.filter((c) => !c.isResolved),
  //   (c) => (c.answers[tabIndex].resolution ? 1 : 0),
  //   (c) => -1 * c.answers[tabIndex].prob
  // )

  const currentMatches = matches
    .filter((c) => !c.isResolved)
    .sort((a, b) => {
      const resolvedCountA = a.answers.filter((ans) => ans.resolution).length
      const resolvedCountB = b.answers.filter((ans) => ans.resolution).length

      if (resolvedCountA !== resolvedCountB) {
        return resolvedCountB - resolvedCountA
      }

      const highestUnresolvedProbabilityA = Math.max(
        ...a.answers.filter((ans) => !ans.resolution).map((ans) => ans.prob),
        0
      )
      const highestUnresolvedProbabilityB = Math.max(
        ...b.answers.filter((ans) => !ans.resolution).map((ans) => ans.prob),
        0
      )

      return highestUnresolvedProbabilityB - highestUnresolvedProbabilityA
    })
  const areYourMatches = userId === user?.id

  return (
    <Col className=" w-full gap-2 ">
      {currentMatches.length > 0 ? (
        <Col>
          <div className="text-lg font-semibold">Matches</div>
          <Carousel>
            {currentMatches.map((contract) => {
              const matchedLoverId =
                contract.loverUserId1 === userId
                  ? contract.loverUserId2
                  : contract.loverUserId1
              const matchedLover = lovers.find(
                (lover) =>
                  lover.user_id === matchedLoverId && lover.looking_for_matches
              )
              return (
                matchedLover && (
                  <MatchTile
                    key={contract.id}
                    contract={contract}
                    answers={contract.answers}
                    lover={matchedLover}
                    isYourMatch={areYourMatches}
                  />
                )
              )
            })}
          </Carousel>
        </Col>
      ) : (
        <Col>
          <span className={'text-ink-500 text-sm'}>No matches yet.</span>
        </Col>
      )}

      {lover && (
        <AddAMatchButton lover={lover} potentialLovers={potentialLovers} />
      )}
    </Col>
  )
}
