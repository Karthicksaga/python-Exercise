import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { useMantineColorScheme } from "@mantine/core";
import { useEffect, useState } from "react";

const KEY = "hop.theme";
const initial = () => {
  const saved = localStorage.getItem(KEY);
  if (saved) return saved === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

export default function useDarkMode() {
  const [dark, setDark] = useState(initial);
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    setColorScheme(dark ? "dark" : "light");
    if (Capacitor.getPlatform() === "android") {
      void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
    }
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark, setColorScheme]);
  return [dark, () => setDark((d) => !d)] as const;
}
