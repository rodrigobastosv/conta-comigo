import type { Metadata, Viewport } from "next";
import { themeScript } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conta Comigo",
  description: "Histórias que as crianças constroem.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Follows whichever palette is active, so the browser chrome stops being a
  // bright strip above a dark page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf6e8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1613" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Before paint, on purpose: correcting the theme in an effect means a
            white flash in a dark room, at a child who was nearly asleep. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
