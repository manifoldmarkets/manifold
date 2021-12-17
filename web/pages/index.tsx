import React from 'react'
import {
  LightningBoltIcon,
  ScaleIcon,
  UserCircleIcon,
  BeakerIcon,
} from '@heroicons/react/outline'

import type { NextPage } from 'next'

import { Hero } from '../components/hero'
import { useUser } from '../hooks/use-user'
import Markets from './markets'
import { useContracts } from '../hooks/use-contracts'
import { SearchableGrid } from '../components/contracts-list'
import { Col } from '../components/layout/col'

const Home: NextPage = () => {
  const user = useUser()

  if (user === undefined) return <></>
  return user ? <Markets /> : <LandingPage />
}

function LandingPage() {
  return (
    <div>
      <Hero />
      <FeaturesSection />
      <ExploreMarketsSection />
    </div>
  )
}

const notionAboutUrl =
  'https://mantic.notion.site/About-Mantic-Markets-7c44bc161356474cad54cba2d2973fe2'

function FeaturesSection() {
  const features = [
    {
      name: 'Easy to participate',
      description: 'Sign up for free and make your own predictions in seconds!',
      icon: UserCircleIcon,
    },
    {
      name: 'Play money, real results',
      description:
        'Get accurate predictions by betting with Mantic Dollars, our virtual currency.',
      icon: LightningBoltIcon,
    },
    {
      name: 'Creator-driven markets',
      description:
        'Resolve markets you create with your own judgment—enabling new markets with subjective or personal questions',
      icon: ScaleIcon,
    },
    {
      name: 'Become smarter',
      description:
        'Bet on questions that matter and share the forecasts. With better information, we can all make better decisions.',
      icon: BeakerIcon,
    },
  ]

  return (
    <div id="about" className="w-full py-16 bg-green-50">
      <div className="max-w-4xl py-12 mx-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-teal-600 font-semibold tracking-wide uppercase">
              Mantic Markets
            </h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Better forecasting for everyone
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              The easiest way to get an accurate forecast on anything
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
              {features.map((feature) => (
                <div key={feature.name} className="relative">
                  <dt>
                    <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-teal-500 text-white">
                      <feature.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p className="ml-16 text-lg leading-6 font-medium text-gray-900">
                      {feature.name}
                    </p>
                  </dt>
                  <dd className="mt-2 ml-16 text-base text-gray-500">
                    {feature.description}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <Col className="mt-20">
          <a
            className="btn btn-primary mx-auto"
            href={notionAboutUrl}
            target="_blank"
          >
            Learn more
          </a>
        </Col>
      </div>
    </div>
  )
}

function ExploreMarketsSection() {
  const contracts = useContracts()

  return (
    <div className="max-w-4xl py-8 mx-auto">
      <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-indigo-700 sm:text-4xl">
        Explore our markets
      </p>
      <SearchableGrid contracts={contracts === 'loading' ? [] : contracts} />
    </div>
  )
}

export default Home
