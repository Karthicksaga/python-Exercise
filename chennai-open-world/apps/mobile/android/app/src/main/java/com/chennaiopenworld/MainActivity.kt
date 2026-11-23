package com.chennaiopenworld

import android.os.Bundle
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ChennaiOpenWorld"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
        override fun getLaunchOptions(): Bundle? = testLaunchOptions()
      }

  /**
   * Test builds only (`-PcowTestHooks=true`): `--ez com.chennaiopenworld.TEST_AUTOPLAY true` on
   * the launch intent opens the game without tapping PLAY (used by the CI smoke test). In other
   * builds the extra is ignored.
   */
  private fun testLaunchOptions(): Bundle? {
    if (!BuildConfig.TEST_HOOKS || !intent.getBooleanExtra(TEST_AUTOPLAY, false)) return null
    return Bundle().apply { putBoolean("testAutoplay", true) }
  }

  private companion object {
    const val TEST_AUTOPLAY = "com.chennaiopenworld.TEST_AUTOPLAY"
  }

  /**
   * The game is full screen: hide the status and navigation bars whenever the window has focus
   * (they come back for a moment when the player swipes from an edge).
   */
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (!hasFocus) return
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }
}
