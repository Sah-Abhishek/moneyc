"use client";

import Link from "next/link";
import { useState } from "react";
import { createGroupAction, deleteGroupAction, updateGroupAction } from "@/app/actions/book";
import type { Tag, TagGroup } from "@/lib/types";
import { ConfirmButton, FieldError, FormError } from "./ui/Confirm";
import { useToast } from "./ui/Toaster";
import { callAction, useSubmit } from "./ui/useSubmit";
import s from "./TagEditor.module.css";

// Groups gather spending tags under one name ("Health": Healthy, Junk,
// Leisure) so a month can be read through them on Reports and the Ledger.

function TagChecklist({ tags, chosen, invalid }: { tags: Tag[]; chosen: number[]; invalid?: boolean }) {
  return (
    <fieldset className={s.checklist} aria-invalid={invalid || undefined}>
      <legend className="eyebrow">Tags in the group</legend>
      {tags.map((t) => (
        <label key={t.id} className={s.check}>
          <input type="checkbox" name="tagIds" value={t.id} defaultChecked={chosen.includes(t.id)} />
          <span className="stamp" data-color={t.color}>
            {t.name}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function GroupEditor({ group, tags }: { group: TagGroup; tags: Tag[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const save = useSubmit(updateGroupAction, { onSuccess: (r) => { toast({ tone: "info", message: r.message ?? "Saved." }); setOpen(false); } });
  const members = group.tagIds.map((id) => tags.find((t) => t.id === id)).filter((t): t is Tag => !!t);

  return (
    <li className={s.row} id={`group-${group.id}`}>
      <div className={s.summary}>
        <span className={s.groupName}>{group.name}</span>
        <span className={s.groupTags}>
          {members.map((t) => (
            <span key={t.id} className="stamp" data-color={t.color}>
              {t.name}
            </span>
          ))}
        </span>
        <span className={s.meta}>
          <Link href={`/reports?group=${group.id}#groups`}>Report</Link> · <Link href={`/?group=${group.id}`}>Lines</Link>
        </span>
        <button type="button" className="btn btn-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className={s.editor}>
          <form onSubmit={save.onSubmit} className={s.form} noValidate>
            <input type="hidden" name="id" value={group.id} />
            <label className={s.field}>
              <span className="eyebrow">Name</span>
              <input name="name" className="input" defaultValue={group.name} maxLength={40} aria-invalid={!!save.fieldErrors.name || undefined} />
              <FieldError id={`group-name-${group.id}`} message={save.fieldErrors.name} />
            </label>
            <div className={s.wide}>
              <TagChecklist tags={tags} chosen={group.tagIds} invalid={!!save.fieldErrors.tagIds} />
              <FieldError id={`group-tags-${group.id}`} message={save.fieldErrors.tagIds} />
            </div>
            <FormError message={save.error} />
            <div className={s.buttons}>
              <button type="submit" className="btn btn-ink" disabled={save.pending}>
                {save.pending ? "Saving…" : "Save"}
              </button>
              <ConfirmButton
                label="Delete group"
                question="Delete this group? Its tags and lines stay as they are."
                confirmLabel="Delete"
                pending={deleting}
                onConfirm={async () => {
                  setDeleting(true);
                  const r = await callAction(() => deleteGroupAction(group.id));
                  setDeleting(false);
                  toast(r.ok ? { tone: "info", message: r.message ?? "Deleted." } : { tone: "error", message: r.error });
                }}
              />
            </div>
          </form>
        </div>
      )}
    </li>
  );
}

export function NewGroupForm({ tags }: { tags: Tag[] }) {
  const toast = useToast();
  const { onSubmit, pending, error, fieldErrors } = useSubmit(createGroupAction, {
    resetOnSuccess: true,
    onSuccess: (r) => toast({ tone: "info", message: r.message ?? "Group added." }),
  });
  if (tags.length === 0)
    return <p className="hint">Add a spending tag first. A group gathers spending tags under one name.</p>;
  return (
    <form onSubmit={onSubmit} className={`${s.form} ${s.newForm}`} id="new-group" noValidate>
      <h3 className="eyebrow">A new group</h3>
      <label className={s.field}>
        <span className="eyebrow">Name</span>
        <input name="name" className="input" maxLength={40} placeholder="e.g. Health" aria-invalid={!!fieldErrors.name || undefined} />
        <FieldError id="new-group-name" message={fieldErrors.name} />
      </label>
      <div className={s.wide}>
        <TagChecklist tags={tags} chosen={[]} invalid={!!fieldErrors.tagIds} />
        <FieldError id="new-group-tags" message={fieldErrors.tagIds} />
      </div>
      <FormError message={error} />
      <button type="submit" className="btn btn-ink" disabled={pending}>
        {pending ? "Adding…" : "Add group"}
      </button>
    </form>
  );
}
