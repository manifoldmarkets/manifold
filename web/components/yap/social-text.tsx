// React escapes all text; only explicit HTTP(S) URLs become links.
export function SocialText({ text }: { text: string }) {
  return (
    <p className="text-ink-900 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            className="text-primary-700 hover:underline"
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            key={i}
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  )
}
