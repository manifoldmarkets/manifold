# Tiptap Editor Integration

## Core Concepts

- We use Tiptap for rich text editing throughout the app
- Extensions are customized to work with React components via `renderReact`
- Most extensions live in `web/components/editor/`

## Custom Extension Pattern

```typescript
// 1. Create a React component for the view
const MyComponent = (props: MyProps) => { ... }

// 2. Extend the Tiptap extension
export const DisplayMyExtension = TiptapExtension.extend({
  // For SSR and copy/paste
  renderHTML({ HTMLAttributes }) {
    return [
      'tag-name',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ]
  },

  // For React rendering
  renderReact(attrs: any, children: ReactNode) {
    return <MyComponent {...attrs}>{children}</MyComponent>
  },
})
```

## Key Features

- `nodeViewMiddleware` wraps extensions to handle node selection styling
- Use `renderHTML` for SSR and clipboard operations
- Use `renderReact` for interactive React components
- Extensions are composed in `editorExtensions` array in editor.tsx

## Best Practices

- Keep React components and Tiptap extensions co-located
- Use `mergeAttributes` to handle HTML attributes properly
- Use nodeViewMiddleware for consistent selection styling

## Server-Side Parsing

On the server we use a simplified version that converts rich content to plain text

- `common/src/util/parse.ts` - Main parsing logic for the server
- `common/src/util/parse.native.ts` - Mobile app version
- `common/src/api/zod-types.ts` - api validation of tiptap json format (you don't have to change this)

## Adding a New Component

1. Web (Editor):
   - Create extension file in `web/components/editor/`
   - Add React component for interactive view
   - Implement `renderHTML` and `renderReact`
   - Add to `editorExtensions` in editor.tsx

2. Common (Server/Types):
   - Add extension to parse.ts and parse.native.ts
   - Add `renderText` implementation

3. Testing (Humans only for now):
   - Test first load of content isn't wonky
   - Test copy/paste behavior
   - Test server-side parsing doesn't crash
