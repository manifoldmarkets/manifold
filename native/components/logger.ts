// Logging to file system for debugging on Ian's device
import { fileAsyncTransport, logger } from 'react-native-logs'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { NATIVE_BUILD } from 'common/envs/constants'

const now = new Date()
const fileName = `logs_${now.toISOString().replaceAll(':', '-')}.txt`
const filePath = FileSystem.documentDirectory
const initLogger = () => {
  console.log('[Manifold Markets] logger filePath', filePath + fileName)
  console.log('[Manifold Markets] build type', NATIVE_BUILD)
  if (NATIVE_BUILD === 'PROD') return { info: () => {} }
  const config = {
    severity: 'debug',
    transport: fileAsyncTransport,
    transportOptions: {
      FS: FileSystem,
      filePath,
      fileName,
    },
  }
  return logger.createLogger(config)
}
const appLogger = initLogger()
export const log = (...args: unknown[]) => {
  if (NATIVE_BUILD === 'PROD') return
  console.log('[Manifold Markets]', ...args)
  appLogger.info(`[Manifold Markets]`, ...args)
}
export const shareLogs = async () => {
  const UTI = 'public.item'
  const shareResult = await Sharing.shareAsync(filePath + fileName, { UTI })
}
