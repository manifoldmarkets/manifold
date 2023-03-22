import React, { useState } from 'react'

import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'

export function TopicSelectorDialog(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props

  const user = useUser()

  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>(
    undefined
  )

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="bg-canvas-0 h-[32rem] rounded-md px-8 py-6 text-sm font-light md:text-lg">
        <Title children="What interests you?" />
        <p className="mb-4">
          Select a few topics you're interested in to personalize your Manifold
          experience.
        </p>

        <div className="scrollbar-hide h-full items-start overflow-x-auto">
          {Object.keys(TOPICS).map((topic) => (
            <PillButton
              key={topic}
              selected={selectedTopics.includes(topic)}
              onSelect={() => {
                const groupId = GROUP_IDs[topic]

                if (selectedTopics.includes(topic)) {
                  setSelectedTopic(undefined)
                  setSelectedTopics(
                    selectedTopics.filter(
                      (t) => t !== topic && !TOPICS[topic].includes(t)
                    )
                  )
                  if (groupId && user) leaveGroup(groupId, user.id)
                } else {
                  setSelectedTopic(topic)
                  setSelectedTopics([...selectedTopics, topic])
                  if (groupId && user) joinGroup(groupId, user.id)
                }
              }}
              className="mr-1 mb-2 max-w-[12rem] truncate"
            >
              {topic}
            </PillButton>
          ))}

          {selectedTopic && (
            <>
              <div key="divider">
                <hr />
                <br />
                <div className="mb-2 text-sm">
                  {selectedTopic === 'Communities'
                    ? 'Communities on Manifold'
                    : `More from ${selectedTopic}`}
                </div>
              </div>
              <div className="ml-4">
                {TOPICS[selectedTopic].map((subtopic) => (
                  <PillButton
                    key={subtopic}
                    selected={selectedTopics.includes(subtopic)}
                    onSelect={() => {
                      const groupId = GROUP_IDs[subtopic]

                      if (selectedTopics.includes(subtopic)) {
                        setSelectedTopics(
                          selectedTopics.filter((t) => t !== subtopic)
                        )
                        if (groupId && user) leaveGroup(groupId, user.id)
                      } else {
                        setSelectedTopics([...selectedTopics, subtopic])
                        if (groupId && user) joinGroup(groupId, user.id)
                      }
                    }}
                    xs
                    className="mr-1 mb-2 max-w-[12rem] truncate"
                  >
                    {subtopic}
                  </PillButton>
                ))}
              </div>
            </>
          )}
        </div>

        <Row className={'justify-end'}>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </Row>
      </Col>
    </Modal>
  )
}

const TOPICS: { [key: string]: string[] } = {
  Politics: [
    '2024 US Presidential election',
    'Local elections',
    'Public policy',
  ],
  Sports: ['Football', 'Basketball', 'Baseball', 'Soccer', 'Cricket', 'Tennis'],
  Business: ['Finance', 'Economics', 'Startups'],
  Technology: [
    'AI',
    'Crypto',
    'Climate',
    'Health',
    'Biotech',
    'Programming',
    'Science',
    'Engineering',
    'Math',
    'Nuclear',
    'Space',
  ],
  Entertainment: [
    'Movies',
    'TV',
    'Gaming',
    'Music',
    'Books',
    'Internet culture',
    'Art',
    'Celebrities',
  ],
  World: [
    'Russia / Ukraine',
    'China',
    'India',
    'Africa',
    'Asia',
    'Europe',
    'Latin America',
    'Middle East',
  ],
  Communities: ['ACX', 'Effective Altruism', 'Destiny.gg', 'Proofniks'],
}

