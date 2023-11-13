import { useEffect, useMemo, useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Button, ButtonProps } from '../buttons/button'
import clsx from 'clsx'
import Balancer from 'react-wrap-balancer'
import { take, uniq, flatten } from 'lodash'

import { CPMMContract } from 'common/contract'
import { Transition } from '@headlessui/react'
import { TOPICS_TO_SUBTOPICS } from 'common/topics'
import { PillButton } from '../buttons/pill-button'
import { useGetTrendingGroups } from 'web/hooks/api/use-get-trending-groups'
import { useGetTrendingContracts } from 'web/hooks/api/use-get-trending-contracts'
import { joinGroup, placeBet, updateUserEmbedding } from 'web/lib/firebase/api'
import Image from 'next/image'
import { track } from 'web/lib/service/analytics'
import { updateUser } from 'web/lib/firebase/users'
import { useSearchParam } from 'web/hooks/use-search-param'

const orderedOnboardingViews = ['intro', 'interests', 'thanks'] as const
type OnboardingView = typeof orderedOnboardingViews[number]

type SharedState = {
  groupsBetOn?: Array<string>
}

export function Onboarding() {
  const user = useUser()
  const [onboardingView, setOnboardingView] =
    useSearchParam<OnboardingView>('onboarding')
  const [sharedState, setSharedState] = useState<SharedState>({})

  useEffect(() => {
    if (!!onboardingView) {
      track('onboarding: landed', { view: onboardingView })
    }
  }, [!!onboardingView])

  useEffect(() => {
    if (user?.shouldShowWelcome) {
      setOnboardingView(orderedOnboardingViews[0])
    }
  }, [user?.shouldShowWelcome])

  function handleAdvance(change?: SharedState) {
    if (!onboardingView) {
      return
    }
    if (change) {
      setSharedState((prev) => ({ ...prev, ...change }))
    }
    const currentIndex = orderedOnboardingViews.indexOf(onboardingView)
    const nextIndex = currentIndex + 1
    if (nextIndex < orderedOnboardingViews.length) {
      track('onboarding: view change', {
        view: orderedOnboardingViews[nextIndex],
      })
      setOnboardingView(orderedOnboardingViews[nextIndex])
    } else if (nextIndex === orderedOnboardingViews.length) {
      handleClose({ completed: true })
    }
  }

  async function handleClose({ completed }: { completed: boolean }) {
    track('onboarding: closed', { completed })

    if (user && user.shouldShowWelcome) {
      await updateUser(user.id, { shouldShowWelcome: false })
    }

    setOnboardingView(undefined)
  }

  return (
    <Modal
      open={!!onboardingView}
      setOpen={() => handleClose({ completed: false })}
      size={'lg'}
      className="h-screen sm:h-auto"
      containerClassName="!pt-0"
      noAutoFocus
    >
      <div className="h-full p-4 md:p-0">
        <Col className="bg-canvas-0 h-full rounded-md">
          <Row className="border-ink-300 h-14 items-center justify-between border-b px-6 py-2">
            <Row className="flex-[2] gap-0.5 sm:w-1/2">
              {orderedOnboardingViews.map((key, i, arr) => {
                const isFirst = i === 0
                const isLast = i === arr.length - 1
                const isHighlighted =
                  onboardingView &&
                  orderedOnboardingViews.indexOf(onboardingView) >= i

                return (
                  <div
                    key={key}
                    className={clsx(
                      'bg-canvas-100 h-2 flex-1 transition-colors',
                      isFirst && 'rounded-l-full',
                      isLast && 'rounded-r-full',
                      isHighlighted && 'bg-primary-500'
                    )}
                  />
                )
              })}
            </Row>
            <Row className="flex-1 justify-end">
              {onboardingView !== orderedOnboardingViews.at(-1) && (
                <Button
                  className="-mr-4"
                  color="gray-white"
                  onClick={() => handleClose({ completed: false })}
                >
                  Exit
                </Button>
              )}
            </Row>
          </Row>

          {onboardingView === 'intro' && (
            <OnboardingViewIntro onAdvance={handleAdvance} {...sharedState} />
          )}
          {onboardingView === 'interests' && (
            <OnboardingViewInterests
              onAdvance={handleAdvance}
              {...sharedState}
            />
          )}
          {onboardingView === 'thanks' && (
            <OnboardingViewThanks onAdvance={handleAdvance} {...sharedState} />
          )}
        </Col>
      </div>
    </Modal>
  )
}

