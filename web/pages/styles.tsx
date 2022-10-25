import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'

export default function StylePage() {
  return (
    <Page>
      <Title>Design System</Title>
      <div>
        A reference for all the common widgets we use on our site. For instance,
        the component above is <code>Title</code>.
      </div>
      <h2 className="mt-6 mb-4 text-2xl text-indigo-700">Buttons</h2>
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
    </Page>
  )
}
