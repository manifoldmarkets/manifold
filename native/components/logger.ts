// Logging to file system for debugging on Ian's device
import { fileAsyncTransport, logger } from 'react-native-logs'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'

const now = new Date()
export const fileName = `logs_${now.toISOString().replaceAll(':', '-')}.txt`
export const filePath = FileSystem.documentDirectory
const config = {
  severity: 'debug',
  transport: fileAsyncTransport,
  transportOptions: {
    FS: FileSystem,
    filePath,
    fileName,
  },
}
const appLogger = logger.createLogger(config)
console.log('[Manifold Markets] logger filePath', filePath + fileName)

export const log = (...args: unknown[]) => {
  console.log('[Manifold Markets]', ...args)
  appLogger.info(`[Manifold Markets]`, ...args)
}
export const shareLogs = async () => {
  const UTI = 'public.item'
  const shareResult = await Sharing.shareAsync(filePath + fileName, { UTI })
}
