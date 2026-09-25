import type { MetadataRoute } from "next";

// Install metadata. Colours are the paper/ink tokens from globals.css, spelled
// out because the manifest is read by the OS, not by the stylesheet.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Money Control",
    short_name: "Money Control",
    description: "A personal ledger that reads the wire.",
    lang: "en-IN",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#f4f1e8",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New entry", url: "/new", description: "Write a line in the ledger" },
      { name: "The wire", url: "/wire", description: "Bank mail waiting to be confirmed" },
      { name: "The slate", url: "/slate", description: "Money lent and borrowed" },
    ],
  };
}
