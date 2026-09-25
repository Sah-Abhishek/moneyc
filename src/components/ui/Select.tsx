"use client";

import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TagColor } from "@/lib/types";
import s from "./Select.module.css";

// The app's dropdown, in place of the browser's <select>: a button that opens
// a listbox drawn in the ledger's style. Keyboard: arrows, Home/End, Enter or
// Space to choose, Escape to close, type to jump (or to filter, in long lists).
// It carries a hidden input, so it submits and resets with its form like a
// native select would.

export interface SelectOption {
  value: string;
  label: string;
  /** a tag's colour: drawn as a swatch beside the label */
  color?: TagColor;
  disabled?: boolean;
}
export interface SelectGroup {
  label: string;
  options: SelectOption[];
}
type Item = SelectOption | SelectGroup;

const isGroup = (i: Item): i is SelectGroup => "options" in i;
const SEARCH_FROM = 12;

export interface SelectProps {
  options: Item[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** shown when nothing is chosen and no option has the value "" */
  placeholder?: string;
  /** "field" looks like an input; "bare" leaves the trigger to `className` */
  variant?: "field" | "bare";
  className?: string;
  /** what the closed button shows; defaults to the chosen label */
  renderValue?: (option: SelectOption | null) => ReactNode;
  chevron?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  /** passed to the button as data-color, for stamp-styled triggers */
  dataColor?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Select({
  options, name, id, value, defaultValue = "", onChange, placeholder, variant = "field", className, renderValue,
  chevron = variant === "field", searchable, disabled, dataColor, ...aria
}: SelectProps) {
  const auto = useId();
  const listId = `${auto}-list`;
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const flat = useMemo(() => options.flatMap((i) => (isGroup(i) ? i.options : [i])), [options]);
  const chosen = flat.find((o) => o.value === current) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const withSearch = searchable ?? flat.length > SEARCH_FROM;

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? flat.filter((o) => o.label.toLowerCase().includes(q)) : flat), [flat, q]);

  const choose = (v: string) => {
    if (value === undefined) setInner(v);
    if (v !== current) onChange?.(v);
    setOpen(false);
    trigger.current?.focus();
  };

  // An uncontrolled select goes back to its first value when its form resets.
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form || value !== undefined) return;
    const reset = () => setInner(defaultValue);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  const openList = () => {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, flat.findIndex((o) => o.value === current)));
    setOpen(true);
  };

  const move = (to: number) => {
    if (!visible.length) return;
    let i = Math.min(Math.max(to, 0), visible.length - 1);
    const step = to < active ? -1 : 1;
    while (visible[i]?.disabled && i + step >= 0 && i + step < visible.length) i += step;
    setActive(i);
  };

  // Typing on a closed or unfiltered list jumps to the next label starting with it.
  const typed = useRef({ text: "", at: 0 });
  const typeahead = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at < 700 ? typed.current.text + key.toLowerCase() : key.toLowerCase(), at: now };
    const from = open ? active : flat.findIndex((o) => o.value === current);
    const order = [...flat.slice(from + 1), ...flat.slice(0, from + 1)];
    const hit = order.find((o) => !o.disabled && o.label.toLowerCase().startsWith(typed.current.text));
    if (!hit) return;
    if (open) setActive(flat.indexOf(hit));
    else if (value === undefined) {
      setInner(hit.value);
      onChange?.(hit.value);
    } else onChange?.(hit.value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeahead(e.key);
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(active + 1); break;
      case "ArrowUp": e.preventDefault(); move(active - 1); break;
      case "PageDown": e.preventDefault(); move(active + 8); break;
      case "PageUp": e.preventDefault(); move(active - 8); break;
      case "Home": if (!withSearch) { e.preventDefault(); move(0); } break;
      case "End": if (!withSearch) { e.preventDefault(); move(visible.length - 1); } break;
      case "Enter": {
        e.preventDefault();
        const o = visible[active];
        if (o && !o.disabled) choose(o.value);
        break;
      }
      case " ":
        if (!withSearch) {
          e.preventDefault();
          const o = visible[active];
          if (o && !o.disabled) choose(o.value);
        }
        break;
      case "Escape": e.preventDefault(); setOpen(false); trigger.current?.focus(); break;
      case "Tab": setOpen(false); break;
      default:
        if (!withSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeahead(e.key);
    }
  };

  const shown = renderValue ? renderValue(chosen) : chosen?.label ?? placeholder ?? "";
  const activeId = visible[active] ? `${auto}-o-${flat.indexOf(visible[active])}` : undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        className={`${variant === "field" ? s.field : s.bare} ${className ?? ""}`}
        data-empty={!chosen?.value || undefined}
        data-color={dataColor}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={aria["aria-label"]}
        aria-labelledby={aria["aria-labelledby"]}
        aria-describedby={aria["aria-describedby"]}
        data-invalid={aria["aria-invalid"] || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        {!renderValue && chosen?.color && <span className="swatch" data-color={chosen.color} />}
        <span className={s.value}>{shown}</span>
        {chevron && <Image className={s.chevron} src="/icons/chevron-down.svg" alt="" width={9} height={9} />}
      </button>
      <input ref={hidden} type="hidden" name={name} value={current} />
      {open && (
        <Popover anchor={trigger} onClose={() => setOpen(false)}>
          {withSearch && (
            <input
              className={s.search}
              autoFocus
              placeholder="Type to find…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-label="Find an option"
            />
          )}
          <ListBox
            id={listId}
            items={q ? visible : options}
            flat={flat}
            visible={visible}
            active={active}
            current={current}
            idFor={(o) => `${auto}-o-${flat.indexOf(o)}`}
            focus={!withSearch}
            activeId={activeId}
            onKey={onKey}
            onHover={(o) => setActive(visible.indexOf(o))}
            onChoose={choose}
            label={aria["aria-label"]}
            labelledBy={aria["aria-labelledby"] ?? id}
          />
        </Popover>
      )}
    </>
  );
}

