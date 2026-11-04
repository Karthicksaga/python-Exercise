// The plugin's event channel, used for the "onMapLoaded" event added by scripts/patch-google-maps.mjs.
declare module "@capacitor/google-maps/dist/esm/implementation" {
  import type { PluginListenerHandle } from "@capacitor/core";
  export const CapacitorGoogleMaps: {
    addListener(event: "onMapLoaded", callback: (data: { mapId: string }) => void): Promise<PluginListenerHandle>;
  };
}
