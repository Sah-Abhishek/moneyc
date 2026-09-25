import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

// Three voices, no more: serif for money and titles, sans for names and UI,
// mono for anything the bank would have typed.
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Money Control",
  description: "A personal ledger that reads the wire.",
  applicationName: "Money Control",
  // Installed to an iPhone home screen, it opens without Safari's chrome.
  appleWebApp: { capable: true, title: "Money Control", statusBarStyle: "default" },
  // Amounts and reference numbers are digits; don't let iOS turn them into phone links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f4f1e8",
  // Lets env(safe-area-inset-*) report real values; the tab bar and toasts rely on it.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
