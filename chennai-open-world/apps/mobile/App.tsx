/**
 * React Native shell: app lifecycle around the game runtime. The game page owns every menu (the
 * loading screen and the title menu over the live city, TD-24), so the app opens straight into it.
 */
import React, { useCallback } from 'react';
import { BackHandler, StatusBar } from 'react-native';
import { GameScreen } from './src/GameScreen';

/**
 * Initial props from the native side. `testAutoplay` is only ever set by a test build
 * (`-PcowTestHooks=true`) launched with the TEST_AUTOPLAY extra (see MainActivity.kt); it skips
 * the game's title menu so the CI smoke test needs no taps.
 */
type AppProps = { testAutoplay?: boolean };

export default function App({ testAutoplay }: AppProps) {
  // QUIT on the title menu, or Back on its main page: close the app.
  const exit = useCallback(() => BackHandler.exitApp(), []);
  return (
    <>
      <StatusBar hidden />
      <GameScreen onExit={exit} autoplay={testAutoplay === true} />
    </>
  );
}
