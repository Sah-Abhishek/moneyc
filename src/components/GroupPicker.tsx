"use client";

import { useRouter } from "next/navigation";
import s from "./Ledger.module.css";

/** Reads the ledger through one tag group ("Health": Healthy, Junk, Leisure). */
export function GroupPicker({ current, options }: { current: number | null; options: { id?: number; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <label className={s.groupPick}>
      <span className="sr-only">Show one group of tags</span>
      <select
        className="select mono"
        value={current ?? ""}
        onChange={(e) => {
          const picked = options.find((o) => String(o.id ?? "") === e.target.value);
          if (picked) router.push(picked.href, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.id ?? "all"} value={o.id ?? ""}>
            {o.id ? `Group · ${o.label}` : o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
