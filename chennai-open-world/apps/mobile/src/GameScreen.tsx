/**
 * Hosts the game runtime. The game itself (Three.js + Rapier, built from `apps/game`) runs in
 * the Android System WebView, which has a JIT-compiled JavaScript engine, WebGL 2 and
 * WebAssembly. See docs/technical-decisions.md for why it is not drawn by React Native.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

/**
 * Built by `npm run sync:android` into android/app/src/main/assets/game, and served from the APK's
 * assets on this https origin by androidx.webkit's WebViewAssetLoader (a patch of
 * react-native-webview's WebView client, `patches/`; TD-16). Nothing goes to the network: the
 * host is reserved for this and every request to it is answered on the device.
 */
const GAME_ORIGIN = 'https://appassets.androidplatform.net';
const GAME_URL = `${GAME_ORIGIN}/assets/game/index.html`;
/** Test builds only: the game skips its title menu and starts at once (see App.tsx). */
const GAME_URL_AUTOPLAY = `${GAME_URL}?start=play`;

/**
 * The WebView only ever shows our own page. `originWhitelist` is a prefix match on the origin, so
 * this also checks the exact origin (a lookalike host such as `appassets.androidplatform.net.x`
 * would pass the whitelist). Anything else is refused (react-native-webview hands non-whitelisted
 * links to the system browser; the game has none).
 */
const stayOnGameOrigin = (request: ShouldStartLoadRequest) =>
  request.url === 'about:blank' || request.url.startsWith(`${GAME_ORIGIN}/`);

type GameMessage =
  | { type: 'ready'; gpu: string }
  | { type: 'error'; message: string }
  | { type: 'paused'; paused: boolean }
  | { type: 'cityMap'; open: boolean }
  | { type: 'exit' }
  // Loading reports (apps/game/src/loadReport.ts), for the status panel below.
  | {
      type: 'device';
      memoryGB: number | null;
      cores: number | null;
      screen: string;
      gpu: string;
    }
  | { type: 'loading'; step: string; label: string; at: number }
  | { type: 'alive'; at: number; heapMB: number | null }
  | { type: 'problem'; at: number; message: string }
  | { type: 'loaded'; at: number };

/** What the shell knows about the page's loading, from its reports. */
interface LoadStatus {
  device: Extract<GameMessage, { type: 'device' }> | null;
  label: string | null;
  /** Shell clock (ms) when the page started, the current step began and the last heartbeat came. */
  openedAt: number;
  stepAt: number;
  aliveAt: number;
  heapMB: number | null;
  loaded: boolean;
  problems: string[];
}

const freshStatus = (): LoadStatus => {
  const now = Date.now();
  return {
    device: null,
    label: null,
    openedAt: now,
    stepAt: now,
    aliveAt: now,
    heapMB: null,
    loaded: false,
    problems: [],
  };
};

/**
 * Seconds of loading before the shell shows its own status panel. Drawn natively over the
 * WebView, it shows even when the page has stopped being drawn (23 Nov 2026: on one phone the
 * loading screen froze part-way and nothing said why).
 */
const SLOW_LOAD_S = 20;
/** No heartbeat for this long (the page sends one every 2 s) means its script is stuck. */
const SILENT_S = 8;

/** Script that delivers a shell message to the game as a `cow-shell` event. */
/**
 * The library's default generic (`undefined`) collapses the props type to `never` in strict
 * mode; an empty object keeps the normal WebView props.
 */
type NoExtraProps = Record<never, never>;

const shellMessage = (type: 'pause' | 'resume' | 'back') =>
  `window.dispatchEvent(new CustomEvent('cow-shell',{detail:${JSON.stringify(
    JSON.stringify({ type }),
  )}}));true;`;

