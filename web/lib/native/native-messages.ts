import { NativeQuestData, NativeStreakData } from 'common/native-message'
import { postMessageToNative } from 'web/lib/native/post-message'

export const nativePassUsers = (userJson: string) => {
  postMessageToNative('users', userJson)
}
export const nativeSignOut = () => {
  postMessageToNative('signOut', {})
}
// Pushes the current streak snapshot to the native app for the streak widget.
// No-ops on web (postMessageToNative guards on getIsNative()).
export const nativeSetStreak = (streak: NativeStreakData) => {
  postMessageToNative('setStreak', streak)
}
// Pushes the current quest completion to the native app for the streak widget.
export const nativeSetQuests = (quests: NativeQuestData) => {
  postMessageToNative('setQuests', quests)
}
