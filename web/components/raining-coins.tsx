import Image from 'next/image'

const COIN_VARIANTS = [
  'basic.png',
  'off-axis-top.png',
  'isometric-top.png',
  'off-axis-left.png',
  'isometric-left.png',
  'isometric-right.png',
  'off-axis-bottom.png',
  'isometric-bottom.png',
]

const BASE_COINS = [
  // Top coins - larger and more transparent
  {
    x: 20,
    y: -2,
    size: 38,
    rotation: 15,
    opacity: 0.6,
    image: 'isometric-top.png',
  },
  {
    x: 70,
    y: 2,
    size: 42,
    rotation: -20,
    opacity: 0.5,
    image: 'off-axis-top.png',
  },
  {
    x: 45,
    y: 5,
    size: 40,
    rotation: 30,
    opacity: 0.54,
    image: 'isometric-top.png',
  },

  // Middle layer coins - smaller and more opaque
  {
    x: 15,
    y: 15,
    size: 22,
    rotation: -15,
    opacity: 0.15,
    image: 'isometric-left.png',
  },
  {
    x: 90,
    y: 15,
    size: 20,
    rotation: 25,
    opacity: 0.4,
    image: 'off-axis-left.png',
  },

  // Bottom coins - larger again
  {
    x: 10,
    y: 85,
    size: 44,
    rotation: 20,
    opacity: 0.4,
    image: 'isometric-bottom.png',
  },
  {
    x: 60,
    y: 88,
    size: 40,
    rotation: -10,
    opacity: 0.6,
    image: 'off-axis-bottom.png',
  },
  {
    x: 85,
    y: 92,
    size: 42,
    rotation: 35,
    opacity: 0.55,
    image: 'isometric-bottom.png',
  },
]

const ADDITIONAL_MD_COINS = [
  {
    x: 10,
    y: 60,
    size: 36,
    rotation: 25,
    opacity: 0.6,
    image: 'off-axis-top.png',
  },
  {
    x: 5,
    y: 20,
    size: 38,
    rotation: -15,
    opacity: 0.3,
    image: 'isometric-right.png',
  },
]

const ADDITIONAL_LG_COINS = [
  {
    x: 30,
    y: 80,
    size: 40,
    rotation: 30,
    opacity: 0.4,
    image: 'isometric-left.png',
  },
  {
    x: 82,
    y: 65,
    size: 42,
    rotation: -20,
    opacity: 0.6,
    image: 'off-axis-left.png',
  },
  {
    x: 95,
    y: 45,
    size: 38,
    rotation: 15,
    opacity: 0.6,
    image: 'isometric-right.png',
  },
]

export function RainingCoins() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base coins - always visible */}
      {BASE_COINS.map((coin, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${coin.x}%`,
            top: `${coin.y}%`,
            transform: `rotate(${coin.rotation}deg)`,
            opacity: coin.opacity,
          }}
        >
          <Image
            src={`/3d-coins/${coin.image}`}
            alt=""
            width={coin.size}
            height={coin.size}
            className="select-none"
          />
        </div>
      ))}

      {/* Medium screen coins */}
      {ADDITIONAL_MD_COINS.map((coin, i) => (
        <div
          key={`md-${i}`}
          className="absolute hidden md:block"
          style={{
            left: `${coin.x}%`,
            top: `${coin.y}%`,
            transform: `rotate(${coin.rotation}deg)`,
            opacity: coin.opacity,
          }}
        >
          <Image
            src={`/3d-coins/${coin.image}`}
            alt=""
            width={coin.size}
            height={coin.size}
            className="select-none"
          />
        </div>
      ))}

      {/* Large screen coins */}
      {ADDITIONAL_LG_COINS.map((coin, i) => (
        <div
          key={`lg-${i}`}
          className="absolute hidden lg:block"
          style={{
            left: `${coin.x}%`,
            top: `${coin.y}%`,
            transform: `rotate(${coin.rotation}deg)`,
            opacity: coin.opacity,
          }}
        >
          <Image
            src={`/3d-coins/${coin.image}`}
            alt=""
            width={coin.size}
            height={coin.size}
            className="select-none"
          />
        </div>
      ))}
    </div>
  )
}
