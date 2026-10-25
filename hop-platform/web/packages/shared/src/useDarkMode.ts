import { useEffect, useState } from "react";

const KEY = "hop.theme";
const initial = () => {
  const saved = localStorage.getItem(KEY);
  if (saved) return saved === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};

export default function useDarkMode() {
  const [dark, setDark] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}
