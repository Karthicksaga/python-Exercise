import { useSyncExternalStore } from "react";
import { more, moreEn } from "./i18n.more";
import { money as moneyT, moneyEn } from "./i18n.money";

export const languages: [string, string][] = [
  ["en", "English"], ["hi", "हिन्दी"], ["ta", "தமிழ்"], ["te", "తెలుగు"], ["kn", "ಕನ್ನಡ"],
  ["ml", "മലയാളം"], ["bn", "বাংলা"], ["mr", "मराठी"], ["gu", "ગુજરાતી"], ["pa", "ਪੰਜਾਬੀ"],
];
export const speechLocales: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN", kn: "kn-IN",
  ml: "ml-IN", bn: "bn-IN", mr: "mr-IN", gu: "gu-IN", pa: "pa-IN",
};

type Dict = Record<string, string>;
const en: Dict = {
  "nav.ride": "Book a ride",
  "nav.driver": "Drive with Hop",
  "nav.history": "Your rides",
  "nav.support": "Support",
  "nav.profile": "Profile",
  "nav.more": "Safety & more",
  "nav.operator": "Operations",
  "book.pay": "Pay your driver",
  "book.cash": "Cash",
  "book.upi": "Direct UPI",
  "book.riding": "Who is riding?",
  "book.me": "Me",
  "book.other": "Someone else",
  "book.favFirst": "Offer to my favorite drivers first",
  "voice.start": "🎤 Speak your trip",
  "voice.listening": "Listening…",
  "more.sos": "🚨 SOS",
  "more.share": "Share live trip",
  "more.inbox": "Inbox",
  "more.prefs": "Language & accessibility",
};
// Core strings only; other keys and languages fall back to English.
const dictionaries: Record<string, Dict> = {
  en,
  hi: {
    "nav.ride": "सवारी बुक करें", "nav.driver": "हॉप के साथ चलाएँ", "nav.history": "आपकी सवारियाँ",
    "nav.support": "सहायता", "nav.profile": "प्रोफ़ाइल", "nav.more": "सुरक्षा और अधिक", "nav.operator": "संचालन",
    "book.pay": "ड्राइवर को भुगतान करें", "book.cash": "नकद", "book.upi": "सीधे UPI",
    "book.riding": "कौन सवारी कर रहा है?", "book.me": "मैं", "book.other": "कोई और",
    "book.favFirst": "पहले मेरे पसंदीदा ड्राइवरों को भेजें",
    "voice.start": "🎤 अपनी यात्रा बोलें", "voice.listening": "सुन रहा हूँ…",
    "more.sos": "🚨 एसओएस", "more.share": "लाइव यात्रा साझा करें", "more.inbox": "इनबॉक्स", "more.prefs": "भाषा और सुलभता",
  },
  ta: {
    "nav.ride": "சவாரி பதிவு", "nav.driver": "ஹாப்புடன் ஓட்டுங்கள்", "nav.history": "உங்கள் சவாரிகள்",
    "nav.support": "ஆதரவு", "nav.profile": "சுயவிவரம்", "nav.more": "பாதுகாப்பு & மேலும்", "nav.operator": "செயல்பாடுகள்",
    "book.pay": "ஓட்டுநருக்கு பணம் செலுத்துங்கள்", "book.cash": "பணம்", "book.upi": "நேரடி UPI",
    "book.riding": "யார் பயணிக்கிறார்?", "book.me": "நான்", "book.other": "வேறொருவர்",
    "book.favFirst": "முதலில் என் விருப்ப ஓட்டுநர்களுக்கு அனுப்பு",
    "voice.start": "🎤 உங்கள் பயணத்தைச் சொல்லுங்கள்", "voice.listening": "கேட்கிறேன்…",
    "more.sos": "🚨 SOS", "more.share": "நேரடி பயணத்தைப் பகிர்", "more.inbox": "இன்பாக்ஸ்", "more.prefs": "மொழி & அணுகல்",
  },
  te: {
    "nav.ride": "రైడ్ బుక్ చేయండి", "nav.driver": "హాప్‌తో నడపండి", "nav.history": "మీ రైడ్‌లు",
    "nav.support": "సహాయం", "nav.profile": "ప్రొఫైల్", "nav.more": "భద్రత & మరిన్ని", "nav.operator": "కార్యకలాపాలు",
    "book.pay": "డ్రైవర్‌కు చెల్లించండి", "book.cash": "నగదు", "book.upi": "నేరుగా UPI",
    "book.riding": "ఎవరు ప్రయాణిస్తున్నారు?", "book.me": "నేను", "book.other": "మరొకరు",
    "book.favFirst": "ముందుగా నా ఇష్టమైన డ్రైవర్లకు పంపండి",
    "voice.start": "🎤 మీ ప్రయాణాన్ని చెప్పండి", "voice.listening": "వింటున్నాను…",
    "more.sos": "🚨 SOS", "more.share": "లైవ్ ట్రిప్ షేర్ చేయండి", "more.inbox": "ఇన్‌బాక్స్", "more.prefs": "భాష & అందుబాటు",
  },
  kn: {
    "nav.ride": "ಸವಾರಿ ಬುಕ್ ಮಾಡಿ", "nav.driver": "ಹಾಪ್‌ನೊಂದಿಗೆ ಚಲಾಯಿಸಿ", "nav.history": "ನಿಮ್ಮ ಸವಾರಿಗಳು",
    "nav.support": "ಬೆಂಬಲ", "nav.profile": "ಪ್ರೊಫೈಲ್", "nav.more": "ಸುರಕ್ಷತೆ ಮತ್ತು ಇನ್ನಷ್ಟು", "nav.operator": "ಕಾರ್ಯಾಚರಣೆ",
    "book.pay": "ಚಾಲಕರಿಗೆ ಪಾವತಿಸಿ", "book.cash": "ನಗದು", "book.upi": "ನೇರ UPI",
    "book.riding": "ಯಾರು ಪ್ರಯಾಣಿಸುತ್ತಿದ್ದಾರೆ?", "book.me": "ನಾನು", "book.other": "ಬೇರೆಯವರು",
    "book.favFirst": "ಮೊದಲು ನನ್ನ ನೆಚ್ಚಿನ ಚಾಲಕರಿಗೆ ಕಳುಹಿಸಿ",
    "voice.start": "🎤 ನಿಮ್ಮ ಪ್ರಯಾಣ ಹೇಳಿ", "voice.listening": "ಆಲಿಸುತ್ತಿದ್ದೇನೆ…",
    "more.sos": "🚨 SOS", "more.share": "ಲೈವ್ ಟ್ರಿಪ್ ಹಂಚಿಕೊಳ್ಳಿ", "more.inbox": "ಇನ್‌ಬಾಕ್ಸ್", "more.prefs": "ಭಾಷೆ ಮತ್ತು ಪ್ರವೇಶಸಾಧ್ಯತೆ",
  },
  ml: {
    "nav.ride": "റൈഡ് ബുക്ക് ചെയ്യുക", "nav.driver": "ഹോപ്പിനൊപ്പം ഓടിക്കുക", "nav.history": "നിങ്ങളുടെ റൈഡുകൾ",
    "nav.support": "സഹായം", "nav.profile": "പ്രൊഫൈൽ", "nav.more": "സുരക്ഷയും മറ്റും", "nav.operator": "പ്രവർത്തനങ്ങൾ",
    "book.pay": "ഡ്രൈവർക്ക് പണം നൽകുക", "book.cash": "പണം", "book.upi": "നേരിട്ടുള്ള UPI",
    "book.riding": "ആരാണ് യാത്ര ചെയ്യുന്നത്?", "book.me": "ഞാൻ", "book.other": "മറ്റൊരാൾ",
    "book.favFirst": "ആദ്യം എന്റെ പ്രിയപ്പെട്ട ഡ്രൈവർമാർക്ക് അയയ്ക്കുക",
    "voice.start": "🎤 നിങ്ങളുടെ യാത്ര പറയൂ", "voice.listening": "കേൾക്കുന്നു…",
    "more.sos": "🚨 SOS", "more.share": "ലൈവ് ട്രിപ്പ് പങ്കിടുക", "more.inbox": "ഇൻബോക്സ്", "more.prefs": "ഭാഷയും ആക്സസിബിലിറ്റിയും",
  },
};

Object.assign(en, moreEn, moneyEn);
for (const [code, extra] of Object.entries(more)) dictionaries[code] = { ...dictionaries[code], ...extra };
for (const [code, extra] of Object.entries(moneyT)) dictionaries[code] = { ...dictionaries[code], ...extra };

const storeKey = "hop_lang";
let lang = (() => {
  try {
    const saved = localStorage.getItem(storeKey) || "en";
    return languages.some(([c]) => c === saved) ? saved : "en";
  } catch {
    return "en";
  }
})();
const listeners = new Set<() => void>();

export function setLang(next: string) {
  if (next === lang || !languages.some(([c]) => c === next)) return;
  lang = next;
  try {
    localStorage.setItem(storeKey, next);
  } catch {
    /* storage unavailable */
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}
export function getLang() {
  return lang;
}
export function applyLargeText(on: boolean) {
  document.documentElement.style.fontSize = on ? "120%" : "";
}
export function t(key: string, vars?: Record<string, string | number>): string {
  const text = dictionaries[lang]?.[key] ?? en[key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => String(vars[k] ?? m)) : text;
}
// Subscribing re-renders the caller when the language changes.
export function useLang() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang,
  );
}
