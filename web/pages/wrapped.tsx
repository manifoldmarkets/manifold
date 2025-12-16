import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useUser } from 'web/hooks/use-user'
import { useMonthlyBets } from 'web/hooks/use-wrapped-2025'
import {
  IntroSlide,
  TotalProfitSlide,
  OutroSlide,
} from 'web/components/wrapped/GeneralStats'
import { MonthlyBets } from 'web/components/wrapped/MonthlyBets'
import { MaxMinProfit } from 'web/components/wrapped/MaxMinProfit'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

// Snowflake component for the background
function Snowfall() {
  const [snowflakes, setSnowflakes] = useState<
    Array<{
      id: number
      left: number
      delay: number
      duration: number
      size: number
      opacity: number
    }>
  >([])

  useEffect(() => {
    setSnowflakes(
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 8 + Math.random() * 12,
        size: 8 + Math.random() * 16,
        opacity: 0.3 + Math.random() * 0.5,
      }))
    )
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <style>{`
        @keyframes snowfall {
          0% {
            transform: translateY(-20px) rotate(0deg);
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
          }
        }
        @keyframes sway {
          0%, 100% {
            margin-left: 0px;
          }
          50% {
            margin-left: 30px;
          }
        }
      `}</style>
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="absolute"
          style={{
            left: `${flake.left}%`,
            top: '-20px',
            fontSize: `${flake.size}px`,
            opacity: flake.opacity,
            animation: `snowfall ${flake.duration}s linear infinite, sway ${
              3 + Math.random() * 2
            }s ease-in-out infinite`,
            animationDelay: `${flake.delay}s`,
          }}
        >
          ❄
        </div>
      ))}
    </div>
  )
}

// Slide types
type SlideType =
  | 'intro'
  | 'totalProfit'
  | 'monthlyBets'
  | 'maxMinProfit'
  | 'outro'

const SLIDES: SlideType[] = [
  'intro',
  'totalProfit',
  'monthlyBets',
  'maxMinProfit',
  'outro',
]

export default function WrappedPage() {
  const router = useRouter()
  const user = useUser()
  const [currentSlide, setCurrentSlide] = useState(0)
  const monthlyBets = useMonthlyBets(user?.id ?? '')

  const goToNextPage = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const goToPrevPage = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  // Redirect to sign in if not logged in
  useEffect(() => {
    if (user === null) {
      router.push('/sign-in?redirect=/wrapped')
    }
  }, [user, router])

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 via-red-950 to-green-950">
        <LoadingIndicator />
      </div>
    )
  }

  if (user === null) {
    return null
  }

  const slideType = SLIDES[currentSlide]

  return (
    <>
      <Head>
        <title>Manifold Wrapped 2025 🎄</title>
        <meta
          name="description"
          content="Your year in predictions - Manifold Wrapped 2025"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <style jsx global>{`
        .font-christmas {
          font-family: 'Mountains of Christmas', cursive;
        }

        @keyframes animate-fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes animate-fade-out {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }

        @keyframes animate-slide-right-in {
          from {
            opacity: 0;
            transform: translateX(-50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes animate-slide-right-out {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(50px);
          }
        }

        .animate-fade-in {
          animation: animate-fade-in 0.7s ease-out forwards;
        }

        .animate-fade-out {
          animation: animate-fade-out 0.7s ease-out forwards;
        }

        .animate-slide-right-in {
          animation: animate-slide-right-in 0.7s ease-out forwards;
        }

        .animate-slide-right-out {
          animation: animate-slide-right-out 0.7s ease-out forwards;
        }
      `}</style>

      <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-slate-900 via-red-950/80 to-green-950/80">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-green-900/20 via-transparent to-transparent" />

        {/* Twinkling stars */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-1 w-1 animate-pulse rounded-full bg-white"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 50}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
                opacity: 0.3 + Math.random() * 0.5,
              }}
            />
          ))}
        </div>

        <Snowfall />

        {/* Main content */}
        <main className="relative z-20 flex flex-1 flex-col items-center justify-center p-4">
          {slideType === 'intro' && (
            <IntroSlide goToNextPage={goToNextPage} user={user} />
          )}
          {slideType === 'totalProfit' && (
            <TotalProfitSlide
              goToPrevPage={goToPrevPage}
              goToNextPage={goToNextPage}
              user={user}
            />
          )}
          {slideType === 'monthlyBets' && (
            <MonthlyBets
              goToPrevPage={goToPrevPage}
              goToNextPage={goToNextPage}
              monthlyBets={monthlyBets}
            />
          )}
          {slideType === 'maxMinProfit' && (
            <MaxMinProfit
              goToPrevPage={goToPrevPage}
              goToNextPage={goToNextPage}
              user={user}
            />
          )}
          {slideType === 'outro' && (
            <OutroSlide goToPrevPage={goToPrevPage} user={user} />
          )}
        </main>

        {/* Progress dots */}
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center gap-2">
          {SLIDES.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? 'w-6 bg-white'
                  : 'bg-white/30 hover:bg-white/50'
              }`}
            />
          ))}
        </div>

        {/* Decorative corners */}
        <div className="absolute left-4 top-4 text-4xl opacity-30">🎄</div>
        <div className="absolute right-4 top-4 text-4xl opacity-30">⭐</div>
        <div className="absolute bottom-4 left-4 text-3xl opacity-30">🎁</div>
        <div className="absolute bottom-4 right-4 text-3xl opacity-30">🦌</div>
      </div>
    </>
  )
}
