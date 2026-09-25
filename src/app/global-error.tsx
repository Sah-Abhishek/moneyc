"use client";

// Last resort when even the root layout fails. Plain HTML: no app styles are guaranteed here.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f4f1e8", color: "#16150f", padding: 48 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Money Control couldn&apos;t start.</h1>
        <p>Your data is safe. Try again in a moment.{error.digest && ` Reference: ${error.digest}.`}</p>
        <button type="button" onClick={reset} style={{ padding: "10px 16px", background: "#16150f", color: "#f4f1e8", border: 0 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
