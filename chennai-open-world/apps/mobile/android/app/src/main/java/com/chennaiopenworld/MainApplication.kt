package com.chennaiopenworld

import android.app.Application
import android.webkit.WebView
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    // Test builds only (`-PcowTestHooks=true`, the CI smoke APK): lets the smoke test read the
    // game page through Chrome DevTools. Never on in the normal release APK.
    if (BuildConfig.TEST_HOOKS) WebView.setWebContentsDebuggingEnabled(true)
    loadReactNative(this)
  }
}
