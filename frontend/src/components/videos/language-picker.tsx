"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import type { LanguageOption } from "@/types/video";

/**
 * Lower-cased and stripped of accents, so "francais" finds Français and
 * "espanol" finds Español. Scripts without accents (বাংলা, Русский) are left
 * as they are and still match on their own letters.
 */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Whether `option` matches what was typed: native name, English name or code. */
export function matchesLanguage(option: LanguageOption, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return [option.native ?? "", option.label, option.code].some((name) => fold(name).includes(q));
}

/**
 * Pick a language from a list long enough to need searching.
 *
 * A native `<select>` is the house default (docs/DESIGN_SYSTEM.md), and it was
 * fine for five languages. At fourteen it is a scroll, and its type-ahead only
 * matches the start of one label — nobody looking for বাংলা types "Bengali"
 * into it and gets there. So this is the font picker's pattern instead: a
 * button that opens a search box over a listbox, following the ARIA combobox
 * pattern so the keyboard and screen readers get what a select would give
 * them. Each option shows the language in its own name first, then in English.
 */
export function LanguagePicker({
  options,
  value,
  onChange,
  label,
  disabled = false,
  className,
}: {
  options: LanguageOption[];
  value: string;
  onChange: (code: string) => void;
  /** The accessible name of the control, e.g. "Caption language". */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // The panel is rendered in a portal (below), so it is anchored to the
  // trigger by hand. `null` until the first measurement, so it never paints
  // at 0,0 before it is placed.
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;

  const matches = useMemo(
    () => options.filter((option) => matchesLanguage(option, query)),
    [options, query]
  );
  const selected = options.find((option) => option.code === value);

  // Opening starts from the current choice, with an empty search. The search
  // box takes focus through `autoFocus` (below) rather than from here: it
  // lives in a portal that mounts a render later, once `pos` is measured.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((option) => option.code === value)));
  }, [open, options, value]);

  // Anchored to the trigger in a portal, so an overflow-hidden ancestor (the
  // inset group it sits in, the inspector's scroll area, the phone's bottom
  // sheet) can't clip it. Placed below the trigger, or above when there is
  // more room there, and never taller than the space it has. Right-aligned,
  // then nudged 8 px inside the window. Kept in step while open.
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const t = trigger.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const margin = 8;
      const width = Math.max(r.width, 240); // min-w-[15rem]
      const left = Math.min(Math.max(margin, r.right - width), window.innerWidth - margin - width);
      const below = window.innerHeight - r.bottom - margin;
      const above = r.top - margin;
      const down = below >= Math.min(320, above) || below >= above;
      setPos(
        down
          ? { left, width, top: r.bottom + 4, maxHeight: below - 4 }
          : { left, width, bottom: window.innerHeight - r.top + 4, maxHeight: above - 4 }
      );
    }
    place();
    window.addEventListener("resize", place);
    // `true`: catch scrolls in any ancestor, not just the window.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // A click anywhere else closes it, as a select would. The panel lives in a
  // portal, so it counts as "inside" alongside the trigger's container.
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!container.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function choose(code: string) {
    onChange(code);
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => Math.min(matches.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => Math.max(0, index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(matches.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (matches[active]) choose(matches[active].code);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const optionId = (code: string) => `${id}-option-${code}`;

  return (
    <div ref={container} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        // The name holds the text the button shows (WCAG 2.5.3, v1.4.1): both
        // names of a language, or "Choose…".
        aria-label={`${label}: ${
          selected
            ? selected.native && selected.native !== selected.label
              ? `${selected.native} ${selected.label}`
              : (selected.native ?? selected.label)
            : "Choose…"
        }`}
        onClick={() => setOpen((was) => !was)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-[15px] sm:h-8 sm:text-sm",
          "transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40"
        )}
      >
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              <span lang={selected.native ? selected.code : undefined}>
                {selected.native ?? selected.label}
              </span>
              {selected.native && selected.native !== selected.label && (
                // A real space, so the text reads "हिन्दी Hindi" to a machine too.
                <>
                  {" "}
                  <span className="ml-0.5 text-muted-foreground">{selected.label}</span>
                </>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Choose…</span>
          )}
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panel}
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            bottom: pos.bottom,
            width: pos.width,
            maxHeight: pos.maxHeight,
          }}
          className="z-50 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-overlay dark:bg-surface-3"
        >
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={search}
              autoFocus
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}s`}
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={matches[active] ? optionId(matches[active].code) : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Search ${options.length} languages`}
              className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <ul id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-1">
            {matches.map((option, index) => {
              const isSelected = option.code === value;
              return (
                <li
                  key={option.code}
                  id={optionId(option.code)}
                  role="option"
                  aria-selected={isSelected}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.code)}
                  onPointerEnter={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                    index === active ? "bg-surface-2 dark:bg-background/40" : undefined,
                    isSelected && "text-primary"
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span lang={option.native ? option.code : undefined}>
                      {option.native ?? option.label}
                    </span>
                    {option.native && option.native !== option.label && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{option.label}</span>
                    )}
                  </span>
                  {isSelected && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
                </li>
              );
            })}
            {matches.length === 0 && (
              <li role="presentation" className="px-3 py-4 text-center text-xs text-muted-foreground">
                No language matches “{query}”.
              </li>
            )}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
}
