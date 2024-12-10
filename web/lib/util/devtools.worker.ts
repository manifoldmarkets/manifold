self.onmessage = (ev) => {
  postMessage({ isOpenBeat: true })
  debugger
  for (let i = 0; i < ev.data.moreDebugs; i++) {
    debugger
  }
  postMessage({ isOpenBeat: false })
}

export {} // make TypeScript treat this as a module
