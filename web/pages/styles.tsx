import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { Page } from 'web/components/layout/page'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
import { NumberInput } from 'web/components/widgets/number-input'
import { Select } from 'web/components/widgets/select'
import ShortToggle from 'web/components/widgets/short-toggle'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'

export default function StylePage() {
  return (
    <Page>
      <Title>Design System</Title>
      <div>
        A reference for all the common widgets we use on our site. For instance,
        the component above is <code>Title</code>.
      </div>
      <Subtitle>Buttons</Subtitle>
      <ButtonSection />
      <Subtitle>Toggles</Subtitle>
      <ToggleSection />
      <Subtitle>Inputs</Subtitle>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Input" />
        <Input disabled placeholder="Input disabled=true" />
        <Input error placeholder="Input error=true" />
        <NumberInput onChange={() => {}} placeholder="NumberInput" />
      </div>
      <ExpandingInput
        className="mb-4 w-full"
        placeholder="ExpandingInput (try typing a lot)"
      />
      <EditorExample />
      <Subtitle>Copy Link</Subtitle>
      <CopyLinkButton
        url="www.example.com"
        eventTrackingName={'copy styles link'}
      />
    </Page>
  )
}

function ButtonSection() {
  const [disabled, setDisabled] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button disabled={disabled} loading={loading}>
          indigo
        </Button>
        <Button disabled={disabled} loading={loading} color="indigo-outline">
          indigo-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="gradient">
          gradient
        </Button>
        <Button disabled={disabled} loading={loading} color="gradient-pink">
          gradient-pink
        </Button>
        <Button disabled={disabled} loading={loading} color="blue">
          blue
        </Button>
        <Button disabled={disabled} loading={loading} color="dark-gray">
          dark-gray
        </Button>
        <Button disabled={disabled} loading={loading} color="gray">
          gray
        </Button>
        <Button disabled={disabled} loading={loading} color="gray-outline">
          gray-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="gray-white">
          gray-white
        </Button>
        <Button disabled={disabled} loading={loading} color="green">
          green
        </Button>
        <Button disabled={disabled} loading={loading} color="green-outline">
          green-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="yellow">
          yellow
        </Button>
        <Button disabled={disabled} loading={loading} color="yellow-outline">
          yellow-outline
        </Button>
        <Button disabled={disabled} loading={loading} color="red">
          red
        </Button>
        <Button disabled={disabled} loading={loading} color="red-outline">
          red-outline
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button disabled={disabled} loading={loading} size="2xs">
          2xs
        </Button>
        <Button disabled={disabled} loading={loading} size="xs">
          xs
        </Button>
        <Button disabled={disabled} loading={loading} size="sm">
          sm
        </Button>
        <Button disabled={disabled} loading={loading}>
          md
        </Button>
        <Button disabled={disabled} loading={loading} size="lg">
          lg
        </Button>
        <Button disabled={disabled} loading={loading} size="xl">
          xl
        </Button>
        <Button disabled={disabled} loading={loading} size="2xl">
          2xl
        </Button>
      </div>
      <div className="text-ink-600 flex gap-4">
        <label className="flex items-center gap-2">
          Disable
          <ShortToggle on={disabled} setOn={setDisabled} />
        </label>
        <label className="flex items-center gap-2">
          Loading
          <ShortToggle on={loading} setOn={setLoading} />
        </label>
      </div>
    </>
  )
}

function ToggleSection() {
  const [on, setOn] = useState(false)
  const [choice, setChoice] = useState('TRINARY')
  const [color, setColor] = useState('indigo-dark')
  const [disabled, setDisabled] = useState(false)

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        ShortToggle
        <ShortToggle on={on} setOn={setOn} disabled={disabled} />
      </label>
      <div className="flex items-center gap-2">
        ChoicesToggleGroup
        <ChoicesToggleGroup
          currentChoice={choice}
          disabled={disabled}
          color={color as any}
          setChoice={setChoice as any}
          choicesMap={{
            'YES / NO / IDK ': 'TRINARY',
            'Single choice': 'FPTP',
            'Deluxe response': 'CERT',
            Perpetual: 'SUDO_NUMERIC',
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        Select (native)
        <Select
          value={color}
          onChange={(e) => setColor(e.target.value)}
          disabled={disabled}
        >
          <option>indigo-dark</option>
          <option>indigo</option>
          <option>red</option>
          <option>green</option>
        </Select>
      </div>
      <label className="text-ink-600 flex items-center gap-2">
        Disable
        <ShortToggle on={disabled} setOn={setDisabled} />
      </label>
    </div>
  )
}

function EditorExample() {
  const editor = useTextEditor({
    defaultValue: '<p>Rich text editor from <code>editor.tsx</code></p>',
  })
  return <TextEditor editor={editor} />
}
