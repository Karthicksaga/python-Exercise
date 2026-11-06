// Speak your destination (approved Nov 2026 prototype): Android's own speech recognition through the
// community plugin, in English, Tamil or Hindi. Not offered where the phone can't do it.
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export const VOICE_LANGS = [
  { code: "en-IN", label: "English" },
  { code: "ta-IN", label: "தமிழ்" },
  { code: "hi-IN", label: "हिंदी" },
];

export async function voiceAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    return (await SpeechRecognition.available()).available;
  } catch {
    return false;
  }
}

/** Listens once and returns what was heard ("" if nothing). Asks for the microphone the first time. */
export async function listen(language: string): Promise<string> {
  const perm = await SpeechRecognition.requestPermissions();
  if (perm.speechRecognition !== "granted") throw new Error("Allow the microphone to speak your destination.");
  const result = await SpeechRecognition.start({ language, maxResults: 1, popup: true, partialResults: false, prompt: "Where are you going?" });
  return result.matches?.[0]?.trim() || "";
}
