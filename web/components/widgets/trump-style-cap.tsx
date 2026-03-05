/**
 * Trump/MAGA-style cap SVG component
 *
 * Key design notes:
 * - Brim curves DOWN on sides (U-shape when viewed from front)
 * - Brim connects flush with crown (no gap)
 * - Back of crown hidden behind brim from this front view
 * - Brim is a flat piece that curves - you see the TOP surface with edges curving down
 *
 * The brim geometry: imagine holding a flat oval visor. The center points toward you,
 * but the sides curve away and down. From the front, you see the top surface of the
 * brim, with the side edges appearing lower because they curve away from you.
 */

export const TrumpStyleCap1 = ({ team }: { team: 'red' | 'green' }) => {
  const colors =
    team === 'red'
      ? {
          main: '#DC2626',
          light: '#EF4444',
          dark: '#991B1B',
          accent: '#FEE2E2',
          darker: '#7F1D1D',
        }
      : {
          main: '#16A34A',
          light: '#22C55E',
          dark: '#14532D',
          accent: '#DCFCE7',
          darker: '#166534',
        }

  return (
    <svg viewBox="0 0 32 24" className="h-full w-full">
      {/* Crown - structured front panel, sits behind brim from this view */}
      <path d="M7 12 Q7 4 16 3 Q25 4 25 12 L25 12 L7 12 Z" fill={colors.main} />
      {/* Crown front panel - slightly lighter */}
      <path
        d="M9 11 Q9 6 16 5 Q23 6 23 11 L23 11 L9 11 Z"
        fill={colors.light}
        opacity="0.4"
      />
      {/* Seam line down center of crown */}
      <line
        x1="16"
        y1="3"
        x2="16"
        y2="12"
        stroke={colors.dark}
        strokeWidth="0.5"
        opacity="0.5"
      />
      {/* Button on top */}
      <circle cx="16" cy="3" r="1.2" fill={colors.dark} />

      {/* BRIM - the key element
          Structure: flat visor that curves DOWN at the sides
          - Top edge connects flush with crown at y=12
          - Center of brim is closest to viewer (largest vertical extent)
          - Sides curve down and away (smaller vertical extent, creating U-shape)
          - Bottom edge follows a U-curve: low at sides, high in center
      */}

      {/* Brim underside/shadow - visible at the curved-down edges */}
      <path
        d="M1 15
           C1 19, 8 22, 16 22
           C24 22, 31 19, 31 15
           C31 17, 24 20, 16 20
           C8 20, 1 17, 1 15
           Z"
        fill={colors.darker}
      />

      {/* Brim main surface - top of the curved visor
          The sides curve down (higher Y values at x=1 and x=31)
          The center stays up (lower Y values at x=16)
      */}
      <path
        d="M1 15
           C1 12, 7 12, 7 12
           L25 12
           C25 12, 31 12, 31 15
           C31 18, 24 20, 16 20
           C8 20, 1 18, 1 15
           Z"
        fill={colors.main}
      />

      {/* Brim highlight - shows the curve, lighter at center where it faces us */}
      <path
        d="M3 14.5
           C3 13, 8 12.5, 16 12.5
           C24 12.5, 29 13, 29 14.5
           C29 16.5, 23 18, 16 18
           C9 18, 3 16.5, 3 14.5
           Z"
        fill={colors.light}
        opacity="0.5"
      />

      {/* Brim edge - thin dark line at the outer curve */}
      <path
        d="M1 15.5 C1 19, 8 22, 16 22 C24 22, 31 19, 31 15.5"
        fill="none"
        stroke={colors.darker}
        strokeWidth="0.5"
      />
    </svg>
  )
}

/**
 * TrumpStyleCap3 - A MAGA/Trump-style cap with a properly curved brim
 *
 * THE KEY INSIGHT: A real baseball cap brim curves DOWN on the sides.
 * When viewed from the front:
 * - CENTER: The brim points straight at you, showing the full top surface (WIDER)
 * - SIDES: The brim curves down and away, you see it more edge-on (NARROWER)
 *
 * This creates a distinctive shape where:
 * - The inner edge of the brim stays relatively level (attached to the crown at y≈14)
 * - The outer edge dips DOWN significantly at the sides
 * - The brim appears THINNER at the sides due to perspective (foreshortening)
 *
 * Think of it like holding a paper plate and bending the edges down - the center
 * still shows the full surface, but the bent edges show only a sliver.
 */
