import type { Metadata } from "next";
import type { Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import PwaRegistration from "@/components/PwaRegistration";
import ThemeProvider from "@/components/ThemeProvider";
import { siteDescription, siteName } from "@/lib/site";
import { themeBootstrapScript } from "@/lib/theme";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  applicationName: siteName,
  title: {
    default: "Custody Folio | Custody Logs and Evidence",
    template: "%s | Custody Folio",
  },
  description: siteDescription,
  metadataBase: new URL("https://custodyfolio.com"),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/app-icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/app-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Custody Folio",
  },
  openGraph: {
    type: "website",
    url: "https://custodyfolio.com",
    siteName,
    title: "Custody Folio",
    description: siteDescription,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: "https://custodyfolio.com/",
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
        />
      </head>
      <body className="min-h-screen bg-slate-100 text-slate-950 antialiased overflow-x-hidden">
        <ThemeProvider>
          <PwaRegistration />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
