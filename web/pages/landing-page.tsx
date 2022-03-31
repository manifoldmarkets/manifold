import React from 'react'
import {
  LightningBoltIcon,
  ScaleIcon,
  UserCircleIcon,
  BeakerIcon,
  ArrowDownIcon,
} from '@heroicons/react/outline'

import { firebaseLogin } from '../lib/firebase/users'
import { ContractsGrid } from '../components/contracts-list'
import { Col } from '../components/layout/col'
import { NavBar } from '../components/nav/nav-bar'
import Link from 'next/link'
import { Contract } from '../lib/firebase/contracts'

export default function LandingPage(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  return (
    <div>
      <Hero />
      <FeaturesSection />
      <ExploreMarketsSection hotContracts={hotContracts} />
    </div>
  )
}

const scrollToAbout = () => {
  const aboutElem = document.getElementById('about')
  window.scrollTo({ top: aboutElem?.offsetTop, behavior: 'smooth' })
}

function Hero() {
  return (
    <div className="bg-world-trading h-screen overflow-hidden bg-gray-900 bg-cover bg-center lg:bg-left">
      <NavBar darkBackground />
      <main>
        <div className="pt-32 sm:pt-8 lg:overflow-hidden lg:pt-0 lg:pb-14">
          <div className="mx-auto max-w-7xl lg:px-8 xl:px-0">
            <div className="lg:grid lg:grid-cols-2 lg:gap-8">
              <div className="mx-auto max-w-md px-8 sm:max-w-2xl sm:text-center lg:flex lg:items-center lg:px-0 lg:text-left">
                <div className="lg:py-24">
                  <h1 className="mt-4 text-4xl text-white sm:mt-5 sm:text-6xl lg:mt-6 xl:text-6xl">
                    <div className="mb-2">Create your own</div>
                    <div className="bg-gradient-to-r from-teal-300 to-green-400 bg-clip-text font-bold text-transparent">
                      prediction markets
                    </div>
                  </h1>
                  <p className="mt-3 text-base text-white sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                    Better forecasting through accessible prediction markets
                    <br />
                    for you and your community
                  </p>
                  <div className="mt-10 sm:mt-12">
                    <button
                      className="btn bg-gradient-to-r from-teal-500 to-green-500 px-10 text-lg font-medium normal-case hover:from-teal-600 hover:to-green-600"
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
              className="mx-auto animate-bounce cursor-pointer text-white"
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
        'Get accurate predictions by betting with Manifold Dollars, our virtual currency.',
      icon: LightningBoltIcon,
    },
    {
      name: 'Creator-driven markets',
      description:
        'Resolve markets you create with your own judgment—enabling new markets with subjective or personal questions.',
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
    <div id="about" className="w-full bg-green-50 py-16">
      <div className="mx-auto max-w-4xl py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base font-semibold uppercase tracking-wide text-teal-600">
              Manifold Markets
            </h2>
            <p className="mt-2 text-3xl font-extrabold leading-8 tracking-tight text-gray-900 sm:text-4xl">
              Better forecasting for everyone
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 lg:mx-auto">
              The easiest way to get an accurate forecast on anything
            </p>
          </div>

          <div className="mt-10">
            <dl className="space-y-10 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10 md:space-y-0">
              {features.map((feature) => (
                <div key={feature.name} className="relative">
                  <dt>
                    <div className="absolute flex h-12 w-12 items-center justify-center rounded-md bg-teal-500 text-white">
                      <feature.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p className="ml-16 text-lg font-medium leading-6 text-gray-900">
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
          <Link href="/about">
            <a className="btn btn-primary mx-auto">Learn more</a>
          </Link>
        </Col>
      </div>
    </div>
  )
}

function ExploreMarketsSection(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="my-12 text-3xl font-extrabold leading-8 tracking-tight text-indigo-700 sm:text-4xl">
        Today's top markets
      </p>

      <ContractsGrid contracts={hotContracts} />
    </div>
  )
}
