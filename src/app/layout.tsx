import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { MarginRule } from "@/components/shell";
import { Masthead } from "@/components/register/masthead";
import { NotationProvider } from "@/components/register/notation";
import { readUiPrefs } from "@/server/ui-prefs";

/**
 * Archivo IS a variable font in Next's bundled Google manifest (axes: wdth,
 * wght), so no `weight` is needed. Grotesque, high x-height, tight apertures —
 * it sets a dense ledger without the signage warmth the previous face carried.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

/**
 * IBM Plex Mono is NOT variable in that manifest — the weight array is
 * REQUIRED or the build fails. It sets every numeral, date, code, eyebrow and
 * stamp: the data face of the whole Register.
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Internship Scout",
  description: "Summer 2027 internship discovery and tracking for F-1 students",
};

/**
 * Every one of the thirteen routes already declares `force-dynamic`, so this
 * changes no route's rendering mode — it states the layout's own requirement,
 * and keeps the preference read below out of the build-time render (which
 * would otherwise query the database while compiling).
 */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { notation } = await readUiPrefs();

  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the persisted theme before first paint so an overridden
            theme never flashes the system one. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}`,
          }}
        />
      </head>
      <body className="min-h-full bg-paper text-ink">
        <NotationProvider value={notation}>
          <Masthead />
          {/* The margin gutter and its carmine double rule. `max-w-6xl` is
              gone: the Register's density argument requires the full width. */}
          <div className="relative pl-[var(--margin-rule)]">
            <MarginRule />
            <main className="mx-auto max-w-[1800px] px-[var(--gutter)] pb-[calc(var(--footnote-h)+16px)] pt-1">
              {children}
            </main>
          </div>
        </NotationProvider>
      </body>
    </html>
  );
}
