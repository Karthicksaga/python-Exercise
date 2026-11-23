import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function MainMenu({ onPlay }: { onPlay: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.kicker}>ANNA NAGAR · CHENNAI</Text>
      <Text style={styles.title}>Chennai Open World</Text>
      <Text style={styles.subtitle}>Walk, drive and fight your way through ten stages.</Text>
      <Pressable
        style={({ pressed }) => [styles.play, pressed && styles.pressed]}
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel="Play">
        <Text style={styles.playText}>PLAY</Text>
      </Pressable>
      <Text style={styles.note}>Early build · map data © OpenStreetMap contributors</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1220', alignItems: 'center', justifyContent: 'center', padding: 24 },
  kicker: { color: '#ffb703', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#fff', fontSize: 40, fontWeight: '800', marginTop: 6 },
  subtitle: { color: '#c9cde0', fontSize: 15, marginTop: 6 },
  play: { marginTop: 28, minWidth: 220, minHeight: 56, borderRadius: 14, backgroundColor: '#ffb703', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  playText: { color: '#1a1a1a', fontSize: 18, fontWeight: '800', letterSpacing: 2 },
  note: { color: '#7f85a3', fontSize: 12, marginTop: 22 },
});
