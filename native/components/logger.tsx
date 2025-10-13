import Constants from 'expo-constants'
// import * as FileSystem from 'expo-file-system'
// import * as Sharing from 'expo-sharing'
// import React from 'react'
// import { Text, TouchableOpacity, View } from 'react-native'
// import { fileAsyncTransport, logger } from 'react-native-logs'

const NATIVE_BUILD =
  Constants.expoConfig?.extra?.eas.NATIVE_BUILD_TYPE ?? 'PREVIEW'
// const now = new Date()
// const fileName = `logs_${now.toISOString().replace(/:/g, '-')}.txt`
// const filePath = FileSystem.Directory
// const initLogger = () => {
//   console.log('[Manifold Markets] logger filePath', filePath + fileName)
//   console.log('[Manifold Markets] build type', NATIVE_BUILD)
//   if (NATIVE_BUILD === 'PROD') return { info: () => {} }
//   const config = {
//     severity: 'debug',
//     transport: fileAsyncTransport,
//     transportOptions: {
//       FS: FileSystem,
//       filePath,
//       fileName,
//     },
//   }
//   return logger.createLogger(config)
// }
// const appLogger = initLogger()
export const log = (...args: unknown[]) => {
  if (NATIVE_BUILD === 'PROD') return
  console.log('[Manifold Markets]', ...args)
  // appLogger.info(`[Manifold Markets]`, ...args)
}
// const exportLogsViaSharingMenu = async () => {
//   const UTI = 'public.item'
//   const shareResult = await Sharing.shareAsync(filePath + fileName, { UTI })
// }

// export const ExportLogsButton = () => {
//   if (NATIVE_BUILD === 'PROD') return <View />
//   return (
//     <View
//       style={{
//         flex: 1,
//         maxHeight: 30,
//         flexDirection: 'row',
//         justifyContent: 'flex-end',
//       }}
//     >
//       <TouchableOpacity onPress={exportLogsViaSharingMenu}>
//         <Text
//           style={{
//             color: 'blue',
//             marginRight: 20,
//             marginBottom: 0,
//             zIndex: 100,
//           }}
//         >
//           Logs
//         </Text>
//       </TouchableOpacity>
//     </View>
//   )
// }
