type Contest = {
  link: string
  description: string
  submissionLink: string
  fileName: string
  closeTime: string
}

export const CONTEST_DATA: { [name: string]: Contest } = {}

CONTEST_DATA['cause-exploration-prize'] = {
  link: 'https://www.causeexplorationprizes.com/',
  description:
    'Open Philanthropy’s contest to find ideas for the best ways to use their resources, with focus on new areas to support, health development, and worldview investigations.',
  submissionLink:
    'https://forum.effectivealtruism.org/topics/cause-exploration-prizes',
  //name of file that stores json of submissions under lib/util/contests
  fileName: 'causeExploration',
  closeTime: '2022-09-01',
}

export const CONTEST_SLUGS = Object.keys(CONTEST_DATA)
