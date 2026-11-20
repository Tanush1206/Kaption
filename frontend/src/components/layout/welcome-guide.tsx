"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/**
 * The plain dialog guide (v1.5.0). A few short, skippable steps. Controlled by
 * the TourProvider, which uses it as the fallback for when the guided spotlight
 * tour can't run; the provider owns opening it, remembering it has been seen
 * (server-side `guide_seen`) and the Help link.
 *
 * Built on the native-<dialog> Dialog, which gives the focus trap, Escape and
 * the inert page behind, so only the step content lives here.
 */
const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Captions on your own computer",
    body: (
      <p>
        {
          "VideoCaptionMaker transcribes and translates your videos right here on this machine. Your video never leaves your computer — there's no cloud and no account to sign in to."
        }
      </p>
    ),
  },
  {
    title: "Pick the caption language",
    body: (
      <div className="space-y-2">
        <p>{"You choose the language for the captions when you upload a video."}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {
              "Hindi and English mixed together → choose Hindi, then Hinglish (Roman) to keep it in the Roman alphabet."
            }
          </li>
          <li>{"All Hindi → choose हिन्दी for Devanagari script."}</li>
          <li>{"Any other language is a translation of what was said."}</li>
        </ul>
      </div>
    ),
  },
  {
    title: "The speech model",
    body: (
      <p>
        {
          "Settings shows which speech model this install uses. A good GPU runs the most accurate model (large-v3); a CPU uses a smaller, faster one. Hindi written in the Roman alphabet uses a separate Hinglish model either way."
        }
      </p>
    ),
  },
  {
    title: "Names, brands, and optional Gemini",
    body: (
      <div className="space-y-2">
        <p>
          {
            "Add names and brands the app keeps mis-spelling to the custom vocabulary in Settings — it fixes the spelling, not what the model hears."
          }
        </p>
        <p>
          {
            "You can also paste a Gemini API key to Improve captions and get better translations. Only the caption text is sent to Google, never your video."
          }
        </p>
      </div>
    ),
  },
  {
    title: "When captions aren't perfect",
    body: (
      <p>
        {
          "Background noise, people talking over each other and music are hard, so read through before exporting. Fix anything in the editor: click a caption to edit it, use Find & Replace for a repeated word, Improve to polish a line, or Redo to run a video again."
        }
      </p>
    ),
  },
];

export function WelcomeGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  // Always start at the first step when it opens.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={current.title}
      description={`Step ${step + 1} of ${STEPS.length}`}
      className="max-w-lg"
      footer={
        <>
          {step > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
          )}
          {!last && (
            <Button type="button" variant="plain" size="sm" onClick={onClose}>
              Skip
            </Button>
          )}
          {last ? (
            <Button type="button" variant="primary" size="sm" onClick={onClose}>
              Get started
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next
            </Button>
          )}
        </>
      }
    >
      <div className="text-[15px] leading-6 text-foreground">{current.body}</div>
    </Dialog>
  );
}
