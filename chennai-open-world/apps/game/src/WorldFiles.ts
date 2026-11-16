/**
 * Reads the streamed world (TD-16): the index and the roads at start-up, one chunk file at a
 * time afterwards, from `world/` next to the page.
 *
 * Over http(s) that is `fetch`: the dev server, a preview, a hosted build, and the Android app,
 * which serves the page from its assets at `https://appassets.androidplatform.net/assets/game/`
 * through WebViewAssetLoader (see `apps/mobile/src/GameScreen.tsx`).
 *
 * The `file:` branch is a fallback for someone opening the built `dist/index.html` straight from
 * disk: Chromium's `fetch` never reads `file:` URLs, but `XMLHttpRequest` can where the browser
 * allows file pages to read files. The app no longer loads from `file:`.
 */
import type { ChunkSource } from "@cow/game-engine";
import type { RailFile } from "@cow/rail";
import { chunkFile, decodeChunk, decodeRoads, worldFromIndex, type ChunkData, type WorldIndexFile, type WorldMap } from "@cow/game-world";

const BASE = "world/";

function readFile(path: string, type: "arraybuffer" | "text"): Promise<ArrayBuffer | string> {
  const url = new URL(BASE + path, document.baseURI).href;
  if (location.protocol !== "file:") {
    return fetch(url).then((response): Promise<ArrayBuffer | string> => {
      if (!response.ok) throw new Error(`Could not read ${path} (${response.status}).`);
      return type === "text" ? response.text() : response.arrayBuffer();
    });
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = type;
    // File reads report status 0 on success.
    request.onload = () => (request.status === 0 || request.status === 200) && request.response ? resolve(request.response as ArrayBuffer | string) : reject(new Error(`Could not read ${path}.`));
    request.onerror = () => reject(new Error(`Could not read ${path}.`));
    request.send();
  });
}

export interface LoadedWorld {
  readonly map: WorldMap;
  readonly chunks: ChunkSource;
  /** Size of the start-up files, bytes (for the debug snapshot). */
  readonly startupBytes: number;
}

export async function loadWorld(): Promise<LoadedWorld> {
  const indexText = (await readFile("index.json", "text")) as string;
  const index = JSON.parse(indexText) as WorldIndexFile & { readonly roadNames: readonly string[] };
  const roadBytes = (await readFile(index.roads, "arraybuffer")) as ArrayBuffer;
  const map = worldFromIndex(index, decodeRoads(roadBytes, index.roadNames));
  const sizes = new Map(index.chunks.map(([col, row, size]) => [`${col},${row}`, size]));
  const chunks: ChunkSource = {
    load: async (ref): Promise<ChunkData> => {
      // Squares with only road surface have no file.
      if (!sizes.get(ref.key)) return { ...ref, buildings: [], trees: [], areas: [] };
      const bytes = (await readFile(chunkFile(ref.col, ref.row), "arraybuffer")) as ArrayBuffer;
      return decodeChunk(bytes, map.bounds, map.chunkSize);
    },
  };
  return { map, chunks, startupBytes: indexText.length + roadBytes.byteLength };
}

/**
 * The railway (`world/rail.json`, built by `npm run build:rail`): tracks, lines and stations.
 * Read like the chunk files, so the APK serves it from its assets (TD-16). The game still
 * starts without it (a broken install loses the railway, not the city).
 */
export async function loadRail(): Promise<RailFile | null> {
  try {
    return JSON.parse((await readFile("rail.json", "text")) as string) as RailFile;
  } catch (error) {
    console.warn("Railway file unavailable; the game runs without trains.", error);
    return null;
  }
}