function OnboardingView({
  children,
  buttonProps = {},
}: {
  children: React.ReactNode
  buttonProps?: Omit<Partial<ButtonProps>, 'ref'>
}) {
  return (
    <Col className="flex-1">
      <div className="flex-1 basis-0 overflow-y-auto p-4 sm:h-[60vh] sm:flex-auto sm:px-8">
        {children}
      </div>
      <Row className="border-ink-300 justify-end border-t p-4 sm:p-2">
        <Button {...buttonProps} className="w-full sm:w-auto">
          {buttonProps.children || 'Continue'}
        </Button>
      </Row>
    </Col>
  )
}

type BetFormItem = {
  value: 'YES' | 'NO' | 'SKIP'
  betId: string
  groupIds: Array<string>
}

type SharedOnboardingViewProps = {
  onAdvance: (change?: Partial<SharedState>) => void
} & SharedState

function OnboardingViewIntro({ onAdvance }: SharedOnboardingViewProps) {
  const trendingContracts = useGetTrendingContracts<CPMMContract>()
  const [betsMade, setBetsMade] = useState<Record<string, BetFormItem>>({})

  const contractsWithUniqueGroups = useMemo(() => {
    let seenGroupSlugs: Array<string> = []
    const uniqueGroupSlugContracts = trendingContracts?.filter((contract) => {
      if (contract.groupSlugs) {
        const hasSeenSlug = contract.groupSlugs.some((slug) =>
          seenGroupSlugs.includes(slug)
        )

        if (!hasSeenSlug) {
          seenGroupSlugs = [...seenGroupSlugs, ...contract.groupSlugs]
          return true
        }
      }
      return false
    })

    return uniqueGroupSlugContracts
  }, [trendingContracts])

  const contractsFilledOutPlusOne = take(
    contractsWithUniqueGroups,
    Object.keys(betsMade).length + 1
  )

  return (
    <OnboardingView
      buttonProps={{
        onClick: () => {
          const groupsBetOn = uniq(
            flatten(
              Object.values(betsMade).map((bet) =>
                bet.value !== 'SKIP' ? bet.groupIds : []
              )
            )
          )
          return onAdvance({ groupsBetOn })
        },
        disabled: Object.keys(betsMade).length < 2,
      }}
    >
      <h4 className="text-primary-700 mb-6 mt-3 text-center text-xl font-normal sm:text-2xl">
        <Balancer>
          Manifold lets you bet fake money on real events — from sports to
          politics.
        </Balancer>
      </h4>

      {contractsFilledOutPlusOne.map((contract) => {
        const formItem = betsMade[contract.id]
        const handleBet = async (value: 'YES' | 'NO' | 'SKIP') => {
          track('onboarding: bet', {
            value,
            alreadyBet: !!formItem,
          })

          let betId = formItem?.betId ?? ''

          if ((value === 'YES' || value === 'NO') && !formItem?.betId) {
            try {
              const bet = await placeBet({
                outcome: value,
                amount: 10,
                contractId: contract.id,
              })

              betId = bet.betId
            } catch (error) {
              console.error(error)
            }
          }

          setBetsMade((prev) => ({
            ...prev,
            [contract.id]: {
              value,
              betId,
              groupIds: contract.groupLinks?.map((link) => link.groupId) || [],
            },
          }))
        }

        return (
          <Transition
            key={contract.id}
            appear
            show
            className="px-2 py-4"
            enter="ease-out duration-300"
            enterFrom="opacity-0 -translate-y-2"
            enterTo="opacity-100 translate-y-0"
          >
            <div className="text-lg">{contract.question}</div>

            <Row className="mt-4 gap-2">
              <Button
                size="lg"
                color={
                  formItem?.value && formItem.value !== 'YES'
                    ? 'green-outline'
                    : 'green'
                }
                className="flex-1"
                onClick={() => handleBet('YES')}
              >
                Bet YES
              </Button>
              <Button
                size="lg"
                color={
                  formItem?.value && formItem.value !== 'NO'
                    ? 'red-outline'
                    : 'red'
                }
                className="flex-1"
                onClick={() => handleBet('NO')}
              >
                Bet NO
              </Button>
            </Row>
            <Row className="mt-2 justify-center">
              <Button
                size="sm"
                color={formItem?.value === 'SKIP' ? 'gray' : 'gray-white'}
                onClick={() => handleBet('SKIP')}
              >
                Not interested
              </Button>
            </Row>
          </Transition>
        )
      })}
    </OnboardingView>
  )
}

