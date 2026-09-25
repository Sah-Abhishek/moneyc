"use client";

import { useState, useTransition } from "react";
import { createRuleAction, deleteRuleAction, moveRuleAction, updateRuleAction } from "@/app/actions/book";
import type { Rule, RuleAction, RuleField, Tag } from "@/lib/types";
import { ConfirmButton, FieldError, FormError } from "./ui/Confirm";
import { Select } from "./ui/Select";
import { useToast } from "./ui/Toaster";
import { callAction, useSubmit } from "./ui/useSubmit";
import { describeAction, describeCondition } from "./ruleText";
import s from "./RuleEditor.module.css";

const FIELD_LABEL: Record<RuleField, string> = { sender: "Sender is", payee_prefix: "Payee starts with", amount_over: "Amount is over ₹" };
const PLACEHOLDER: Record<RuleField, string> = { sender: "alerts@hdfcbank.net or hdfcbank.net", payee_prefix: "SWIGGY", amount_over: "20,000" };

function RuleFields({ rule, tags, errors }: { rule?: Rule; tags: Tag[]; errors: Record<string, string> }) {
  const [field, setField] = useState<RuleField>(rule?.field ?? "payee_prefix");
  const [action, setAction] = useState<RuleAction>(rule?.action ?? (rule ? rule.action : "tag"));
  const actions: RuleAction[] = field === "amount_over" ? ["ask", "file"] : ["tag", "file", "ask"];
  const effectiveAction = actions.includes(action) ? action : actions[0];

  return (
    <div className={s.fields}>
      <label className={s.field}>
        <span className="eyebrow">If</span>
        <Select
          name="field"
          value={field}
          onChange={(v) => setField(v as RuleField)}
          options={(Object.keys(FIELD_LABEL) as RuleField[]).map((f) => ({ value: f, label: FIELD_LABEL[f] }))}
        />
      </label>
      <label className={s.field}>
        <span className="eyebrow">Value</span>
        <input
          name="value"
          className="input mono"
          defaultValue={rule?.value}
          placeholder={PLACEHOLDER[field]}
          inputMode={field === "amount_over" ? "decimal" : undefined}
          maxLength={120}
          aria-invalid={!!errors.value || undefined}
        />
        <FieldError id="rule-value-err" message={errors.value} />
      </label>
      <label className={s.field}>
        <span className="eyebrow">Then</span>
        <Select
          name="action"
          value={effectiveAction}
          onChange={(v) => setAction(v as RuleAction)}
          options={actions.map((a) => ({ value: a, label: a === "tag" ? "Stamp a tag" : a === "file" ? "File automatically" : "Ask me first" }))}
        />
        <FieldError id="rule-action-err" message={errors.action} />
      </label>
      {effectiveAction === "tag" && (
        <label className={s.field}>
          <span className="eyebrow">Tag</span>
          <Select
            name="tagId"
            defaultValue={rule?.tag?.id != null ? String(rule.tag.id) : ""}
            placeholder="Choose a tag"
            aria-invalid={!!errors.tagId || undefined}
            options={tags.map((t) => ({ value: String(t.id), label: t.name, color: t.color }))}
          />
          <FieldError id="rule-tag-err" message={errors.tagId} />
        </label>
      )}
    </div>
  );
}

export function RuleEditor({ tags }: { tags: Tag[] }) {
  const toast = useToast();
  const [formKey, setFormKey] = useState(0);
  const { onSubmit, pending, error, fieldErrors } = useSubmit(createRuleAction, {
    onSuccess: (r) => {
      toast({ tone: "info", message: r.message ?? "Rule added." });
      setFormKey((k) => k + 1);
    },
  });
  return (
    <form key={formKey} onSubmit={onSubmit} className={s.newRule} noValidate>
      <h3 className="eyebrow">A new rule</h3>
      <RuleFields tags={tags} errors={fieldErrors} />
      <FormError message={error} />
      <button type="submit" className="btn btn-ink" disabled={pending}>
        {pending ? "Adding…" : "Add rule"}
      </button>
    </form>
  );
}

export function RuleList({ rules, tags }: { rules: Rule[]; tags: Tag[] }) {
  return (
    <ol className={s.list}>
      {rules.map((r, i) => (
        <RuleRow key={r.id} rule={r} tags={tags} first={i === 0} last={i === rules.length - 1} />
      ))}
    </ol>
  );
}

function RuleRow({ rule, tags, first, last }: { rule: Rule; tags: Tag[]; first: boolean; last: boolean }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = useSubmit(updateRuleAction, {
    onSuccess: (r) => {
      toast({ tone: "info", message: r.message ?? "Saved." });
      setEditing(false);
    },
  });
  const move = (d: "up" | "down") =>
    start(async () => {
      const r = await callAction(() => moveRuleAction(rule.id, d));
      if (!r.ok) toast({ tone: "error", message: r.error });
    });

  return (
    <li className={s.row}>
      <div className={s.summary}>
        <span className={s.pos}>{rule.position}</span>
        <span className={s.text}>
          <span className={s.if}>If {describeCondition(rule)}</span>
          <span className={s.then}>→ {describeAction(rule)}</span>
        </span>
        <span className={s.controls}>
          <button type="button" className="chip" onClick={() => move("up")} disabled={first || pending} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="chip" onClick={() => move("down")} disabled={last || pending} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="chip" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            {editing ? "Close" : "Edit"}
          </button>
          <ConfirmButton
            className="chip"
            label="Delete"
            question="Delete this rule?"
            confirmLabel="Delete"
            onConfirm={() =>
              start(async () => {
                const r = await callAction(() => deleteRuleAction(rule.id));
                toast(r.ok ? { tone: "info", message: r.message ?? "Removed." } : { tone: "error", message: r.error });
              })
            }
          />
        </span>
      </div>
      {editing && (
        <form onSubmit={save.onSubmit} className={s.edit} noValidate>
          <input type="hidden" name="id" value={rule.id} />
          <RuleFields rule={rule} tags={tags} errors={save.fieldErrors} />
          <FormError message={save.error} />
          <button type="submit" className="btn btn-ink" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save rule"}
          </button>
        </form>
      )}
    </li>
  );
}
