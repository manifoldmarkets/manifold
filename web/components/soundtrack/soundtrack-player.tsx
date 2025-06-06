import { useState } from 'react'
import * as Tone from 'tone'
import { Bet } from 'common/bet'
import { Button } from 'web/components/buttons/button'
import {
  soundsByUserId,
  soundUrlToUserId,
} from 'web/components/soundtrack/sound-recorder'
import { useEvent } from 'client-common/hooks/use-event'
import { Row } from 'web/components/layout/row'
import { RefreshIcon } from '@heroicons/react/solid'
import { getTransport, GrainPlayer } from 'tone'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { first } from 'lodash'

type ToneMap = Record<
  string,
  {
    player: GrainPlayer
    // pitchShift: Tone.PitchShift
  }
>
const sequencesByBetId: Record<string, Tone.Sequence> = {}
export const SoundtrackPlayer = () => {
  const [enabled, setEnabled] = useState(true)
  const [toneMap, setToneMap] = useState<ToneMap>({})
  const [loading, setLoading] = useState(false)
  const [oldBets, setOldBets] = useState<Bet[]>([])

  const notesInScale = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const allAvailableNotes = [1, 2, 3, 4]
    .map((i) => notesInScale.map((n) => n + i))
    .flat() as string[]

  // Assuming `useEvent` and other dependencies are defined elsewhere in your code
  const onNewBet = useEvent((bet: Bet) => {
    console.log('new bet', bet.userId, bet)
    const now = Tone.now()
    const volume = new Tone.Volume(0).toDestination()
    // Create a panner and set its initial pan value
    const randomPan = Math.random() * 2 - 1
    const panner = new Tone.Panner(randomPan).toDestination() // 0 for center, -1 for left, 1 for right

    // Connect volume to panner
    volume.connect(panner)
    const duration = 1.25
    const totalPlayTime = 3
    const envelope = new Tone.AmplitudeEnvelope({
      attack: 0.3,
      decay: 0.3,
      sustain: 0.3,
      release: 0.3,
    }).connect(volume)
    const synth = new Tone.Synth({ portamento: 0.5 }).connect(envelope)

    const userHasSound = !!soundsByUserId[bet.userId]
    console.log('userHasSound', userHasSound)

    const { probBefore, probAfter } = bet
    if (userHasSound && toneMap[bet.userId]) {
      const { player } = toneMap[bet.userId]
      player.start(now)
      // return
    }

    const firstNoteIndex = Math.floor(probBefore * allAvailableNotes.length)
    const lastNoteIndex = Math.floor(probAfter * allAvailableNotes.length)
    const startIndex = Math.min(firstNoteIndex, lastNoteIndex)
    const endIndex = Math.max(firstNoteIndex, lastNoteIndex)
    const sequenceNotes = allAvailableNotes.slice(startIndex, endIndex + 1)
    if (probAfter < probBefore) sequenceNotes.reverse()

    const totalSequenceTime = duration * sequenceNotes.length
    if (startIndex === endIndex) {
      synth.triggerAttackRelease(
        allAvailableNotes[startIndex],
        totalPlayTime,
        now
      )
      envelope.triggerAttackRelease(totalPlayTime, now)

      return
    }

    console.log('sequenceNotes', sequenceNotes)

    const start = now
    const sequence = new Tone.Sequence(
      (time, note) => {
        if (time > start + totalSequenceTime) {
          sequence.dispose()
          synth.dispose()
          volume.dispose()
          envelope.dispose()
          delete sequencesByBetId[bet.id]
        } else {
          synth.triggerAttackRelease(note, duration, time)
          envelope.triggerAttackRelease(duration, time)
        }
      },
      sequenceNotes,
      duration
    ).start(now)
    sequence.stop(now + totalSequenceTime)
    sequencesByBetId[bet.id] = sequence
    envelope.triggerRelease(now)
  })

  const loadSounds = async () => {
    const newToneMap: ToneMap = {}
    setLoading(true)

    const sounds = Object.values(soundsByUserId)
    for (const sound of sounds) {
      try {
        const response = await fetch(sound)
        if (!response.ok) throw new Error('Network response was not ok')
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const player = new GrainPlayer({
          url,
          onload: () => {
            console.log('loaded', sound)
          },
          grainSize: 0.5,
          loop: false,
          overlap: 0.1,
          playbackRate: 1,
        }).toDestination()

        newToneMap[soundUrlToUserId(sound)] = { player }
      } catch (error) {
        console.error('Sound fetch error:', error)
      }
    }
    setLoading(false)
    console.log('loaded sounds', newToneMap)
    getTransport().start()
  }
  // const { rows: realtimeBets } = useRealtimeBets({
  //   limit: 10,
  //   filterRedemptions: true,
  //   order: 'desc',
  // })
  // useEffect(() => {
  //   if (!realtimeBets) return
  //   const newBets = realtimeBets.filter(
  //     (b) => !oldBets.some((ob) => ob.id === b.id)
  //   )
  //   setOldBets(realtimeBets)
  //   newBets.forEach((bet) => {
  //     onNewBet(bet)
  //   })
  // }, [realtimeBets?.length])
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
