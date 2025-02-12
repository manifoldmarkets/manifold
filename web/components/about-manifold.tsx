type AboutManifoldProps = {
  className?: string
}

export const AboutManifold = ({ className = '' }: AboutManifoldProps) => {
  return (
    <div className={`${className}`}>
      <div className="mb-2">
        Manifold is the world's largest social prediction market.
      </div>
      <div className="mb-2">
        Get accurate real-time odds on politics, tech, sports, and more.
      </div>
      {/* TODO: Add this back in */}
      {/* <div className="mb-2">
        Win mana for your correct predictions on our markets!
      </div> */}
    </div>
  )
}
