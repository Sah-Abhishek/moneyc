"use client";

import Link from "next/link";
import { useEffect } from "react";

// A page failed to render. The book itself is safe; offer a retry and a way home.
export default function BookError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page.error", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <div className="empty-state" role="alert">
        <h3>This page didn&apos;t load.</h3>
        <p>
          Something went wrong on our side while putting it together. Your book is safe — nothing was changed.
          {error.digest && <> If it keeps happening, mention reference <code>{error.digest}</code>.</>}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-ink" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-line">
            Back to the ledger
          </Link>
        </div>
      </div>
    </div>
  );
}
