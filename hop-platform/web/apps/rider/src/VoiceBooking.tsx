import { useRef, useState } from "react";
import { api } from "@hop/shared/api";
import { speechLocales, t, useLang } from "@hop/shared/i18n";
import type { Point } from "@hop/shared/types";

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const categoryWords: [string, string[]][] = [
  ["bike", ["bike", "motorcycle", "बाइक", "பைக்", "బైక్"]],
  ["auto", ["auto", "rickshaw", "ऑटो", "ஆட்டோ", "ఆటో"]],
  ["mini", ["mini", "मिनी", "மினி"]],
  ["sedan", ["sedan", "सेडान"]],
  ["suv", ["suv", "एसयूवी"]],
];

// Parses "auto from <pickup> to <destination>" (English) or "<pickup> से <destination> तक" (Hindi).
export function parseTrip(text: string) {
  const lower = text.toLowerCase().trim();
  const category = categoryWords.find(([, words]) => words.some((w) => lower.includes(w)))?.[0];
  let pickup = "";
  let dropoff = "";
  const en = lower.match(/(?:^|\s)(?:from\s+(.+?)\s+)?to\s+(.+)$/);
  const hi = lower.match(/(.+?)\s+से\s+(.+)$/);
  if (en) [, pickup = "", dropoff = ""] = en;
  else if (hi) [, pickup, dropoff] = hi;
  const words = categoryWords.flatMap(([, w]) => w);
  const clean = (v: string) =>
    v
      .split(/\s+/)
      .filter((word) => !words.includes(word) && word !== "तक")
      .join(" ")
      .replace(/^(a|an|the|my)\s+/, "")
      .trim();
  return { category, pickup: clean(pickup), dropoff: clean(dropoff) };
}

export default function VoiceBooking({
  area,
  categories,
  onResult,
  notify,
}: {
  area: string;
  categories: string[];
  onResult: (r: { category?: string; pickup?: Point; dropoff?: Point }) => void;
  notify: (s: string) => void;
}) {
  const lang = useLang();
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const rec = useRef<Recognition | null>(null);
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return <p className="muted">Voice booking is not supported by this browser.</p>;

  const lookup = async (q: string): Promise<Point | undefined> => {
    if (q.length < 3) return undefined;
    const places = await api<Point[]>(`/api/places?area_id=${encodeURIComponent(area)}&q=${encodeURIComponent(q)}`);
    return places[0];
  };
  const handle = async (text: string) => {
    setHeard(text);
    const trip = parseTrip(text);
    try {
      const [pickup, dropoff] = await Promise.all([lookup(trip.pickup), lookup(trip.dropoff)]);
      const category = trip.category && categories.includes(trip.category) ? trip.category : undefined;
      if (!pickup && !dropoff && !category) return notify("Could not understand. Try “auto from <place> to <place>”.");
      onResult({ category, pickup, dropoff });
      notify("Trip details filled in. Please review them and confirm the fare before booking.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const start = () => {
    const r = new Ctor();
    r.lang = speechLocales[lang] || "en-IN";
    r.interimResults = false;
    r.onresult = (e) => handle(e.results[0][0].transcript);
    r.onerror = (e) => notify(`Voice input failed: ${e.error}`);
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };
  return (
    <div className="row">
      <button type="button" disabled={!area} onClick={() => (listening ? rec.current?.stop() : start())}>
        {listening ? t("voice.listening") : t("voice.start")}
      </button>
      {heard && <span className="muted">“{heard}”</span>}
    </div>
  );
}
