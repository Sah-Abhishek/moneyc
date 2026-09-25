import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Three voices, no more: serif for money and titles, sans for names and UI,
// mono for anything the bank would have typed.
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Money Control",
  description: "A personal ledger that reads the wire.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
