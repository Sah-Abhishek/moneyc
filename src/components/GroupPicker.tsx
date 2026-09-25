"use client";

import { useRouter } from "next/navigation";
import { Select } from "./ui/Select";
import s from "./Ledger.module.css";

/** Reads the ledger through one tag group ("Health": Healthy, Junk, Leisure). */
export function GroupPicker({ current, options }: { current: number | null; options: { id?: number; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <Select
      className={s.groupPick}
      aria-label="Show one group of tags"
      value={current != null ? String(current) : ""}
      onChange={(v) => {
        const picked = options.find((o) => String(o.id ?? "") === v);
        if (picked) router.push(picked.href, { scroll: false });
      }}
      options={options.map((o) => ({ value: o.id != null ? String(o.id) : "", label: o.id ? `Group · ${o.label}` : o.label }))}
    />
  );
}
