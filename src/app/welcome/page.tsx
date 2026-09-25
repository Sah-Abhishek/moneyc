import Image from "next/image";
import { redirect } from "next/navigation";
import { longDate, wallClock } from "@/lib/dates";
import { currentUser } from "@/server/app";
import { loadConfig } from "@/server/env";
import s from "./welcome.module.css";

export const metadata = { title: "Money Control — sign in" };

const ERRORS: Record<string, string> = {
  denied: "You closed Google's window before allowing access. Nothing was saved — try again when you're ready.",
  expired: "That sign-in link had expired or was already used. Start again below.",
  unverified: "Google says that email address isn't verified yet. Verify it with Google, then try again.",
  network: "We couldn't reach Google just now. Check your connection and try again.",
  google: "Google didn't complete the sign-in. Try again; if it keeps happening, try in a private window.",
  not_configured: "Sign-in isn't set up on this server yet. Whoever runs it needs to add the Google OAuth settings.",
};

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  if (await currentUser()) redirect("/");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] ?? ERRORS.google : null;
  const deleted = sp.deleted === "1";
  const configured = loadConfig().ok;

  return (
    <div className={s.page}>
      <header className={s.cover}>
        <div className={s.folio}>
          <span>Vol. 1 · No. 1</span>
          <span>{longDate(wallClock("Asia/Kolkata"))}</span>
          <span>Personal edition</span>
        </div>
        <div className="rule" />
        <div className={s.masthead}>
          <h1 className={s.title}>Money Control</h1>
          <p className={s.tagline}>A personal ledger that reads your bank mail so you don’t have to.</p>
        </div>
        <div className="double-rule" />
      </header>

      <main className={s.body}>
        <div className={s.left}>
          <div className={s.columns}>
            <Column n="One" title="It reads the mail">
              Every UPI alert, card swipe and NEFT credit your bank already emails you gets parsed into a line — payee, amount, channel,
              reference, time. You confirm it; the book files it.
            </Column>
            <Column n="Two" title="It keeps the book">
              Entries land in a ruled ledger with a running balance down the right margin. Stamp them with tags, budget against them, and
              watch the month burn down day by day.
            </Column>
            <Column n="Three" title="It settles the slate">
              Money you lent friends and money you borrowed from family sits on an open slate. When a repayment turns up in your inbox, it
              clears the debt for you.
            </Column>
          </div>

          <figure className={s.specimen} aria-label="An example of a bank alert becoming a ledger line">
            <div className={s.specHead}>
              <span className="eyebrow">What actually happens</span>
              <span className="caption">An example · one mail · one line · no typing</span>
            </div>
            <div className={s.specBody}>
              <div className={s.mail}>
                <p className={s.mailFrom}>
                  <Image src="/icons/mail-faint.svg" alt="" width={12} height={12} />
                  Bank alerts · 11:18 AM
                </p>
                <pre className={s.mailText}>{`Dear Customer,
Your fund transfer request through UPI has been
processed successfully.

1. Payee Name : A SHOPKEEPER
2. Amount : Rs. 10.00
3. Channel : UPI
4. Transaction ID/RRN : 626xxxxx72
5. Date and Time : 22-09-2026 11:18:42`}</pre>
              </div>
              <div className={s.arrow} aria-hidden>
                <span className={s.arrowBox}>
                  <Image src="/icons/arrow-paper.svg" alt="" width={15} height={15} />
                </span>
                <span>Parsed</span>
              </div>
              <div className={s.line}>
                <p className="caption">The line it files</p>
                <div className="rule-hair" />
                <p className={s.lineDate}>22 SEP · 11:18</p>
                <p className={s.linePayee}>
                  A SHOPKEEPER <span className="auto-badge">● AUTO</span>
                </p>
                <p className={s.lineMeta}>UPI · RRN 626xxxxx72</p>
                <p className={s.lineRow}>
                  <span className="stamp" data-color="spend">
                    Food &amp; delivery
                  </span>
                  <span className={s.lineAmount}>−10.00</span>
                </p>
              </div>
            </div>
          </figure>
        </div>

        <section className={s.door} aria-labelledby="door-title">
          <p className={s.doorEyebrow}>The only door</p>
          <h2 id="door-title" className={s.doorTitle}>
            There is one way in.
          </h2>
          <p className={s.doorCopy}>
            Money Control works by reading the transaction mail your bank already sends you. That needs Google — so Google is the only
            door. Nothing to set, no password to forget.
          </p>

          {deleted && (
            <p className={s.notice} role="status">
              Your account and everything in it has been deleted, and our access to your mail has been revoked.
            </p>
          )}
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}

          {configured ? (
            <a className={s.google} href="/auth/google">
              <Image src="/icons/google.svg" alt="" width={19} height={19} />
              Continue with Google
            </a>
          ) : (
            <span className={s.google} aria-disabled="true">
              <Image src="/icons/google.svg" alt="" width={19} height={19} />
              Sign-in not set up on this server
            </span>
          )}

          <ul className={s.promises}>
            <li>
              <Image src="/icons/check-bright.svg" alt="" width={13} height={13} />
              Read-only, and only mail from bank and wallet senders
            </li>
            <li>
              <Image src="/icons/check-bright.svg" alt="" width={13} height={13} />
              Your Google password never reaches this app
            </li>
            <li>
              <Image src="/icons/check-bright.svg" alt="" width={13} height={13} />
              Revoke the access any time, here or from your Google account
            </li>
          </ul>

          <div className={s.doorFoot}>
            <a href="#privacy">Privacy note</a>
            <a href="#why" className={s.why}>
              Why only Google?
              <Image src="/icons/arrow-bright.svg" alt="" width={10} height={10} />
            </a>
          </div>
        </section>
      </main>

      <section className={s.notes}>
        <div id="why">
          <h3 className="eyebrow">Why only Google?</h3>
          <p>
            The wire — the part that turns bank alerts into ledger lines — needs to read those alerts, and they arrive in Gmail. A separate
            password would add a second door without removing the need for the first. If you&apos;d rather not share mail access, Money
            Control can&apos;t do its main job for you.
          </p>
        </div>
        <div id="privacy">
          <h3 className="eyebrow">Privacy note</h3>
          <p>
            We ask Google for read-only mail access and search only for mail from bank and wallet senders (plus any sender you add in
            Rules). Alerts that aren&apos;t transactions are skipped and their text is never stored. Your Google tokens are encrypted at
            rest. Disconnect Gmail or delete your account from Settings at any time; deleting removes everything.
          </p>
        </div>
      </section>

      <footer className={s.footer}>
        <div>
          <span className="eyebrow">No bank logins</span>
          <span className="caption">We never ask for net-banking credentials</span>
        </div>
        <div>
          <span className="eyebrow">No password</span>
          <span className="caption">Google holds the key, not us</span>
        </div>
        <div>
          <span className="eyebrow">Read-only Gmail scope</span>
          <span className="caption">We can read the alerts, nothing else</span>
        </div>
      </footer>
    </div>
  );
}

function Column({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className={s.col}>
      <h2 className={s.colTitle}>
        <span className={s.colN}>{n}</span> {title}
      </h2>
      <div className="rule-hair" />
      <p className={s.colBody}>{children}</p>
    </div>
  );
}
