"use client";

import { Lightbulb } from "lucide-react";

import { Popover } from "@/components/ui/popover";

/**
 * Tips for fixing captions, behind a "Tips" button next to the caption count
 * in the editor (v1.5.0). Replaces the older accuracy (i) here: the same honest
 * note about accuracy, plus when to reach for each tool. The caption count's
 * neighbour on the left, so it reads before the tools on the right.
 *
 * Built on the Popover's labelled-panel mode, so it opens as a small dialog
 * that a screen reader reads out and Escape closes.
 */
export function CaptionTips({ className }: { className?: string }) {
  return (
    <Popover
      label="Tips for fixing captions"
      panelLabel="Tips for fixing captions"
      side="bottom"
      align="start"
      className={className}
      trigger={
        <>
          <Lightbulb className="size-3.5" aria-hidden="true" />
          Tips
        </>
      }
      triggerClassName="size-auto gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground sm:size-auto"
      panelClassName="w-[min(20rem,calc(100vw-2rem))] p-3 outline-none"
    >
      {() => (
        <div className="space-y-2 text-[13px] leading-5 text-foreground">
          <p>
            {
              "Captions are made by AI speech recognition, so some words may be wrong — names, technical terms, mixed Hindi and English, fast speech or noise. Read through before exporting."
            }
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>{"Click any caption to fix its text or timing."}</li>
            <li>{"Replace (Find & Replace) changes a word across every caption at once."}</li>
            <li>{"Add names and brands to the custom vocabulary in Settings, then Redo."}</li>
            <li>{"Improve polishes wording and punctuation with Gemini, if a key is set."}</li>
            <li>{"Redo runs the whole video again — use it after changing the language or vocabulary."}</li>
          </ul>
        </div>
      )}
    </Popover>
  );
}
