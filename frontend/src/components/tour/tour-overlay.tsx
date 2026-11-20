"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { TOUR_STEPS } from "@/components/tour/steps";
import { cn } from "@/lib/utils";

type Placement = "bottom" | "top" | "center";
interface CalloutPos {
  top: number;
  left: number;
  placement: Placement;
  /** Arrow offset from the callout's left edge (not drawn when centred). */
  arrowLeft: number;
}

const SPOTLIGHT_PAD = 6;
const GAP = 12;
const GUTTER = 16;
const CALLOUT_W = 360;

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

/**
 * The guided tour's overlay (v1.5.0): dims the page, keeps one real element
 * bright, and floats a callout beside it with Back / Next / Skip. Steps on
 * another page navigate there first; a target that never appears degrades to a
 * centred card. Keyboard: Esc closes, ←/→ move, Tab stays inside the callout.
 *
 * Mounted only while the tour runs. `onError` hands control back to the
 * provider, which shows the plain dialog guide instead.
 */
export function TourOverlay({
  index,
  total,
  onNext,
  onBack,
  onClose,
  onError,
}: {
  index: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onError: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const step = TOUR_STEPS[index];

  const calloutRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<CalloutPos | null>(null);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Remember what had focus before the tour, and give it back when the overlay
  // unmounts.
  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    return () => restoreFocus.current?.focus?.();
  }, []);

  // Resolve the step's target: navigate to its page if needed, then wait for
  // the element to appear (up to ~1.5 s of frames). A target that never shows
  // becomes a centred card rather than a failure.
  useEffect(() => {
    setReady(false);
    let raf = 0;
    let tries = 0;
    if (step.route && pathname !== step.route) {
      router.push(step.route);
      return; // re-runs when pathname changes
    }
    const find = () => {
      try {
        const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
        if (step.target && !el) {
          if (tries++ < 90) {
            raf = requestAnimationFrame(find);
            return;
          }
          setRect(null); // gave up: centred card
          setReady(true);
          return;
        }
        if (el) {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
          setRect(el.getBoundingClientRect());
        } else {
          setRect(null);
        }
        setReady(true);
      } catch {
        onError();
      }
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, [index, pathname, router, step.route, step.target, onError]);

  // Keep the spotlight on the element as the page scrolls or resizes.
  useEffect(() => {
    if (!ready || !step.target) return;
    const target = step.target;
    const track = () => {
      const el = document.querySelector<HTMLElement>(target);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener("resize", track);
    window.addEventListener("scroll", track, true);
    return () => {
      window.removeEventListener("resize", track);
      window.removeEventListener("scroll", track, true);
    };
  }, [ready, step.target]);

  // Place the callout: below the target, else above, else centred; always kept
  // inside the viewport, with the arrow pointing at the target's centre.
  useLayoutEffect(() => {
    if (!ready) return;
    const node = calloutRef.current;
    if (!node) return;
    const cw = node.offsetWidth;
    const ch = node.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!rect) {
      setPos({
        top: Math.max(GUTTER, (vh - ch) / 2),
        left: Math.max(GUTTER, (vw - cw) / 2),
        placement: "center",
        arrowLeft: cw / 2,
      });
      return;
    }

    let placement: Placement = "bottom";
    let top = rect.bottom + GAP;
    if (top + ch > vh - GUTTER) {
      if (rect.top - GAP - ch >= GUTTER) {
        placement = "top";
        top = rect.top - GAP - ch;
      } else {
        placement = "center";
        top = Math.max(GUTTER, (vh - ch) / 2);
      }
    }
    let left = rect.left + rect.width / 2 - cw / 2;
    left = Math.max(GUTTER, Math.min(left, vw - GUTTER - cw));
    const arrowLeft = Math.max(16, Math.min(cw - 16, rect.left + rect.width / 2 - left));
    setPos({ top, left, placement, arrowLeft });
  }, [ready, rect, index]);

  // Move focus into the callout when a step is shown.
  useEffect(() => {
    if (ready && pos) calloutRef.current?.focus();
  }, [ready, pos, index]);

  const last = index === total - 1;

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        if (last) onClose();
        else onNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (index > 0) onBack();
      } else if (event.key === "Tab") {
        // Keep focus inside the callout.
        const node = calloutRef.current;
        if (!node) return;
        const items = focusable(node);
        if (items.length === 0) {
          event.preventDefault();
          node.focus();
          return;
        }
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === node)) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && active === lastItem) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [index, last, onBack, onClose, onNext]
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100]"
      role="presentation"
      onKeyDown={onKeyDown}
    >
      {/* Catches clicks so the dimmed page can't be used while the tour runs. */}
      <div className="absolute inset-0" aria-hidden="true" onClick={() => undefined} />

      {/* The spotlight: a transparent box over the target whose huge box-shadow
          dims everything else, with a bright outline ring. */}
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg outline outline-2 outline-white"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
            transition: reduced ? undefined : "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      )}

      {/* The callout. A labelled dialog that takes focus; the live region
          announces each step as it changes. */}
      <div
        ref={calloutRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width: `min(${CALLOUT_W}px, calc(100vw - 2rem))`,
          visibility: pos ? "visible" : "hidden",
        }}
        className={cn(
          "pointer-events-auto absolute rounded-2xl bg-background p-4 text-foreground shadow-overlay outline-none dark:bg-card",
          !reduced && "animate-fade-in"
        )}
      >
        {/* Arrow, only when anchored to an element. */}
        {pos && pos.placement !== "center" && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute size-3 rotate-45 bg-background dark:bg-card",
              pos.placement === "bottom" ? "-top-1.5" : "-bottom-1.5"
            )}
            style={{ left: pos.arrowLeft - 6 }}
          />
        )}

        <p className="sr-only" aria-live="polite">
          {step.title}. Step {index + 1} of {total}.
        </p>

        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-[17px] font-semibold leading-6">
            {step.title}
          </h2>
          <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground" aria-hidden="true">
            {index + 1}/{total}
          </span>
        </div>

        <div id="tour-body" className="mt-1.5 text-[14px] leading-5 text-foreground">
          {step.body}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          {index > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          {!last && (
            <Button type="button" variant="plain" size="sm" onClick={onClose}>
              Skip
            </Button>
          )}
          <Button type="button" variant="primary" size="sm" onClick={last ? onClose : onNext}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
