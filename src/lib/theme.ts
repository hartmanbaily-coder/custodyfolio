export const themeStorageKey = "custody-folio-theme";

export const themePreferences = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const themeOptions: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "System",
    description: "Match this device's appearance setting.",
  },
  {
    value: "light",
    label: "Light",
    description: "Always use the light appearance.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always use the dark appearance.",
  },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && themePreferences.includes(value as ThemePreference);
}

export const themeBootstrapScript = `(() => {
  try {
    const key = ${JSON.stringify(themeStorageKey)};
    const stored = localStorage.getItem(key);
    const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const resolved = preference === "system"
      ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : preference;
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.style.colorScheme = resolved;
  } catch {
    document.documentElement.dataset.themePreference = "system";
  }
})();`;
