export type nativeToWebMessageType = 'iapReceipt' | 'iapError' | 'setIsNative' | 'nativeFbUser' | 'pushNotificationPermissionStatus' | 'pushToken' | 'notification' | 'link';
export type nativeToWebMessage = {
    type: nativeToWebMessageType;
    data: any;
};
export type webToNativeMessage = {
    type: webToNativeMessageType;
    data: any;
};
export type webToNativeMessageType = 'checkout' | 'openUrl' | 'tryToGetPushTokenWithoutPrompt' | 'loginClicked' | 'copyToClipboard' | 'promptEnablePushNotifications' | 'signOut' | 'users' | 'error' | 'onPageVisit';
