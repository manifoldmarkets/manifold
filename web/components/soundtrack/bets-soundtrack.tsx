import { useState } from 'react'
import * as Tone from 'tone'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { first } from 'lodash'
import { Bet } from 'common/bet'
import { Button } from 'web/components/buttons/button'
import {
  soundsByUserId,
  soundUrlToUserId,
} from 'web/components/soundtrack/sound-recorder'
import { useEvent } from 'web/hooks/use-event'
import { Row } from 'web/components/layout/row'
import { RefreshIcon } from '@heroicons/react/solid'

export const BetsSoundtrack = () => {
  const [enabled, setEnabled] = useState(true)
  const [toneMap, setToneMap] = useState<Record<string, Tone.Player>>({})
  const [loading, setLoading] = useState(false)

  const loadSounds = async () => {
    const newToneMap: Record<string, Tone.Player> = {}
    setLoading(true)

    const sounds = Object.values(soundsByUserId)
    for (const sound of sounds) {
      try {
        const response = await fetch(sound)
        if (!response.ok) throw new Error('Network response was not ok')
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)

        newToneMap[soundUrlToUserId(sound)] = new Tone.Player(url, () => {
          console.log('loaded', sound)
        }).toDestination()
      } catch (error) {
        console.error('Sound fetch error:', error)
      }
    }
    setToneMap(newToneMap)
    setLoading(false)
    console.log('loaded sounds', newToneMap)
  }

  const notesInScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const allAvailableNotes = [1, 2, 3, 4, 5, 6]
    .map((i) => notesInScale.map((n) => n + i))
    .flat() as string[]

  const onNewBet = useEvent((bet: Bet) => {
    console.log('new bet', bet.userId, bet)
    const fmSynth = new Tone.FMSynth({
      portamento: 1,
    }).toDestination()
    if (!fmSynth) return
    const userHasSound = !!soundsByUserId[bet.userId]
    console.log('userHasSound', userHasSound)
    if (userHasSound && toneMap[bet.userId]) {
      toneMap[bet.userId].start()
      return
    }
    const firstProb = bet.probBefore
    const secondProb = bet.probAfter
    const firstNote =
      allAvailableNotes[Math.floor(firstProb * allAvailableNotes.length)]
    const secondNote =
      allAvailableNotes[Math.floor(secondProb * allAvailableNotes.length)]
    // console.log('new note', firstNote)
    // Define the starting note and ending note

    const duration = 0.5

    // Trigger the attack of the starting note
    fmSynth.triggerAttack(firstNote)

    setTimeout(() => {
      fmSynth.setNote(secondNote)
      // Schedule the release of the note after the glide
      setTimeout(() => {
        fmSynth.triggerRelease()
      }, duration * 1000)
    }, duration * 1000)

    // fmSynth.triggerAttackRelease(firstNote, '4n')
  })

  useApiSubscription({
    enabled,
    topics: ['global/new-bet'],
    onBroadcast: (msg) => {
      const bet = first(msg.data.bets as Bet[]) as Bet
      onNewBet(bet)
    },
    onError: (err) => {
      console.error('Error in bets soundtrack subscription', err)
    },
  })
  return (
    <Row>
      <Button color={'gray-white'} loading={loading} onClick={loadSounds}>
        <RefreshIcon className={'h-4 w-4'} />
      </Button>
      <Button color={'gray-white'} onClick={() => setEnabled(!enabled)}>
        {enabled ? 'Disable' : 'Enable'} Soundtrack
      </Button>
    </Row>
  )
}
