/**
 * React Native shell: native menus and app lifecycle around the game runtime.
 */
import React, { useCallback, useState } from 'react';
import { StatusBar } from 'react-native';
import { GameScreen } from './src/GameScreen';
import { MainMenu } from './src/MainMenu';

/**
 * Initial props from the native side. `testAutoplay` is only ever set by a test build
 * (`-PcowTestHooks=true`) launched with the TEST_AUTOPLAY extra (see MainActivity.kt); it skips
 * the menu so the CI smoke test needs no taps.
 */
type AppProps = { testAutoplay?: boolean };

export default function App({ testAutoplay }: AppProps) {
  const [playing, setPlaying] = useState(testAutoplay === true);
  const exit = useCallback(() => setPlaying(false), []);
  return (
    <>
      <StatusBar hidden />
      {playing ? <GameScreen onExit={exit} /> : <MainMenu onPlay={() => setPlaying(true)} />}
    </>
  );
}
