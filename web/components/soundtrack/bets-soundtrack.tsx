import { useEffect, useState } from 'react'
import * as Tone from 'tone'
import { useApiSubscription } from 'web/hooks/use-api-subscription'
import { first, groupBy } from 'lodash'
import { Bet } from 'common/bet'
import { Button } from 'web/components/buttons/button'
import useUserSounds from 'web/hooks/use-soundtracks'

export const BetsSoundtrack = () => {
  const [enabled, setEnabled] = useState(true)
  const [fmSynth, setFmSynth] = useState<Tone.FMSynth>()
  const sounds = useUserSounds()
  const soundsByUserId = groupBy(
    sounds,
    (s) => s.split('soundtrack%2F')[1].split('.webm')[0]
  )
  useEffect(() => {
    setFmSynth(
      new Tone.FMSynth({
        portamento: 1,
      }).toDestination()
    )
  }, [])

  const notesInScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const allAvailableNotes = [1, 2, 3, 4, 5, 6]
    .map((i) => notesInScale.map((n) => n + i))
    .flat() as string[]

  useApiSubscription({
    enabled,
    topics: ['global/new-bet'],
    onBroadcast: (msg) => {
      const bet = first(msg.data.bets as Bet[]) as Bet
      console.log('new bet', bet)
      if (!fmSynth) return
      const userHasSound = !!soundsByUserId[bet.userId]
      console.log('userHasSound', userHasSound)
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
    },
    onError: (err) => {
      console.error('Error in bets soundtrack subscription', err)
    },
  })
  return (
    <Button color={'gray-white'} onClick={() => setEnabled(!enabled)}>
      {enabled ? 'Disable' : 'Enable'} Soundtrack
    </Button>
  )
}