function ListBox({
  id, items, flat, visible, active, current, idFor, focus, activeId, onKey, onHover, onChoose, label, labelledBy,
}: {
  id: string;
  items: Item[];
  flat: SelectOption[];
  visible: SelectOption[];
  active: number;
  current: string;
  idFor: (o: SelectOption) => string;
  focus: boolean;
  activeId?: string;
  onKey: (e: React.KeyboardEvent) => void;
  onHover: (o: SelectOption) => void;
  onChoose: (v: string) => void;
  label?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  // Keep the active option in view as the arrows move it.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const option = (o: SelectOption) => (
    <div
      key={o.value}
      id={idFor(o)}
      role="option"
      aria-selected={o.value === current}
      aria-disabled={o.disabled || undefined}
      className={s.option}
      data-active={visible[active] === o || undefined}
      onPointerMove={() => onHover(o)}
      onClick={() => !o.disabled && onChoose(o.value)}
    >
      {o.color ? <span className="swatch" data-color={o.color} /> : null}
      <span className={s.optLabel}>{o.label}</span>
      {o.value === current && <span className={s.tick} aria-hidden>✓</span>}
    </div>
  );

  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      tabIndex={-1}
      className={s.list}
      aria-label={label}
      aria-labelledby={label ? undefined : labelledBy}
      aria-activedescendant={focus ? activeId : undefined}
      onKeyDown={onKey}
    >
      {visible.length === 0 ? (
        <p className={s.none}>Nothing matches.</p>
      ) : (
        items.map((i, n) =>
          isGroup(i) ? (
            i.options.length ? (
              <div key={`g${n}`} role="group" aria-label={i.label}>
                <div className={s.groupLabel} aria-hidden>
                  {i.label}
                </div>
                {i.options.map(option)}
              </div>
            ) : null
          ) : (
            flat.includes(i) && option(i)
          ),
        )
      )}
    </div>
  );
}

/** Fixed to the page, under the button (above it when there's no room below), outside any clipping parent. */
function Popover({ anchor, onClose, children }: { anchor: React.RefObject<HTMLElement | null>; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });

  // The latest onClose, without re-placing the list every time the parent renders.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  // Placed before paint and kept in place while the page scrolls or resizes.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = box.current;
      if (!a || !el) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(Math.max(a.width, 200), vw - 16);
      const height = Math.min(el.scrollHeight, 320);
      const below = vh - a.bottom - 8;
      const up = below < height && a.top - 8 > below;
      setPos({
        left: Math.min(Math.max(8, a.left), vw - width - 8),
        width,
        maxHeight: Math.max(120, (up ? a.top : below) - 8),
        ...(up ? { bottom: vh - a.top + 4 } : { top: a.bottom + 4 }),
      });
    };
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) close.current();
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", away);
    };
  }, [anchor]);

  return createPortal(
    <div ref={box} className={s.popover} style={pos}>
      {children}
    </div>,
    document.body,
  );
}
