import { ConvertKitEmailForm } from './convert-kit-email-form'
import { Header } from './header'

export const Hero = () => {
  return (
    <div className="relative overflow-hidden h-screen bg-world-trading bg-cover bg-gray-900 bg-center lg:bg-left">
      <Header darkBackground />
      <main>
        <div className="pt-40 sm:pt-16 lg:pt-8 lg:pb-14 lg:overflow-hidden">
          <div className="mx-auto max-w-7xl lg:px-8">
            <div className="lg:grid lg:grid-cols-2 lg:gap-8">
              <div className="mx-auto max-w-md px-4 sm:max-w-2xl sm:px-6 sm:text-center lg:px-0 lg:text-left lg:flex lg:items-center">
                <div className="lg:py-24">
                  <h1 className="mt-4 text-4xl text-white sm:mt-5 sm:text-6xl lg:mt-6 xl:text-6xl">
                    <div className="mb-2">Create your own</div>
                    <div className="text-green-400 font-bold">
                      prediction markets
                    </div>
                  </h1>
                  <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                    Better forecasting through play-money prediction markets for
                    you and your community
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
