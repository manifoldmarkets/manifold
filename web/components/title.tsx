export function Title(props: { text: string }) {
  const { text } = props
  return (
    <h1 className="text-2xl font-major-mono text-indigo-700 font-bold mt-6 mb-4">
      {text}
    </h1>
  )
}
