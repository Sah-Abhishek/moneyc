import { TagEditor, NewTagForm } from "@/components/TagEditor";
import { requireUser } from "@/server/app";
import { listTags, tagUsage } from "@/server/services/tags";

export const metadata = { title: "Tags — Money Control" };

export default async function TagsPage() {
  const { ctx } = await requireUser();
  const [tags, usage] = await Promise.all([listTags(ctx), tagUsage(ctx)]);

  return (
    <div className="page">
      <div className="section-head">
        <h2>
          Tags <small>The stamps you put on lines</small>
        </h2>
      </div>
      <p className="page-lede">
        Rename a stamp and every line wearing it changes with it. Merging moves one tag&apos;s lines and rules onto another. Deleting a
        tag leaves its lines in the book, untagged.
      </p>
      {tags.length === 0 && (
        <div className="empty-state">
          <h3>No tags yet.</h3>
          <p>Add the first one below. Tags are how the book knows where the money went.</p>
        </div>
      )}
      <ul style={{ listStyle: "none", borderTop: "1px solid var(--ink-base)" }}>
        {tags.map((t) => (
          <TagEditor key={t.id} tag={t} usage={usage.get(t.id) ?? { entries: 0, rules: 0 }} others={tags.filter((o) => o.id !== t.id)} />
        ))}
      </ul>
      <NewTagForm />
    </div>
  );
}
