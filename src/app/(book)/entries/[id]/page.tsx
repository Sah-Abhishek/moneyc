import { notFound } from "next/navigation";
import { EntryForm } from "@/components/EntryForm";
import { SlateLinker } from "@/components/SlateLinker";
import { dayMonthYear, clock, wallClock, ymOf } from "@/lib/dates";
import { lineTitle } from "@/lib/types";
import { requireUser } from "@/server/app";
import { NotFoundError } from "@/server/services/context";
import { getEntry } from "@/server/services/entries";
import { listAccounts } from "@/server/services/slate";
import { listTags } from "@/server/services/tags";

export const metadata = { title: "A line — Money Control" };

export default async function EntryPage({ params }: PageProps<"/entries/[id]">) {
  const { user, ctx } = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  let entry;
  try {
    entry = await getEntry(ctx, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound(); // also covers other users' lines — no hint they exist
    throw e;
  }
  const ym = ymOf(entry.occurredAt);
  const backHref = ym === ymOf(wallClock(user.timezone)) ? "/" : `/?m=${ym}`;
  const [tags, people] = await Promise.all([listTags(ctx), entry.personId ? [] : listAccounts(ctx)]);

  return (
    <div className="page">
      <div className="section-head">
        <h2>
          {lineTitle(entry)}
          <small>
            {dayMonthYear(entry.occurredAt)} · {clock(entry.occurredAt)} · {entry.source === "wire" ? (entry.auto ? "filed automatically" : "from the wire") : "written by hand"}
          </small>
        </h2>
      </div>
      <EntryForm entry={entry} tags={tags} defaultWhen={entry.occurredAt} backHref={backHref} />
      {!entry.personId && <SlateLinker entryId={entry.id} amount={entry.amount} people={people.map((a) => ({ id: a.id, name: a.name }))} />}
    </div>
  );
}
