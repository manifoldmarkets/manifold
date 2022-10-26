import { XIcon } from '@heroicons/react/outline'
import { Editor } from '@tiptap/react'
import { useState } from 'react'
import { Button } from '../buttons/button'
import { PillButton } from '../buttons/pill-button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { AlertBox } from '../widgets/alert-box'

const API_KEY = process.env.NEXT_PUBLIC_DREAM_KEY
const MODIFIERS =
  '8k, beautiful, illustration, trending on art station, picture of the day, epic composition'

interface DreamModalV2Props {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}

const DreamModalV2Container = ({
  editor,
  open,
  setOpen,
}: DreamModalV2Props) => {
  return (
    <Modal open={open} setOpen={setOpen} size="lg">
      <DreamModalV2 {...{ editor, open, setOpen }} />
    </Modal>
  )
}

type GuideState =
  | 'default'
  | 'description'
  | 'modifiers'
  | 'style'
  | 'completed'

const DreamModalV2 = ({ editor, open, setOpen }: DreamModalV2Props) => {
  const [input, setInput] = useState('')
  const [isDreaming, setIsDreaming] = useState(false)
  const [imageUrl, setImageUrl] = useState('')

  const [guideState, setGuideState] = useState<GuideState>('default')

  if (!API_KEY) {
    return (
      <AlertBox
        title="Missing API Key"
        text="An API key from https://beta.dreamstudio.ai/ is needed to dream; add it to your web/.env.local"
      />
    )
  }

  const dreamHandler = async () => {
    setIsDreaming(true)
    const data = {
      prompt: input + ', ' + MODIFIERS,
      apiKey: API_KEY,
    }
    const response = await fetch(`/api/v0/dream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json()
    setImageUrl(json.url)
    setIsDreaming(false)
  }
  async function dream() {
    setIsDreaming(true)
    const data = {
      prompt: input,
      apiKey: API_KEY,
    }
    const response = await fetch(`/api/v0/dream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await response.json()
    setImageUrl(json.url)
    setIsDreaming(false)
  }
  const renderGuideState = () => {
    switch (guideState) {
      case 'default':
        return (
          <>
            <p className="text-md  text-gray-400">
              Not sure? Go through a guided flow
            </p>
            <div className="mt-2 flex flex-col gap-4 px-4">
              <Button
                color="blue"
                className="whitespace-nowrap"
                onClick={() => setGuideState('description')}
                loading={false}
              >
                Guide
              </Button>
            </div>
          </>
        )
      case 'description':
        return (
          <GuidedScreenOne
            onNext={(s: string) => {
              setGuideState('modifiers')
              setInput(s)
            }}
          />
        )
      case 'modifiers':
        return (
          <GuidedModifierScreen
            onNext={(mods: string) => {
              setGuideState('style')
              mods && setInput((input) => `${input}, ${mods}`)
            }}
          />
        )
      case 'style':
        return (
          <GuidedStyleScreen
            onNext={(style: string) => {
              setGuideState('completed')
              style && setInput((input) => `${input}, in the style of ${style}`)
              dream()
            }}
          />
        )
      case 'completed':
        return (
          <>
            <div className="flex flex-row ">
              <div className="text-md  flex flex-col justify-center text-gray-400">
                Nice! Press Create or go through another guided flow
              </div>
              <div className="mt-2 flex  flex-col justify-center gap-4 px-4">
                <Button
                  color="blue"
                  className="whitespace-nowrap"
                  onClick={() => {
                    setGuideState('description')
                    setInput('')
                    setImageUrl('')
                  }}
                  loading={false}
                >
                  Restart
                </Button>
              </div>
            </div>
          </>
        )
    }
  }

  const randomElement = (list: any[]) => {
    return list[Math.floor(Math.random() * list.length)]
  }
  const generateRandom = () => {
    const element = randomElement(WHAT_TO_MAKE)
    const modifiers = Array.from(Array(3).keys()).map(() =>
      randomElement(MODIFIERS_PILLS)
    )
    const styleOf = randomElement(STYLE_PILLS)
    setInput(`${element}, ${modifiers.join(', ')}, in the style of ${styleOf}`)
  }
  const imageCode = `<img src="${imageUrl}" alt="${input}" />`
  return (
    <Col className="gap-2 rounded bg-white p-12">
      <p className="pt-2 text-lg text-gray-400">Welcome to Dream</p>
      <div className="pt-2">
        <label className="text-sm text-gray-400">Your Prompt</label>
        <div className="flex flex-row gap-2">
          <div className="flex flex-col justify-center">
            <Button
              color="green"
              className="h-8 whitespace-nowrap"
              onClick={generateRandom}
              loading={false}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
            </Button>
          </div>
          <textarea
            autoFocus
            name="embed"
            id="embed"
            className="mt-1  block w-full rounded-md border-gray-300 shadow-sm placeholder:text-gray-300 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            placeholder="A crane playing poker on a green table"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
          />
          <div className="flex flex-col justify-center">
            <Button
              color="indigo"
              className=" whitespace-nowrap"
              onClick={dream}
              loading={isDreaming}
            >
              Dream
            </Button>
          </div>
        </div>
        <div className="mt-4 px-4"></div>
      </div>
      <div className="inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-gray-500" />
      </div>
      {renderGuideState()}

      {imageUrl && (
        <>
          <img src={imageUrl} alt="Image" />
          <Row className="gap-2">
            <Button
              disabled={isDreaming}
              onClick={() => {
                if (editor) {
                  editor.chain().insertContent(imageCode).run()
                  setInput('')
                  setOpen(false)
                }
              }}
            >
              Add image
            </Button>
            <Button
              color="gray"
              onClick={() => {
                setImageUrl('')
              }}
            >
              Cancel
            </Button>
          </Row>
        </>
      )}
    </Col>
  )
}

const WHAT_TO_MAKE = [
  'koala eating an ice cream',
  'smiling chocolate cookie',
  'black hole bowl of soup',
]

const GuidedScreenOne = ({ onNext }: { onNext: (prompt: string) => void }) => {
  const [whatToMake, setWhatToMake] = useState('')
  return (
    <div className="flex flex-col justify-start">
      <p className="text-md mt-2  text-gray-400">What do you want to make?</p>
      <div className="mt-2 flex flex-col gap-4 px-4">
        <input
          type="text"
          className="w-full placeholder:text-gray-300"
          placeholder="two ferrets fighting with swords"
          value={whatToMake}
          onChange={(e) => setWhatToMake(e.target.value)}
        ></input>
      </div>
      <div className="mx-4 mt-2 flex flex-row items-center gap-4 pt-3 ">
        {WHAT_TO_MAKE.map((prompt) => (
          <Button onClick={() => setWhatToMake(prompt)} color="green">
            {prompt}
          </Button>
        ))}
      </div>
      <Button
        color="blue"
        className="mx-4 mt-6 whitespace-nowrap"
        onClick={() => onNext(whatToMake)}
        loading={false}
      >
        Next
      </Button>
    </div>
  )
}

const MODIFIERS_PILLS = [
  '8k',
  'beautiful',
  'artstation',
  'sharp',
  'focus',
  'digital',
  'painting',
  '3D render',
  'detailed',
  'illustration',
  'epic',
  'fantasy',
  'intrinsic',
  'intricate',
  'smooth',
  'concept art',
  'octane',
  'elegant',
  'cgsociety',
  'realistic',
]

const GuidedModifierScreen = ({
  onNext,
}: {
  onNext: (prompt: string) => void
}) => {
  const [current, setCurrent] = useState<string[]>([])

  return (
    <div className="flex flex-col justify-start">
      <p className="text-md mt-2  text-gray-400">Select your modifiers</p>
      <div className="flex flex-wrap gap-2">
        {current.map((modifier) => (
          <div className="mt-2 flex justify-center">
            <PillButton
              className="bg-yellow-300 hover:bg-yellow-500"
              selected={false}
              onSelect={() =>
                setCurrent((current) => current.filter((e) => e !== modifier))
              }
            >
              <div className="flex flex-row gap-2">
                <div className="flex flex-col justify-center">
                  <XIcon className="h-3" />
                </div>
                {modifier}
              </div>
            </PillButton>
          </div>
        ))}
      </div>

      <div className="inset-0 flex items-center pt-8" aria-hidden="true">
        <div className="w-full border-t border-gray-300" />
      </div>
      <div className="mt-2 flex flex-col gap-4 px-4"></div>
      <div className="item-center mx-4 mt-2 grid grid-cols-5 pt-3 ">
        {MODIFIERS_PILLS.map((modifier) => (
          <div className="col-span-1 mt-2 flex justify-center">
            <PillButton
              selected={current.includes(modifier)}
              onSelect={() => {
                if (!current.includes(modifier)) {
                  setCurrent((current) => current.concat([modifier]))
                }
              }}
            >
              {modifier}
            </PillButton>
          </div>
        ))}
      </div>
      <Button
        color="blue"
        className="mx-4 mt-6 whitespace-nowrap"
        onClick={() => onNext(current.join(', '))}
        loading={false}
      >
        Next
      </Button>
    </div>
  )
}

const STYLE_PILLS = ['picasso', 'greg']

const GuidedStyleScreen = ({
  onNext,
}: {
  onNext: (prompt: string) => void
}) => {
  const [current, setCurrent] = useState<string>('')

  return (
    <div className="flex flex-col justify-start">
      <p className="text-md mt-2  text-gray-400">In the style of...</p>

      <div className="mt-2 flex flex-col gap-4 px-4"></div>
      <div className="item-center mx-4 mt-2 grid grid-cols-5 pt-3 ">
        {STYLE_PILLS.map((style) => (
          <div className="col-span-1 mt-2 flex justify-center">
            <PillButton
              selected={current === style}
              onSelect={() => {
                if (current !== style) {
                  setCurrent(style)
                }
              }}
            >
              {style}
            </PillButton>
          </div>
        ))}
      </div>
      <Button
        color="indigo"
        className="mx-4 mt-6 whitespace-nowrap"
        onClick={() => onNext(current)}
        loading={false}
      >
        Dream
      </Button>
    </div>
  )
}

export default DreamModalV2Container
