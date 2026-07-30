"use client";

import { useEffect } from "react";

export default function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        );
      return;
    }

    const isSupportedOrigin =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!isSupportedOrigin) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => registration.update())
      .catch(() => {
        // Installation support should never block the records workspace.
      });
  }, []);

  return null;
}
