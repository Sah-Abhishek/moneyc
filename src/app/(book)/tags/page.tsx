import { TagEditor, NewTagForm } from "@/components/TagEditor";
import { GroupEditor, NewGroupForm } from "@/components/TagGroups";
import { requireUser } from "@/server/app";
import { listGroups } from "@/server/services/tagGroups";
import { listTags, tagUsage } from "@/server/services/tags";

export const metadata = { title: "Tags — Money Control" };

export default async function TagsPage() {
  const { ctx } = await requireUser();
  const [tags, usage, groups] = await Promise.all([listTags(ctx), tagUsage(ctx), listGroups(ctx)]);
  const spending = tags.filter((t) => t.kind === "spend");

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

      <div className="section-head" id="groups" style={{ marginTop: 56 }}>
        <h2>
          Groups <small>Tags read together</small>
        </h2>
      </div>
      <p className="page-lede">
        Put spending tags under one name, like Health for Healthy, Junk and Leisure. Reports then show what the group cost and how it
        splits across its tags, and the ledger can show only its lines. A tag can be in more than one group.
      </p>
      {groups.length === 0 && (
        <div className="empty-state">
          <h3>No groups yet.</h3>
          <p>Add one below and pick the tags it gathers.</p>
        </div>
      )}
      {groups.length > 0 && (
        <ul style={{ listStyle: "none", borderTop: "1px solid var(--ink-base)" }}>
          {groups.map((g) => (
            <GroupEditor key={g.id} group={g} tags={spending} />
          ))}
        </ul>
      )}
      <NewGroupForm tags={spending} />
    </div>
  );
}
