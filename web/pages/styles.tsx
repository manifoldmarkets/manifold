import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Input } from 'web/components/widgets/input'
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
      <div className="mb-4 flex flex-wrap gap-2">
        <Button>indigo</Button>
        <Button color="gradient">gradient</Button>
        <Button color="blue">blue</Button>
        <Button color="gray">gray</Button>
        <Button color="gray-outline">gray-outline</Button>
        <Button color="gray-white">gray-white</Button>
        <Button color="green">green</Button>
        <Button color="yellow">yellow</Button>
        <Button color="red">red</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button disabled>indigo</Button>
        <Button disabled color="gradient">
          gradient
        </Button>
        <Button disabled color="blue">
          blue
        </Button>
        <Button disabled color="gray">
          gray
        </Button>
        <Button disabled color="gray-outline">
          gray-outline
        </Button>
        <Button disabled color="gray-white">
          gray-white
        </Button>
        <Button disabled color="green">
          green
        </Button>
        <Button disabled color="yellow">
          yellow
        </Button>
        <Button disabled color="red">
          red
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button size="2xs">2xs</Button>
        <Button size="xs">xs</Button>
        <Button size="sm">sm</Button>
        <Button>md</Button>
        <Button size="lg">lg</Button>
        <Button size="xl">xl</Button>
        <Button size="2xl">2xl</Button>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button loading size="2xs">
          2xs
        </Button>
        <Button loading size="xs">
          xs
        </Button>
        <Button loading size="sm">
          sm
        </Button>
        <Button loading> md</Button>
        <Button loading size="lg">
          lg
        </Button>
        <Button loading size="xl">
          xl
        </Button>
        <Button loading size="2xl">
          2xl
        </Button>
      </div>
      <Subtitle>Toggles</Subtitle>
      <ToggleSection />
      <Subtitle>Inputs</Subtitle>
      TODO: number input
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Input" />
        <Input disabled placeholder="Input disabled=true" />
        <Input error placeholder="Input error=true" />
      </div>
      <ExpandingInput
        className="mb-4 w-full"
        placeholder="ExpandingInput (try typing a lot)"
      />
      <EditorExample />
      <Subtitle>Copy Link</Subtitle>
      <CopyLinkButton url="www.example.com" />
    </Page>
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
      <label className="flex items-center gap-2 text-gray-600">
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
