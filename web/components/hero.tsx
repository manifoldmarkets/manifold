import { Popover } from '@headlessui/react'
import { ConvertKitEmailForm } from './convert-kit-email-form'

const navigation = [
	{ name: 'About', href: '#' },
	{ name: 'Simulator', href: 'https://simulator.mantic.markets' },
  ]

export const Hero = () => {
  return (
    <div className="relative overflow-hidden h-screen bg-world-trading bg-cover">
	  {/* <div className="absolute w-full h-full overflow-hidden bg-world-trading bg-cover bg-gray-900 z--1" /> */}

      <Popover as="header" className="relative">
        <div className="pt-6">
          <nav
            className="relative max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6"
            aria-label="Global"
          >
            <div className="flex items-center flex-1">
              <div className="flex items-center justify-between w-full md:w-auto">
                <a href="#">
                  <span className="sr-only">Mantic Markets</span>
                  <img
                    className="h-8 w-auto sm:h-10"
                    src="/logo.png"
                    alt=""
                  />
                </a>
              </div>
              <div className="hidden space-x-8 md:flex md:ml-10">
                {navigation.map((item) => (
                  <a key={item.name} href={item.href} className="text-base font-medium text-white hover:text-gray-300">
                    {item.name}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        </div>
      </Popover>

      <main>
        <div className="pt-10 sm:pt-16 lg:pt-8 lg:pb-14 lg:overflow-hidden">
          <div className="mx-auto max-w-7xl lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-8">
              <div className="mx-auto max-w-md px-4 sm:max-w-2xl sm:px-6 sm:text-center lg:px-0 lg:text-left lg:flex lg:items-center">
                <div className="lg:py-24">
                  <h1 className="mt-4 text-4xl tracking-tight font-extrabold text-white sm:mt-5 sm:text-6xl lg:mt-6 xl:text-6xl">
                    <span className="block">Create your own</span>
                    <span className="block text-green-400">prediction markets</span>
                  </h1>
                  <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
					  Create and resolve your own prediction markets to earn a percent of the bet volume. Powered by Solana.
                  </p>
                  <div className="mt-10 sm:mt-12">
					<ConvertKitEmailForm /> 
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

    </div>
  )
}