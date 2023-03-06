function getMessage(obj: unknown) {
  if (typeof obj === 'string') {
    return obj
  } else if (obj instanceof Error) {
    return `${obj.stack}`
  } else {
    return JSON.stringify(obj)
  }
}

export function log(severity: string, message: string, details?: unknown) {
  if (details == null) {
    console.log(JSON.stringify({ severity, message }))
  } else {
    console.log(
      JSON.stringify({ severity, message: `${message} ${getMessage(details)}` })
    )
  }
}
