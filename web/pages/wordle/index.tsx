import { Page } from '../../components/page'
import { Title } from '../../components/title'
// From https://github.com/lynn/hello-wordl
// `dictionary` has all accepted words; `targets` are common-ish words
import * as dictionary from './dictionary.json'
import * as targets from './targets.json'

export default function Wordle() {
  const WORD_LENGTH = 5
  // Find all words of length WORD_LENGTH
  // const dict = dictionary.filter((word) => word.length === WORD_LENGTH)
  const words = targets.filter((word) => word.length === WORD_LENGTH)

  const pastGuesses: PastGuess[] = [
    // From https://hellowordl.net/?challenge=aGFyZHk
    // { guess: 'sheep', result: 'BYBBB' },
    // { guess: 'butch', result: 'BBBBY' },
    // { guess: 'hydra', result: 'GYYYY' },
    // Answer: hardy
    { guess: 'snowy', result: 'BBBYB' },
    { guess: 'wheel', result: 'GYBBB' },
  ]

  const valids = validHardMode(words, pastGuesses)

  return (
    <Page>
      <div className="text-gray-500">
        <Title text="Wordle: Hard Mode possibilities" />
        <p className="text-black">
          Given a list of past Wordle guesses, show all possible valid next
          guesses for Hard Mode
        </p>
        Actually for{' '}
        <a href="https://hellowordl.net/">https://hellowordl.net/</a>
        <p>Past guesses:</p>
        <pre>{JSON.stringify(pastGuesses, null, 2)}</pre>
        <br />
        <br />
        <p className="text-black">
          {Array(10)
            .fill(null)
            .map((_) => chooseRandom(valids))
            .join(', ')}
        </p>
        <p>Total valid words: {valids.length}</p>
        <p>All valid words:</p>
        <pre>{JSON.stringify(valids, null, 2)}</pre>
      </div>
    </Page>
  )
}

function chooseRandom(list: any[]) {
  return list[Math.floor(Math.random() * list.length)]
}

type PastGuess = {
  guess: string
  // Result is a string like 'GYBBG'
  // G = Green (match), Y = Yellow (somewhere), B = Black (nowhere)
  result: string
}

function validHardMode(wordlist: string[], pastGuesses: PastGuess[]) {
  let candidates = wordlist.slice()
  const blacks = new Set()
  for (const { guess, result } of pastGuesses) {
    candidates = candidates.filter((word) => {
      // e.g. guess = 'helot', result = 'GGGYB', word = 'hello => true
      // e.g. guess = 'helot', result = 'GGGYB', word = 'helot => false
      const guessYellows = []
      const wordNonGreens: string[] = []

      for (let i = 0; i < result.length; i++) {
        switch (result[i]) {
          case 'G':
            if (word[i] !== guess[i]) return false
            break
          case 'Y':
            if (word[i] === guess[i]) return false
            guessYellows.push(guess[i])
            wordNonGreens.push(word[i])
            break
          case 'B':
            if (word[i] === guess[i]) return false
            wordNonGreens.push(word[i])
            blacks.add(guess[i])
            break
        }
        if (blacks.has(word[i])) return false
      }
      // Return true if every letter in guessYellows is in wordNonGreens
      return guessYellows.every((letter) => wordNonGreens.includes(letter))
    })
  }
  return candidates
}

function parsePastGuesses(pastGuesses: string) {
  return pastGuesses.split('\n').map((pg) => {
    const [guess, result] = pg.split(', ')
    return { guess, result }
  })
}

// Bad target words: witan, sedum
// TODO: Maybe just use canonical Wordle dictionaries
