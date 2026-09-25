"use client";

import Link from "next/link";
import { useState } from "react";
import { createTagAction, deleteTagAction, mergeTagsAction, updateTagAction } from "@/app/actions/book";
import { rupeesExact } from "@/lib/money";
import { TAG_COLOR_LABEL, TAG_COLORS, type Tag } from "@/lib/types";
import { ConfirmButton, FieldError, FormError } from "./ui/Confirm";
import { useToast } from "./ui/Toaster";
import { callAction, useSubmit } from "./ui/useSubmit";
import s from "./TagEditor.module.css";

function ColorPicker({ name, value, onChange }: { name: string; value: string; onChange?: (c: string) => void }) {
  return (
    <div className={s.colors} role="radiogroup" aria-label="Colour">
      {TAG_COLORS.map((c) => (
        <label key={c} className={s.color} data-color={c} title={TAG_COLOR_LABEL[c]}>
          <input type="radio" name={name} value={c} defaultChecked={c === value} onChange={() => onChange?.(c)} />
          <span aria-hidden />
          <span className="sr-only">{TAG_COLOR_LABEL[c]}</span>
        </label>
      ))}
    </div>
  );
}

export function TagEditor({ tag, usage, others }: { tag: Tag; usage: { entries: number; rules: number }; others: Tag[] }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [color, setColor] = useState(tag.color);
  const save = useSubmit(updateTagAction, { onSuccess: (r) => { toast({ tone: "info", message: r.message ?? "Saved." }); setOpen(false); } });
  const merge = useSubmit(mergeTagsAction, { onSuccess: (r) => toast({ tone: "info", message: r.message ?? "Merged." }) });

  return (
    <li className={s.row} id={`tag-${tag.id}`}>
      <div className={s.summary}>
        <span className="stamp" data-color={color}>
          {tag.name}
        </span>
        <span className={s.meta}>
          <Link href={`/?tag=${tag.id}`}>{usage.entries} line{usage.entries === 1 ? "" : "s"}</Link>
          {usage.rules > 0 && ` · ${usage.rules} rule${usage.rules === 1 ? "" : "s"}`}
          {tag.kind === "income" && " · income"}
          {tag.budget != null && ` · budget ₹${rupeesExact(tag.budget)}/month`}
        </span>
        <button type="button" className="btn btn-line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className={s.editor}>
          <form onSubmit={save.onSubmit} className={s.form} noValidate>
            <input type="hidden" name="id" value={tag.id} />
            <label className={s.field}>
              <span className="eyebrow">Name</span>
              <input name="name" className="input" defaultValue={tag.name} maxLength={40} aria-invalid={!!save.fieldErrors.name || undefined} />
              <FieldError id={`tag-name-${tag.id}`} message={save.fieldErrors.name} />
            </label>
            <div className={s.field}>
              <span className="eyebrow">Colour</span>
              <ColorPicker name="color" value={tag.color} onChange={(c) => setColor(c as Tag["color"])} />
            </div>
            <label className={s.field}>
              <span className="eyebrow">Counts as</span>
              <select name="kind" className="select" defaultValue={tag.kind}>
                <option value="spend">Spending</option>
                <option value="income">Income</option>
              </select>
            </label>
            <label className={s.field}>
              <span className="eyebrow">Monthly budget</span>
              <input name="budget" className="input mono" inputMode="decimal" defaultValue={tag.budget != null ? rupeesExact(tag.budget) : ""} placeholder="None" />
              <FieldError id={`tag-budget-${tag.id}`} message={save.fieldErrors.budget} />
            </label>
            <FormError message={save.error} />
            <div className={s.buttons}>
              <button type="submit" className="btn btn-ink" disabled={save.pending}>
                {save.pending ? "Saving…" : "Save"}
              </button>
              {others.length > 0 && (
                <button type="button" className="btn btn-line" onClick={() => setMerging((m) => !m)} aria-expanded={merging}>
                  Merge into…
                </button>
              )}
              <ConfirmButton
                label="Delete tag"
                question={usage.entries ? `Untag ${usage.entries} line${usage.entries === 1 ? "" : "s"} and delete?` : "Delete this tag?"}
                confirmLabel="Delete"
                pending={deleting}
                onConfirm={async () => {
                  setDeleting(true);
                  const r = await callAction(() => deleteTagAction(tag.id));
                  setDeleting(false);
                  toast(r.ok ? { tone: "info", message: r.message ?? "Deleted." } : { tone: "error", message: r.error });
                }}
              />
            </div>
          </form>

          {merging && (
            <form onSubmit={merge.onSubmit} className={s.merge} noValidate>
              <input type="hidden" name="from" value={tag.id} />
              <label className={s.field}>
                <span className="eyebrow">
                  Move {usage.entries} line{usage.entries === 1 ? "" : "s"} onto
                </span>
                <select name="into" className="select" defaultValue="" required>
                  <option value="" disabled>
                    Choose a tag
                  </option>
                  {others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint">“{tag.name}” is removed after the merge. This can&apos;t be undone.</p>
              <FormError message={merge.error} />
              <button type="submit" className="btn btn-ink" disabled={merge.pending}>
                {merge.pending ? "Merging…" : "Merge"}
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

export function NewTagForm() {
  const toast = useToast();
  const { onSubmit, pending, error, fieldErrors } = useSubmit(createTagAction, {
    resetOnSuccess: true,
    onSuccess: (r) => toast({ tone: "info", message: r.message ?? "Tag added." }),
  });
  return (
    <form onSubmit={onSubmit} className={`${s.form} ${s.newForm}`} id="new-tag" noValidate>
      <h3 className="eyebrow">A new tag</h3>
      <label className={s.field}>
        <span className="eyebrow">Name</span>
        <input name="name" className="input" maxLength={40} placeholder="e.g. Health" aria-invalid={!!fieldErrors.name || undefined} />
        <FieldError id="new-tag-name" message={fieldErrors.name} />
      </label>
      <div className={s.field}>
        <span className="eyebrow">Colour</span>
        <ColorPicker name="color" value="teal" />
      </div>
      <label className={s.field}>
        <span className="eyebrow">Counts as</span>
        <select name="kind" className="select" defaultValue="spend">
          <option value="spend">Spending</option>
          <option value="income">Income</option>
        </select>
      </label>
      <label className={s.field}>
        <span className="eyebrow">Monthly budget</span>
        <input name="budget" className="input mono" inputMode="decimal" placeholder="Optional" />
        <FieldError id="new-tag-budget" message={fieldErrors.budget} />
      </label>
      <FormError message={error} />
      <button type="submit" className="btn btn-ink" disabled={pending}>
        {pending ? "Adding…" : "Add tag"}
      </button>
    </form>
  );
}
