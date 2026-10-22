package com.markets.manifold

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.markets.manifold.widget.Streak

// Bridges Android's "pin app widget" capability to JS. The react-native-android-widget
// library doesn't expose pinning, so this small module wraps
// AppWidgetManager.requestPinAppWidget for the Streak widget. Triggered from the
// webview via the `pinStreakWidget` message (see App.tsx).
class WidgetPinModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "WidgetPin"

  // Resolves "requested" if the system add-widget dialog was shown, "unsupported"
  // if the launcher/OS can't pin (pre-Android 8, or a launcher without pin
  // support), or rejects on an unexpected error.
  @ReactMethod
  fun pinStreakWidget(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve("unsupported")
        return
      }
      val context = reactApplicationContext
      val manager = AppWidgetManager.getInstance(context)
      if (!manager.isRequestPinAppWidgetSupported) {
        promise.resolve("unsupported")
        return
      }
      val provider = ComponentName(context, Streak::class.java)
      val requested = manager.requestPinAppWidget(provider, null, null)
      promise.resolve(if (requested) "requested" else "unsupported")
    } catch (e: Exception) {
      promise.reject("pin_failed", e)
    }
  }
}
