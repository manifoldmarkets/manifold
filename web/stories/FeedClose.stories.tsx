import React from 'react'
import { ComponentStory, ComponentMeta } from '@storybook/react'

import { FeedClose } from './FeedClose'

export default {
  title: 'Example/FeedClose',
  component: FeedClose,
  parameters: {
    // More on Story layout: https://storybook.js.org/docs/react/configure/story-layout
    layout: 'fullscreen',
  },
} as ComponentMeta<typeof FeedClose>

const Template: ComponentStory<typeof FeedClose> = (args) => (
  <FeedClose {...args} />
)

export const LoggedIn = Template.bind({})
LoggedIn.args = {
  contract: {
    id: '9jvisdkf',
    slug: '1234-3123-14hfk',
    closeTime: 1598486400000,
  },
}

// export const LoggedOut = Template.bind({})
// LoggedOut.args = {}