export function GameScreen({
  onExit,
  autoplay = false,
}: {
  onExit: () => void;
  autoplay?: boolean;
}) {
  const web = useRef<WebView<NoExtraProps>>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Bumped by "Try again" to load the game page afresh. */
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LoadStatus>(freshStatus);
  /** Ticks once a second while the panel may be needed, so its times stay current. */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (status.loaded && status.problems.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status.loaded, status.problems.length]);
  const retry = useCallback(() => {
    setFailure(null);
    setStatus(freshStatus());
    setAttempt(n => n + 1);
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: GameMessage;
      try {
        message = JSON.parse(event.nativeEvent.data) as GameMessage;
      } catch {
        return;
      }
      // 'paused', 'cityMap' and 'ready' are for information: the game decides what Back does.
      if (message.type === 'exit') onExit();
      else if (message.type === 'error') setFailure(message.message);
      else if (message.type === 'device')
        setStatus(s => ({ ...s, device: message }));
      else if (message.type === 'loading')
        setStatus(s => ({
          ...s,
          label: message.label,
          stepAt: Date.now(),
          aliveAt: Date.now(),
        }));
      else if (message.type === 'alive')
        setStatus(s => ({ ...s, aliveAt: Date.now(), heapMB: message.heapMB }));
      else if (message.type === 'problem')
        setStatus(s => ({
          ...s,
          problems: [...s.problems, message.message].slice(-3),
        }));
      else if (message.type === 'loaded')
        setStatus(s => ({ ...s, loaded: true }));
    },
    [onExit],
  );

  // Back is handled by the game: it closes the city map, or pauses, or (paused) opens the title
  // menu, or leaves a menu page; on the title menu's main page it sends 'exit' and the app closes.
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (failure) onExit();
      else web.current?.injectJavaScript(shellMessage('back'));
      return true;
    });
    // Pause when the app goes to the background (a call, the home button).
    const state = AppState.addEventListener('change', next => {
      if (next !== 'active')
        web.current?.injectJavaScript(shellMessage('pause'));
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
        <Pressable
          style={styles.button}
          onPress={retry}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.quiet]}
          onPress={onExit}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, styles.quietText]}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const elapsed = Math.round((now - status.openedAt) / 1000);
  const silent = Math.round((now - status.aliveAt) / 1000);
  const showPanel =
    (!status.loaded && elapsed >= SLOW_LOAD_S) || status.problems.length > 0;
  const device = status.device;

  return (
    <View style={styles.root}>
      <WebView<NoExtraProps>
        key={attempt}
        ref={web}
        style={styles.web}
        source={{ uri: autoplay ? GAME_URL_AUTOPLAY : GAME_URL }}
        originWhitelist={[GAME_ORIGIN]}
        onShouldStartLoadWithRequest={stayOnGameOrigin}
        // No file access: the game reads its world files with fetch from its https origin (TD-16).
        // react-native-webview already defaults allowFileAccess and allowFileAccessFromFileURLs to off.
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        onError={e => setFailure(e.nativeEvent.description)}
        onRenderProcessGone={() =>
          setFailure(
            'The graphics process stopped. This device may be out of memory.',
          )
        }
        // No androidLayerType="hardware": that renders the whole WebView into one more full-screen
        // texture on top of the game's own WebGL buffers. On a phone short of GPU memory it showed as
        // missing bands and white boxes on the loading screen (23 Nov 2026). The WebView is still
        // GPU-drawn without it (the app is hardware accelerated).
        overScrollMode="never"
        bounces={false}
        scrollEnabled={false}
        textZoom={100}
        setSupportMultipleWindows={false}
        setBuiltInZoomControls={false}
        mediaPlaybackRequiresUserAction={false}
      />
      {showPanel ? (
        <View style={styles.panel} accessibilityLiveRegion="polite">
          <Text style={styles.panelTitle}>
            {status.loaded
              ? 'Something went wrong'
              : 'Loading is taking longer than usual'}
          </Text>
          {!status.loaded ? (
            <Text style={styles.panelText}>
              {status.label ?? 'Opening the game'} ·{' '}
              {Math.round((now - status.stepAt) / 1000)} s on this step,{' '}
              {elapsed} s in all
            </Text>
          ) : null}
          <Text style={styles.panelText}>
            {silent >= SILENT_S
              ? `The game page has not answered for ${silent} s.`
              : 'The game page is still answering.'}
            {status.heapMB !== null
              ? ` Script memory ${status.heapMB} MB.`
              : ''}
          </Text>
          {status.problems.map((problem, i) => (
            <Text key={i} style={styles.panelProblem}>
              {problem}
            </Text>
          ))}
          {device ? (
            <Text style={styles.panelDevice}>
              {device.gpu} ·{' '}
              {device.memoryGB !== null
                ? `${device.memoryGB} GB class`
                : 'memory unknown'}{' '}
              · {device.cores ?? '?'} cores · {device.screen}
            </Text>
          ) : null}
          <View style={styles.panelButtons}>
            <Pressable
              style={[styles.button, styles.small]}
              onPress={retry}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.small, styles.quiet]}
              onPress={onExit}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonText, styles.quietText]}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07090f' },
  web: { flex: 1, backgroundColor: '#07090f' },
  panel: {
    position: 'absolute',
    top: 16,
    right: 16,
    maxWidth: 420,
    padding: 14,
    gap: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(15,18,32,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,183,3,0.5)',
  },
  panelTitle: { color: '#ffb703', fontSize: 15, fontWeight: '700' },
  panelText: { color: '#e6e8f2', fontSize: 13 },
  panelProblem: { color: '#ffb4a8', fontSize: 12 },
  panelDevice: { color: '#9aa0b8', fontSize: 11 },
  panelButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  small: { minWidth: 120, minHeight: 44, marginTop: 0 },
  failure: {
    flex: 1,
    backgroundColor: '#0f1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  failureTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  failureText: {
    color: '#c9cde0',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 460,
  },
  button: {
    minWidth: 180,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#ffb703',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#1a1a1a', fontSize: 15, fontWeight: '700' },
  quiet: { backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 0 },
  quietText: { color: '#fff' },
});
