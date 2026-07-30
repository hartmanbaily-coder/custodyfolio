"use client";

import { useTheme } from "@/components/ThemeProvider";
import { themeOptions, type ThemePreference } from "@/lib/theme";

export default function ThemeSelector() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const selectedOption = themeOptions.find((option) => option.value === preference);

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-slate-700" htmlFor="appearance">
        Appearance
      </label>
      <select
        id="appearance"
        className="input"
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-xs leading-5 text-slate-500">
        {selectedOption?.description} Currently showing {resolvedTheme} mode.
      </p>
    </div>
  );
}
