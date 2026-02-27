/** Canonical trophy SVG — one definition, used everywhere. */
export function TrophySvg() {
  return (
    <svg width="92" height="92" viewBox="0 0 80 80" fill="none">
      <defs>
        <linearGradient id="tr-gold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#B45309" />
          <stop offset="25%" stopColor="#D97706" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="75%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <radialGradient id="tr-spec" cx="30%" cy="30%" r="40%">
          <stop offset="0%" stopColor="white" stopOpacity="0.7" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tr-stem" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="50%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      {/* Handles */}
      <path d="M24 25L18 25C13 25 16 44 29 44" stroke="url(#tr-gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M56 25L62 25C67 25 64 44 51 44" stroke="url(#tr-gold)" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* Gap filler */}
      <path className="dark:opacity-50" d="M24 20C24 20 24 50 40 50C56 50 56 20 56 20Z" fill="url(#tr-gold)" />
      {/* Bowl body */}
      <path d="M24 20C24 20 24 50 40 50C56 50 56 20 24 20Z" fill="url(#tr-gold)" />
      {/* Bowl opening */}
      <ellipse cx="40" cy="20" rx="16" ry="4" fill="#FBBF24" stroke="#D97706" strokeWidth="0.5" />
      <ellipse cx="40" cy="21" rx="14" ry="2.5" fill="#B45309" fillOpacity="0.2" />
      {/* Specular highlight */}
      <ellipse cx="32" cy="30" rx="4" ry="8" fill="url(#tr-spec)" transform="rotate(-15, 32, 30)" />
      {/* Stem */}
      <rect x="37" y="50" width="6" height="15" fill="url(#tr-stem)" />
      <path d="M37 50L35 55H45L43 50H37Z" fill="#D97706" fillOpacity="0.5" />
      {/* Base */}
      <rect x="26" y="65" width="28" height="6" rx="1.5" fill="url(#tr-gold)" />
      <rect x="22" y="71" width="36" height="5" rx="1" fill="#B45309" />
      {/* Rim polish */}
      <path d="M24 20C28 23 52 23 56 20" stroke="white" strokeOpacity="0.4" strokeWidth="0.5" />
    </svg>
  )
}
