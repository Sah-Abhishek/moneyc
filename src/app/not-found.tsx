import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page" style={{ paddingTop: 64, maxWidth: 720 }}>
      <p className="eyebrow" style={{ color: "var(--ink-muted)" }}>
        Money Control
      </p>
      <h1 className="serif" style={{ fontSize: 56, margin: "8px 0 20px" }}>
        Not in the book.
      </h1>
      <div className="double-rule" />
      <p className="page-lede" style={{ marginTop: 24 }}>
        That page or line doesn&apos;t exist — it may have been deleted, or the link is wrong.
      </p>
      <Link href="/" className="btn btn-ink">
        Back to the ledger
      </Link>
    </div>
  );
}
