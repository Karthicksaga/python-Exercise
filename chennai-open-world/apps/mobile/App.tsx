/**
 * React Native shell: native menus and app lifecycle around the game runtime.
 */
import React, { useCallback, useState } from 'react';
import { StatusBar } from 'react-native';
import { GameScreen } from './src/GameScreen';
import { MainMenu } from './src/MainMenu';

export default function App() {
  const [playing, setPlaying] = useState(false);
  const exit = useCallback(() => setPlaying(false), []);
  return (
    <>
      <StatusBar hidden />
      {playing ? <GameScreen onExit={exit} /> : <MainMenu onPlay={() => setPlaying(true)} />}
    </>
  );
}