function OnboardingViewInterests({
  onAdvance,
  groupsBetOn = [],
}: SharedOnboardingViewProps) {
  const trendingGroups = useGetTrendingGroups({ limit: 10 })
  const [selected, setSelected] = useState<Array<string>>(groupsBetOn)
  const [isLoading, setIsLoading] = useState(false)

  const trendingGroupIds = trendingGroups.map((group) => group.id)
  const topicsWithFilteredSubtopics = Object.entries(TOPICS_TO_SUBTOPICS).map(
    ([topic, subtopics]) => {
      return {
        topic,
        subtopics: subtopics.filter(
          (topic) => !trendingGroupIds.includes(topic.groupId)
        ),
      }
    }
  )

  const handleSelectDeselect = (id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id)
        ? prev.filter((t) => t !== id)
        : [...prev, id]
      return next
    })
  }

  return (
    <OnboardingView
      buttonProps={{
        onClick: async () => {
          setIsLoading(true)
          try {
            await Promise.all(selected.map((groupId) => joinGroup({ groupId })))
            await updateUserEmbedding()
          } catch (error) {
            console.error(error)
          }
          setIsLoading(false)
          onAdvance()
        },
        disabled: Object.keys(selected).length < 3,
        loading: isLoading,
      }}
    >
      <h4 className="text-primary-700 mb-6 mt-3 text-center text-xl font-normal sm:text-2xl">
        <Balancer>What are you interested in?</Balancer>
      </h4>

      {trendingGroups.length ? (
        <Row className="flex-wrap gap-2 p-4">
          {trendingGroups.map((group) => (
            <PillButton
              key={group.id}
              selected={selected.includes(group.id)}
              onSelect={() => handleSelectDeselect(group.id)}
            >
              {group.name}
            </PillButton>
          ))}
        </Row>
      ) : null}

      {topicsWithFilteredSubtopics.map(({ topic, subtopics }) => {
        return (
          <Row key={topic} className="flex-wrap gap-2 p-4">
            {subtopics.map((topic) => (
              <PillButton
                key={topic.groupId}
                selected={selected.includes(topic.groupId)}
                onSelect={() => handleSelectDeselect(topic.groupId)}
              >
                {topic.name}
              </PillButton>
            ))}
          </Row>
        )
      })}
    </OnboardingView>
  )
}

function OnboardingViewThanks({ onAdvance }: SharedOnboardingViewProps) {
  return (
    <OnboardingView
      buttonProps={{
        onClick: () => onAdvance(),
        children: 'Claim & Finish',
      }}
    >
      <h4 className="text-primary-700 mb-6 mt-3 text-center text-xl font-normal sm:text-2xl">
        <Balancer>You are on a roll!</Balancer>
      </h4>

      <Row className="m-6 justify-center">
        <Image
          src={'/welcome/treasure.png'}
          alt="Mana signup bonus"
          width={350}
          height={350}
        />
      </Row>

      <p className="my-6 text-center">
        <Balancer>
          As a thank you for signing up, we offer you M500 free mana.
        </Balancer>
      </p>
      <p className="my-6 text-center">
        <Balancer>
          Spend your mana on asking questions, placing bets or donate to
          charity.
        </Balancer>
      </p>
    </OnboardingView>
  )
}
