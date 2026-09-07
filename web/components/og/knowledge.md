# OG (Open Graph) Images

## Overview

We use [@vercel/og](https://vercel.com/docs/functions/og-image-generation) which uses [Satori](https://github.com/vercel/satori) to generate social preview images (OG images) for Twitter, Discord, etc. These are React components rendered to images on the Edge.

## Architecture

- `web/pages/api/og/[type].tsx` - Edge API routes that generate images
- `web/components/og/og-*.tsx` - React components for each type of OG image
- `web/pages/og-test/[type]/[id].tsx` - Test pages to preview OG images locally

## Key Concepts

- All OG cards are laid out at 600x315 (`OG_CARD_WIDTH/HEIGHT` in `common/edge/og`). The market card is rasterized at 2x (1200x630) by wrapping it in `scaleCard`, so text stays crisp where platforms show it larger
- The market image URL carries `v` (`OG_CARD_VERSION` in `common/contract-seo`). Bump it when the layout or param encoding changes, since responses are cached for a year. Chart `points` are float32-encoded when `v` is set and float64 on older URLs
- Components must use tailwind classes for styling
- Use Figtree font family
- Cannot use certain CSS features due to Satori engine limitations:
  - No `gap` property
  - No `text-ellipsis`
  - No `line-clamp`
  - Cannot overflow in only one direction
  - All divs should have `flex` set

## Testing

Use the test pages to preview OG images:

- `/og-test/[username]/[contractSlug]` - Preview market OG images
- `/og-test/topic/[topicSlug]` - Preview topic OG images
- `/og-test/election` - Preview the elections page (Senate map) OG image

## Component Structure

OG component:

```tsx
export type OgProps = {
  // Define strongly typed props
}

export function OgComponent(props: OgProps) {
  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Content here */}
    </div>
  )
}
```

Usage (top level page)

```tsx
<Page>
    <SEO
    {/* other SEO props */}
    ogProps={{
      props: {
        // props here
      },
      endpoint: 'topic',
    }}
  />
}}
```

## Utils

- `classToTw` - Converts className props to tw props for Satori.
- `buildOgUrl` - Builds URL for OG image with proper query params

## Common Patterns

- Use gradients for backgrounds
- Include Manifold logo in consistent position
- Show key stats/numbers prominently
- Keep text content brief and readable
