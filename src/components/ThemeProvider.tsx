"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  isThemePreference,
  themeStorageKey,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const darkModeMediaQuery = "(prefers-color-scheme: dark)";
const themeChangeEvent = "custody-folio-theme-change";

function resolvedThemeFor(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(darkModeMediaQuery).matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolvedTheme = resolvedThemeFor(preference);
  const root = document.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.dataset.theme = resolvedTheme;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolvedTheme;
  return resolvedTheme;
}

function notifyNativeAppearance(preference: ThemePreference) {
  window.webkit?.messageHandlers?.custodyFolioAppearance?.postMessage({
    action: "setAppearance",
    preference,
  });
}

function getThemeSnapshot() {
  const preference = isThemePreference(document.documentElement.dataset.themePreference)
    ? document.documentElement.dataset.themePreference
    : "system";
  const resolvedTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  return `${preference}:${resolvedTheme}`;
}

function getServerThemeSnapshot() {
  return "system:light";
}

function subscribeToTheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(darkModeMediaQuery);
  const handleSystemAppearanceChange = () => {
    if (document.documentElement.dataset.themePreference !== "system") return;
    applyTheme("system");
    onStoreChange();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== themeStorageKey || !isThemePreference(event.newValue)) return;
    applyTheme(event.newValue);
    notifyNativeAppearance(event.newValue);
    onStoreChange();
  };

  mediaQuery.addEventListener("change", handleSystemAppearanceChange);
  window.addEventListener("storage", handleStorage);
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => {
    mediaQuery.removeEventListener("change", handleSystemAppearanceChange);
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );
  const [preferenceValue, resolvedThemeValue] = snapshot.split(":");
  const preference = isThemePreference(preferenceValue) ? preferenceValue : "system";
  const resolvedTheme: ResolvedTheme = resolvedThemeValue === "dark" ? "dark" : "light";

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    localStorage.setItem(themeStorageKey, nextPreference);
    applyTheme(nextPreference);
    notifyNativeAppearance(nextPreference);
    window.dispatchEvent(new Event(themeChangeEvent));
  }, []);

  useEffect(() => {
    notifyNativeAppearance(preference);
  }, [preference]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider.");
  return context;
}
