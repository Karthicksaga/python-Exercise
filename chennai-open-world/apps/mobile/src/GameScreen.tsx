/**
 * Hosts the game runtime. The game itself (Three.js + Rapier, built from `apps/game`) runs in
 * the Android System WebView, which has a JIT-compiled JavaScript engine, WebGL 2 and
 * WebAssembly. See docs/technical-decisions.md for why it is not drawn by React Native.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/** Built by `npm run sync:android` into android/app/src/main/assets/game. */
const GAME_URL = 'file:///android_asset/game/index.html';

type GameMessage =
  | { type: 'ready'; gpu: string }
  | { type: 'error'; message: string }
  | { type: 'paused'; paused: boolean }
  | { type: 'exit' };

/** Script that delivers a shell message to the game as a `cow-shell` event. */
/**
 * The library's default generic (`undefined`) collapses the props type to `never` in strict
 * mode; an empty object keeps the normal WebView props.
 */
type NoExtraProps = Record<never, never>;

const shellMessage = (type: 'pause' | 'resume') =>
  `window.dispatchEvent(new CustomEvent('cow-shell',{detail:${JSON.stringify(JSON.stringify({ type }))}}));true;`;

export function GameScreen({ onExit }: { onExit: () => void }) {
  const web = useRef<WebView<NoExtraProps>>(null);
  const paused = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: GameMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as GameMessage;
      } catch {
        return;
      }
      if (message.type === 'paused') paused.current = message.paused;
      else if (message.type === 'exit') onExit();
      else if (message.type === 'error') setFailure(message.message);
    },
    [onExit],
  );

  // Back: first press pauses the game, a second press (while paused) leaves to the menu.
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (failure || paused.current) onExit();
      else web.current?.injectJavaScript(shellMessage('pause'));
      return true;
    });
    // Pause when the app goes to the background (a call, the home button).
    const state = AppState.addEventListener('change', (next) => {
      if (next !== 'active') web.current?.injectJavaScript(shellMessage('pause'));
    });
    return () => {
      back.remove();
      state.remove();
    };
  }, [failure, onExit]);

  if (failure) {
    return (
      <View style={styles.failure}>
        <Text style={styles.failureTitle}>The game could not start</Text>
        <Text style={styles.failureText}>{failure}</Text>
        <Pressable style={styles.button} onPress={onExit} accessibilityRole="button">
          <Text style={styles.buttonText}>Back to menu</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WebView<NoExtraProps>
      ref={web}
      style={styles.web}
      source={{ uri: GAME_URL }}
      originWhitelist={['file://*']}
      allowFileAccess
      javaScriptEnabled
      domStorageEnabled
      onMessage={onMessage}
      onError={(e) => setFailure(e.nativeEvent.description)}
      onRenderProcessGone={() => setFailure('The graphics process stopped. This device may be out of memory.')}
      androidLayerType="hardware"
      overScrollMode="never"
      bounces={false}
      scrollEnabled={false}
      textZoom={100}
      setSupportMultipleWindows={false}
      setBuiltInZoomControls={false}
      mediaPlaybackRequiresUserAction={false}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: '#0f1220' },
  failure: { flex: 1, backgroundColor: '#0f1220', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  failureTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  failureText: { color: '#c9cde0', fontSize: 14, textAlign: 'center', maxWidth: 460 },
  button: { minWidth: 180, minHeight: 48, borderRadius: 12, backgroundColor: '#ffb703', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: '#1a1a1a', fontSize: 15, fontWeight: '700' },
});
