import React from 'react'
import {
  LightningBoltIcon,
  ScaleIcon,
  UserCircleIcon,
  BeakerIcon,
  ArrowDownIcon,
} from '@heroicons/react/outline'

import { firebaseLogin } from '../lib/firebase/users'
import { useContracts } from '../hooks/use-contracts'
import { SearchableGrid } from '../components/contracts-list'
import { Col } from '../components/layout/col'
import { Header } from '../components/header'

export default function LandingPage() {
  return (
    <div>
      <Hero />
      <FeaturesSection />
      <ExploreMarketsSection />
    </div>
  )
}

function Hero() {
  const scrollToAbout = () => {
    const aboutElem = document.getElementById('about')
    window.scrollTo({ top: aboutElem?.offsetTop, behavior: 'smooth' })
  }

  return (
    <div className="overflow-hidden h-screen bg-world-trading bg-cover bg-gray-900 bg-center lg:bg-left">
      <Header darkBackground>
        <div
          className="text-base font-medium text-white cursor-pointer hover:underline hover:decoration-teal-500 hover:decoration-2"
          onClick={scrollToAbout}
        >
          About
        </div>
      </Header>
      <main>
        <div className="pt-40 sm:pt-16 lg:pt-8 lg:pb-14 lg:overflow-hidden">
          <div className="mx-auto max-w-7xl lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-8">
              <div className="mx-auto max-w-md px-8 sm:max-w-2xl sm:text-center lg:px-0 lg:text-left lg:flex lg:items-center">
                <div className="lg:py-24">
                  <h1 className="mt-4 text-4xl text-white sm:mt-5 sm:text-6xl lg:mt-6 xl:text-6xl">
                    <div className="mb-2">Create your own</div>
                    <div className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-green-400">
                      prediction markets
                    </div>
                  </h1>
                  <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                    Better forecasting through accessible prediction markets
                    <br />
                    for you and your community
                  </p>
                  <div className="mt-10 sm:mt-12">
                    <button
                      className="btn normal-case text-lg font-medium px-10 bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600"
                      onClick={firebaseLogin}
                    >
                      Sign in to get started!
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-12 w-full">
            <ArrowDownIcon
              className="text-white mx-auto cursor-pointer animate-bounce"
              width={32}
              height={32}
              onClick={scrollToAbout}
            />
          </div>
        </div>
      </main>
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
