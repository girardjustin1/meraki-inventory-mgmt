import type { Metadata, Viewport } from "next";
import { Figtree, Instrument_Serif } from "next/font/google";
import { pwaMetadata, pwaViewport } from "~/lib/pwa-metadata";
import "./globals.css";
import { Providers } from "./providers";

const figtree = Figtree({ subsets: ["latin"], display: "swap", variable: "--font-figtree" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], display: "swap", weight: "400", style: "italic", variable: "--font-instrument-serif" });

export const metadata: Metadata = {
  title: "Meraki Inventory",
  robots: { index: false, follow: false },
  ...pwaMetadata,
};

export const viewport: Viewport = pwaViewport;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${figtree.variable} ${instrumentSerif.variable} light-mode`}>
      <body className="bg-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
