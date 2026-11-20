/**
 * The guided-tour steps (v1.5.0). Each step points at a real element by its
 * `data-tour` attribute and, when that element isn't on screen, falls back to a
 * centred card. `route` is the page the step lives on; the tour navigates there
 * first. `target` null means a centred card (no spotlight).
 *
 * On a fresh install there is no video yet, so the language and editor steps
 * are centred cards by design — which is exactly the "element isn't on screen"
 * fallback.
 */
export interface TourStep {
  key: string;
  /** Navigate here before showing the step; null stays on the current page. */
  route: string | null;
  /** `data-tour` selector to spotlight; null shows a centred card. */
  target: string | null;
  title: string;
  body: React.ReactNode;
}

export const TOUR_STEPS: TourStep[] = [
  {
    key: "upload",
    route: "/dashboard",
    target: '[data-tour="upload"]',
    title: "Add a video",
    body: (
      <p>
        {
          "Drop a video here, or choose one. Everything runs on your own computer — your video never leaves it, and there's no account to sign in to."
        }
      </p>
    ),
  },
  {
    key: "language",
    route: "/dashboard",
    target: null,
    title: "Pick the caption language",
    body: (
      <div className="space-y-2">
        <p>{"After you choose a file, you pick the language for the captions."}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>{"Hindi mixed with English → Hindi, then Hinglish (Roman)."}</li>
          <li>{"All Hindi → हिन्दी for Devanagari."}</li>
          <li>{"Any other language is a translation of what was said."}</li>
        </ul>
      </div>
    ),
  },
  {
    key: "editor",
    route: "/dashboard",
    target: null,
    title: "Fix the captions",
    body: (
      <p>
        {
          "Open a video to edit its captions: click a line to change it, Tips for advice, Find & Replace for a repeated word, Improve to polish wording, and Redo to run the video again. Then Export a burned-in MP4 or SRT/VTT."
        }
      </p>
    ),
  },
  {
    key: "speech-model",
    route: "/settings",
    target: '[data-tour="speech-model"]',
    title: "The speech model",
    body: (
      <p>
        {
          "A good GPU runs the most accurate model (large-v3); a CPU uses a smaller, faster one. Hindi in the Roman alphabet uses a separate Hinglish model either way."
        }
      </p>
    ),
  },
  {
    key: "vocabulary",
    route: "/settings",
    target: '[data-tour="vocabulary"]',
    title: "Custom vocabulary",
    body: (
      <p>
        {
          "Add names and brands the app keeps mis-spelling. It fixes the spelling, not what the model hears — Redo a video to apply it."
        }
      </p>
    ),
  },
  {
    key: "gemini",
    route: "/settings",
    target: '[data-tour="gemini"]',
    title: "Optional Gemini key",
    body: (
      <p>
        {
          "Paste a Gemini API key to Improve captions and get better translations. Only the caption text is sent to Google, never your video."
        }
      </p>
    ),
  },
  {
    key: "help",
    route: null,
    target: '[data-tour="help"]',
    title: "That's the tour",
    body: <p>{"Open it again any time from Help, up here in the top bar."}</p>,
  },
];
