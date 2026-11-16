/**
 * Reads the streamed world (TD-16): the index and the roads at start-up, one chunk file at a
 * time afterwards, from `world/` next to the page.
 *
 * In a browser (dev server, preview, a hosted build) that is `fetch`. In the Android app the page
 * is a `file://` URL, where Chromium's `fetch` refuses to read files; `XMLHttpRequest` can, when
 * the WebView allows file access from file URLs (`allowFileAccessFromFileURLs` in
 * `apps/mobile/src/GameScreen.tsx`). So `file:` pages use XHR.
 */
import type { ChunkSource } from "@cow/game-engine";
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
