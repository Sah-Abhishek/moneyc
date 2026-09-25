import { EntryForm } from "@/components/EntryForm";
import { isWallClock, wallClock } from "@/lib/dates";
import { requireUser } from "@/server/app";
import { listTags } from "@/server/services/tags";

export const metadata = { title: "A new line — Money Control" };

export default async function NewLinePage({ searchParams }: PageProps<"/new">) {
  const { user, ctx } = await requireUser();
  const [sp, tags] = await Promise.all([searchParams, listTags(ctx)]);
  const now = wallClock(user.timezone);
  // ?date=2026-08-01 pre-fills a past month's date (from the ledger's "Add a line to August").
  const date = typeof sp.date === "string" && isWallClock(`${sp.date}T12:00:00`) && sp.date <= now.slice(0, 10) ? `${sp.date}T12:00:00` : now;
  const backHref = date === now ? "/" : `/?m=${date.slice(0, 7)}`;

  return (
    <div className="page">
      <div className="section-head">
        <h2>
          A new line <small>Written by hand</small>
        </h2>
      </div>
      <EntryForm tags={tags} defaultWhen={date} backHref={backHref} />
    </div>
  );
}