export const TrumpStyleCap3 = ({ team }: { team: 'red' | 'green' }) => {
  const colors =
    team === 'red'
      ? {
          main: '#DC2626',
          light: '#EF4444',
          dark: '#991B1B',
          accent: '#FEE2E2',
          darker: '#7F1D1D',
        }
      : {
          main: '#16A34A',
          light: '#22C55E',
          dark: '#14532D',
          accent: '#DCFCE7',
          darker: '#166534',
        }

  return (
    <svg viewBox="0 0 32 24" className="h-full w-full">
      <defs>
        {/* Gradient for brim to show depth - darker at edges where it curves away */}
        <linearGradient
          id={`brim-depth-${team}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor={colors.darker} />
          <stop offset="30%" stopColor={colors.dark} />
          <stop offset="50%" stopColor={colors.dark} />
          <stop offset="70%" stopColor={colors.dark} />
          <stop offset="100%" stopColor={colors.darker} />
        </linearGradient>

        {/* Gradient for crown panel depth */}
        <linearGradient
          id={`crown-depth-${team}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor={colors.dark} stopOpacity="0.3" />
          <stop offset="50%" stopColor={colors.light} stopOpacity="0" />
          <stop offset="100%" stopColor={colors.dark} stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* ========== CROWN SECTION ========== */}

      {/* Crown back/sides - lighter color showing through */}
      <path d="M4 14 L4 7 Q16 3 28 7 L28 14 Z" fill={colors.light} />

      {/* Crown front panel - main color, prominent */}
      <path d="M7 14 L7 7.5 Q16 4 25 7.5 L25 14 Z" fill={colors.main} />

      {/* Crown depth shading - adds 3D roundness */}
      <path
        d="M7 14 L7 7.5 Q16 4 25 7.5 L25 14 Z"
        fill={`url(#crown-depth-${team})`}
      />

      {/* Center seam - characteristic of structured caps */}
      <path
        d="M16 4.5 L16 13.5"
        stroke={colors.darker}
        strokeWidth="0.4"
        opacity="0.5"
      />

      {/* Side seams - showing panel construction */}
      <path
        d="M10 6 L10 14"
        stroke={colors.darker}
        strokeWidth="0.25"
        opacity="0.3"
      />
      <path
        d="M22 6 L22 14"
        stroke={colors.darker}
        strokeWidth="0.25"
        opacity="0.3"
      />

      {/* Top button */}
      <circle cx="16" cy="4.5" r="1.3" fill={colors.darker} />
      <circle cx="16" cy="4.5" r="0.8" fill={colors.dark} />

      {/* ========== BRIM SECTION - THE KEY FEATURE ========== */}
      {/*
        The brim curves DOWN on the sides. This means:
        - Inner edge (top of brim, where it meets crown): relatively flat at y≈14
        - Outer edge (bottom of brim): dips DOWN at sides (higher y value at center)

        CRITICAL GEOMETRY:
        At center (x=16): brim spans y=14 to y=19.5 → height = 5.5 (full surface visible)
        At sides (x=2,30): brim spans y=15.5 to y=16.5 → height = 1 (edge-on, foreshortened)

        The shape is like a crescent that's THICK in the middle, THIN at the edges.
        This is the opposite of a flat semicircle - it shows perspective!
      */}

      {/* Brim underside shadow - visible where brim curves down */}
      <path
        d="M2 15.5
           Q8 14.5 16 14
           Q24 14.5 30 15.5
           Q28 17 16 17.5
           Q4 17 2 15.5
           Z"
        fill={colors.darker}
        opacity="0.6"
      />

      {/* Main brim surface - the key curved shape
          Inner edge: Q-curves, fairly level around y=14-15.5
          Outer edge: DIPS at center (y=19.5), rises at sides (y=16.5)
      */}
      <path
        d="M2 15.5
           Q6 14.5 16 14
           Q26 14.5 30 15.5
           L30 16.5
           Q26 19 16 19.5
           Q6 19 2 16.5
           Z"
        fill={`url(#brim-depth-${team})`}
      />

      {/* Brim top surface highlight - emphasizes the center being "face-on" */}
      <path
        d="M5 15
           Q10 14.3 16 14
           Q22 14.3 27 15"
        stroke={colors.accent}
        strokeWidth="0.5"
        opacity="0.4"
        fill="none"
      />

      {/* Brim edge stitching - follows the curved outer edge */}
      <path
        d="M3 16.2
           Q8 18.5 16 19
           Q24 18.5 29 16.2"
        stroke={colors.darker}
        strokeWidth="0.3"
        opacity="0.5"
        fill="none"
        strokeDasharray="1 0.5"
      />

      {/* Outer edge definition - the characteristic curved brim edge */}
      <path
        d="M2.5 16
           Q8 19 16 19.5
           Q24 19 29.5 16"
        stroke={colors.darker}
        strokeWidth="0.4"
        opacity="0.4"
        fill="none"
      />
    </svg>
  )
}

export default TrumpStyleCap1
