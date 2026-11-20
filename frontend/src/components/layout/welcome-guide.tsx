"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useSystem, useUpdateSystemSettings } from "@/hooks/use-system";
import { LOCAL_MODE } from "@/lib/config";

/**
 * The first-run welcome guide (v1.5.0). A few short, skippable steps that open
 * by themselves the first time someone opens a fresh install, and can be
 * reopened any time from the Help button in the header.
 *
 * "Seen" is remembered server-side (SystemInfo.guide_seen), so it stays
 * dismissed on another browser or device, not only in this localStorage. Only
 * the first dismissal records it; reopening from Help never does.
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

export function WelcomeGuide() {
  const { data } = useSystem();
  const update = useUpdateSystemSettings();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const decided = useRef(false);

  useEffect(() => {
    // Open by itself once, on a fresh install, and only in local mode: in
    // accounts mode the dismissal below is refused, so it would nag on every
    // load.
    if (decided.current || !data) return;
    decided.current = true;
    if (LOCAL_MODE && !data.guide_seen) {
      setStep(0);
      setOpen(true);
    }
  }, [data]);

  function dismiss() {
    setOpen(false);
    // Record, once, that the guide has been seen, so it never opens on its own
    // again. Reopening from Help doesn't come back through here.
    if (LOCAL_MODE && data && !data.guide_seen) {
      update.mutate({ guide_seen: true });
    }
  }

  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
      >
        <HelpCircle aria-hidden="true" />
        Help
      </Button>

      <Dialog
        open={open}
        onClose={dismiss}
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
              <Button type="button" variant="plain" size="sm" onClick={dismiss}>
                Skip
              </Button>
            )}
            {last ? (
              <Button type="button" variant="primary" size="sm" onClick={dismiss}>
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
    </>
  );
}