const GROUP_IDs: { [key: string]: string } = {
  Politics: 'UCnpxVUdLOZYgoMsDlHD',
  Technology: 'IlzY3moWwOcpsVZXCVej',
  Science: 'XMhZ5LbQoLMZiOpQJRnj',
  World: '5mzNYaPKc4qXC5J0npKe',
  Culture: 'eJZecx6r22G2NriYYXcC',
  Sports: '2hGlgVhIyvVaFyQAREPi',
  'Destiny.gg': 'W2ES30fRo6CCbPNwMTTj',
  'Destiny.gg Stocks': 'jhtvaP3PHXY6RPIiMd8A',
  AI: 'yEWvvwFFIqzf8JklMewp',
  'Daliban HQ': 'PWkFsf1QCAH2lCTzuGBA',
  Gaming: '5FaFmmaNNFTSA5r0vTAi',
  '2024 US Presidential Election': 'rr3rBJMwh9PW8hwrgR4J',
  'Effective Altruism': 'znYsWa9eZRkBvSHwmaNz',
  Fun: 'bBwafyeaiuwWwobwm2c4',
  'Technical AI Timelines': 'GbbX9U5pYnDeftX9lxUh',
  Internet: 'raDuDKuBOp5D9l7301XV',
  Space: 'SmJk6RHToaLxLk0I1ZSC',
  Manifold: 'hzyCW27Hf9NzuXZRizeZ',
  Ukraine: '0AKCBNjWsHwpfmPOsGf6',
  Crypto: 'YuJw0M1xvUHrpiRRuKso',
  'Nuclear Risk': '1GU6aOGwXCt8dUSG9sX0',
  Wars: 'B71vip8fPvi3c64vSWUz',
  'Musk Mania': 'VuNEwPCQf3RhCHSurkMh',
  Twitter: 'Y8DDxYXrqOlQFv5AsilH',
  China: 'oWTzfoeemQGkSoPFn2T7',
  Programming: 'PZJMbrLekgJBy7OOBKGT',
  Math: 'S1tbcVt1t5Bd9O5mVCx1',
  'AI Safety': 'DnxTZ1P5XEEfnHxy7Q7d',
  'Predictions on Predictions': 'qV4UN8VsCFzmchCqdVFK',
  'AI Impacts': 'q3Su0NeV9ta4DqhqlIEq',
  'Wall Street Bets': '8Gu77XZbp4YnYEhLkOKm',
  Russia: 'TIpf6j0hLpifpXN93FxE',
  'Entertainment and Pop Culture': 'XU1fOYURSnb58lgsqaly',
  'AI Alignment ': 'p8Tmu38lHhN1JQavwAmR',
  'Sex and love': '3syjPCC7PxE5KurTiTT3',
  'Permanent Markets': '2T4mM0N5az2lYcaN5G50',
  'LGBTQIA+': 'cLtLfm3NSrhXU6lV6Cuy',
  'MAGA-land': 'EWgcYV1JYWP19dE3BZCb',
  'Global Macro': 'ToJoQmyIyv0ZTSEW96Li',
  'UK politics': 'aavkiDd6uZggfL3geuV2',
  Finance: 'CgB83AAMkkOHSrTnzani',
  '2022 FIFA World Cup': 'ujdSUUHAKLNPFSj2PTNX',
  Proofniks: 'HWg8Z5SraHRjoEjHCcIJ',
  ACX: 'UCM2uiHxr7Rftaa1KB29',
  'FTX Insolvency Crisis': 'DwXE6sNMFQ8hnEq1afHh',
  'Elon musk': '9OR5MrEu1F01FhmBRcre',
  Health: 'JpUqUqRn9sSWxrk0Sq35',
  'Self-resolving': '9cUlgUS6fDN3LIyavEam',
  'Philosophy (+Updating Beliefs?)': 'k5dp7h33O46hKqTGyKM9',
  'Whistleblower Markets': 'qHo4qLNyY6bkcoS7hZe0',
  'Law & Order': '9JiXkg8yBFMmO4NwCW44',
  Soccer: 'ypd6vR44ZzJyN9xykx6e',
  'Crypto Prices': 'Hh2zJJExWlyJQakffoVE',
  'Russia / Ukraine': 'OxcXOuxXvwsXtC0Dx5sr',
  Climate: '97oNExy8iFftY2EgdkLw',
  'Meta-Forecasting': 'aWVjDvevw8dDKKbURvgx',
  'Presidential Politics': 'Yt3YwuicgIdqV0TB8EFe',
  Covid: 'iGfuM2jmlUwyQVMGyDbi',
  Business: 'pmK8sntWL1SDkMm53UBR',
  Books: 'o3T3Wvaoqw90dns1Q7nU',
  Music: 'Xuc2UY8gGfjQqFXwxq5d',
  'Physics Forecasting': '0JWy5mbK5ML8EUh5NA3z',
  'US 2022 Midterms': 'y2e0hHBab86vdAkUJx9w',
  Dating: 'j3ZE8fkeqiKmRGumy3O1',
  Stocks: 'QDQfgsFiQrNNlZhsRGf5',
  Glowfic: '2VsVVFGhKtIdJnQRAXVb',
  'US 2022 Elections': 'MQJlM8CKTiJHD3HcyW0C',
  'Medicine ': 'oHiQ4mneKC2r5ICg4XJ8',
  Nintendo: 'RP9YmNIFe88Grg68Ivp2',
  'Trans Questions': 'g9uOjtMhLBdzSCfU25xV',
  Experimental: 'GAn872bm0J8FT8pNYtyq',
  FTX: '0YV8Cv4WhFWcbUrk4hHV',
  'Whale Watching': '5V0GjAyN99OQpb96fwo8',
  Futurism: '6UkuV4SnUF3NtbDmfVkV',
  Football: 'Vcf6CYTTSXAiStbKSqQq',
  Gambling: 'PqwKmXzv3O7b1ICBAZ4H',
  '118th Congress': 'tO4QDTtyRZabZeGGiUJg',
  'Change My Mind': 'kzzraVgQ4jzw7XmLUZDv',
  Movies: 'KSeNIu7AWgiBBM5FqVuB',
  'Derivative Markets': '9qGjaJrSyTvLCZ2KcJ1m',
  'Interest Rates': 'NQRP4KzZgRzwssnVKlp9',
  Chess: 'ED7Cu6lVPshJkZ7FYePW',
  '🏈 FFSX (Fantasy Football Stock Exchange) 📈📉 ': 'SxGRqXRpV3RAQKudbcNb',
  'Oscars 2023': 'THBPkY1hBc2LRpoFYi6f',
  'Clearer Thinking Regrants': 'fhksfIgqyWf7OxsV9nkM',
  'Magic: The Gathering': 'MdtQjq1MZ1T3zBP1QqMF',
  Europe: 'ue52QI4BQgJgAJJNjLHr',
  'CART Contest': 'K86LmEmidMKdyCHdHNv4',
  Brazil: 'ZQt0sCK1Hxn0HVJhH108',
  California: '72sPPf5PTwnQQWGdZ5cR',
  Germany: '0egO7eYCaC5HnLwGN8tR',
  'Who does Xi think he is?': 'GPloP7NvYNOoTpTWZhpJ',
  FairlyRandom: 'J8Z1KAZV31icklA4tgJW',
  YouTube: 'bbIsp5bNcwHpSK9qu9mj',
  Vaush: 'cwTgBqyCE2jc7IFwpV73',
  'San Francisco': '77nEsKGsORflUYGveLSX',
  Polymarket: 'yeQpbHOQhxPyQifhmJrY',
  'Non-Predictive Profits': 'sVCyD10FvUk5af10QT6H',
  SBF: 'svyYtbhviU1lv8aMS9E1',
  'GPT-4 speculation': 'SWiC5KtQnc48oWmaoAZA',
}
