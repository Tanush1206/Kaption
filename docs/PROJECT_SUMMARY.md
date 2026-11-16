# Project summary

VideoCaptionMaker, from the first commit (5 August 2026) to the project
close (November 2026). This page says what was built, where it stands, how
well it works as measured, and where to look for everything else. The
details live in the docs it links; this page doesn't repeat them.

## 1. What it is

An app that captions videos **on the user's own computer**. Upload a video,
choose a caption language, optionally edit and style the captions, then
export an MP4 with the captions burned in, or SRT/VTT. Speech recognition
(Whisper, through faster-whisper; Apex for Hinglish) and translation
(M2M100, through CTranslate2) run locally on the CPU or an NVIDIA GPU.
Gemini is optional, with a key in Settings, for more natural translations
and an "Improve captions" pass; without it everything still works.

It installs with one command on Windows, macOS and Linux (Docker Compose
underneath), runs as a single-user app with no login, and serves its UI on
`127.0.0.1` only. MIT licence; third-party licences in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and in each image's
`/licenses`.

## 2. Where it stands

- **Current release: v1.4.3** (16 November 2026, tag on `4d5dd3f`). 23
  releases since v1.0.0 (8 October 2026), all in
  [CHANGELOG.md](../CHANGELOG.md).
- **Published:** GitHub Releases (installers, compose files, `vcm`,
  `SHA256SUMS`) and GHCR images: `backend:<version>-cuda` (amd64),
  `backend:<version>-cpu` and `frontend:<version>` (amd64 and arm64).
- **Website:** https://tanush1206.github.io/Video-Caption-Maker/ (`site/`,
  deployed by `pages.yml`).
- **Checked on the release:** a release is called done only after the
  published version is installed or updated on a real machine and checked
  end to end ([TESTING.md](TESTING.md) §6). For v1.4.3: the backend suite (796 passed, 2 skipped), the frontend
  lint, types, tests and production build, the 7 installer tests, E2E on
  the GPU and the CPU, axe at 0 and 212 UI checks on the dev stack; then
  on the updated install: E2E, 202 UI checks at `localhost` and at
  `127.0.0.1`, the request guard, `vcm doctor`, and the data before and
  after the update (identical). The record is in [PROGRESS.md](PROGRESS.md).
- **Open work:** none in progress. Everything decided for later is in
  [ROADMAP.md](ROADMAP.md).

## 3. How it got here

| Releases | When | What they brought |
|---|---|---|
| Milestones 1-10 | Aug-Oct 2026 | The app itself: upload, transcription, the caption editor with timeline and styling, export and burn-in, semantic search, the dashboard ([MILESTONES.md](MILESTONES.md)) |
| 1.0.0-1.0.3 | 8-12 Oct | One-command install, production images and compose, the release workflow, local mode without login; checksums on every download; recovery after a crash; the request guard; updates that download only what changed |
| 1.0.4-1.0.6 | 12-15 Oct | A visual redesign, the system theme, a security fix in the frontend |
| 1.0.7-1.0.8 | 17-19 Oct | Caption placement and styling that match the export exactly, eight more caption languages, line control, captions that follow the speech |
| 1.0.9-1.0.11 | 21-23 Oct | Hinglish (Hindi in Roman script, through Apex), captions for every stretch of speech, quiet recordings captioned; the language quality eval, and four weak languages withdrawn |
| 1.1.0-1.1.1 | 26-27 Oct | The minimal redesign; the fixes of the launch-readiness audit ([LAUNCH_AUDIT.md](LAUNCH_AUDIT.md)): an unprivileged user, FFmpeg limited to what it needs, framing and cross-site protection |
| 1.2.0-1.2.2 | 29-30 Oct | Next.js 15, streamed uploads, long exports that finish, no "nan" captions over music, MP4s about the size of the original with a Quality choice |
| 1.3.0-1.3.1 | 3-12 Nov | Captions on noisy real-life videos: a readable default style, Find and replace, Improve with Gemini (with Undo); Everyday Hinglish spelling; a custom vocabulary |
| 1.4.0 | 12 Nov | Native on Apple silicon and ARM Linux, honest progress on long videos, `vcm doctor` |
| 1.4.1 | 14 Nov | The fixes and security updates of the final audit of v1.4.0 ([FINAL_AUDIT.md](FINAL_AUDIT.md)): patched OS and Python packages, Node 22, PyJWT instead of python-jose; macOS measured; speech under a collapsed loop captioned |
| 1.4.2 | 15 Nov | Speech the model skipped under one stretched word is captioned |
| 1.4.3 | 16 Nov | A full penetration test (no serious issue found) and one defence-in-depth fix: a downloaded export's default name is sanitised ([SECURITY_TEST.md](SECURITY_TEST.md)) |

## 4. How it works

Next.js 15 frontend; FastAPI and Celery in one backend image (the `api`
and `worker` commands); Postgres 16, Redis 7 and ChromaDB 1.0. A job goes:
upload, then the audio is extracted and transcribed (with re-checks for
skipped speech, loops and music), phrased into captions, optionally
translated, and indexed for search; exports are burned in with FFmpeg (on
the GPU when there is one). The models are chosen for the hardware: Whisper
large-v3 on an NVIDIA GPU, large-v3-turbo or small on the CPU. Details:
[ARCHITECTURE.md](ARCHITECTURE.md); data: [DATABASE.md](DATABASE.md); API:
[API.md](API.md); why things are the way they are:
[DECISIONS.md](DECISIONS.md).

## 5. How well it works, as measured

- **Speech, by language** (FLEURS, large-v3 on the GPU, v1.0.10): word
  error 3-7% for Spanish, Portuguese, Italian, Russian, French, German and
  Dutch ("Good"); Hindi usable (right words, often misspelt). English was
  hit by the quiet-recording bug in that run, fixed in v1.0.11. Tamil,
  Marathi, Bengali and Malayalam were weak and are not offered.
  [LANGUAGE_QUALITY.md](LANGUAGE_QUALITY.md).
- **Hinglish on real videos** (strict word error against text written by
  ear): 16.7% on new.mp4 0:00-1:31 and 14.0% on hinglish.mp4, down from
  24.0% and 28.8% before Everyday spelling (v1.3.1); unchanged since.
- **Speed:** a 3:48 video is captioned in under a minute on an RTX 5080,
  in about 7 minutes on a MacBook Air M2 (CPU only, Docker can't reach
  Apple's GPU), and in roughly real time on a PC's CPU.
- **Updates:** a typical release downloads a few MB (v1.4.2: 0.2 MB of the
  2.3 GB backend image); a release that patches the base downloads the
  backend once in full (v1.4.1).
- **Security:** the request guard refuses foreign origins, other ports,
  cross-site requests and DNS rebinding (checked on every release); the app
  runs as an unprivileged user with no capabilities; the images were
  scanned with Trivy and, at v1.4.1's scan, carried 0 fixable critical or
  high OS advisories. What is left, and why it isn't reachable:
  [FINAL_AUDIT.md](FINAL_AUDIT.md) §4. [SECURITY.md](SECURITY.md).
- **Penetration test (v1.4.3, 15-16 November 2026).** The app was attacked
  the way its threat model's four actors would — a malicious website, a
  malicious uploaded file, a device on the LAN, and a tampered download —
  across ten areas: browser/CSRF/rebinding/CORS/clickjacking, SQL and
  cross-site-scripting injection, path traversal, malicious media, denial
  of service, Gemini prompt injection, network isolation, container escape,
  supply chain and secrets. **No critical or high issue was found**: the
  guard refused every cross-origin state change, queries are parameterised,
  filenames and caption text render as escaped text, the FFmpeg allow-list
  refused files pointing at `/etc/passwd` and internal URLs, the install's
  processes have no capabilities and publish only the UI, a tampered `vcm`
  fails its checksum, and the Gemini key is never returned or logged. One
  low, non-exploitable inconsistency was fixed (the default export filename
  now passes through `safe_stem`), and the dev compose was documented as
  not a hardened configuration. The full attack-by-attack table is in
  [SECURITY_TEST.md](SECURITY_TEST.md).
- **Accessibility and layout:** axe-core at 0 violations on the dashboard,
  search, settings and editor, light and dark, phone and desktop; the
  editor's caption time buttons at least 24 px each way; layout shift
  while loading at most 0.01 on the dashboard and settings, and 0.005
  (phone) and 0.014 (desktop) in the editor (v1.4.1).

## 6. Known limitations

The full list, with numbers, is in [PRD.md](PRD.md) §10. In short:
- a Mac runs everything on the CPU, so it is much slower, and it is tested
  on one machine by hand;
- quality depends on the language; local translation is literal, weakest
  into Hindi;
- now and then a short word goes uncaptioned or a caption is shorter than
  the speech; the Hinglish model writes some numbers and model names in
  pieces;
- burned-in Chinese, Japanese or Korean captions need a font chosen by hand;
- CPU transcription is roughly real time with the default model.

## 7. What's next

Nothing is in progress. [ROADMAP.md](ROADMAP.md) holds what was decided for
later, each with what it is and why it wasn't done: among them `vcm backup`
and `vcm restore`, image signing, a scan that can stop a release, more
caption languages (right-to-left, CJK, the four withdrawn Indian
languages), several caption-timing cases measured and left, forced
alignment, and a native macOS app that uses Apple's GPU.

## 8. Looking after it

- **Releasing:** [TESTING.md](TESTING.md) §6 has the release checklist. In
  short: the full checks once on the final commit, the maintainer pushes
  and tags, `release.yml` builds and publishes, then the install is backed
  up, updated and checked. Pushes and tags are the maintainer's.
- **Every Monday** `weekly-check.yml` checks that the released version
  still installs (assets, images, models on Hugging Face, pinned
  dependencies, the website) and opens an issue labelled `weekly-check`
  when something fails.
- **Rules for anyone changing the code**, human or agent:
  [AGENTS.md](../AGENTS.md). Code style and commits:
  [CODE_STYLE.md](CODE_STYLE.md). Environment variables:
  [ENVIRONMENT.md](ENVIRONMENT.md). UI: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- **Privacy:** [PRIVACY.md](../PRIVACY.md). Nothing leaves the machine
  unless a Gemini key is added.

## 9. Where things are

| Path | What |
|---|---|
| `frontend/` | Next.js app |
| `backend/` | FastAPI API, Celery worker, migrations, tests |
| `install/` | `install.sh`, `install.ps1`, `vcm`, `vcm.ps1`, `vcm.cmd`, their tests |
| `docker-compose*.yml` | dev stack, production, the GPU overlay |
| `scripts/` | E2E (`e2e.py`), UI checks (`ui-check/`), quality and release tools |
| `.github/workflows/` | `ci`, `arm64`, `release`, `pages`, `weekly-check` |
| `site/` | the website |
| `docs/` | the source of truth; [AGENTS.md](../AGENTS.md) lists which doc to read before touching what |
| [PROGRESS.md](PROGRESS.md) | the working log: every release's plan, measurements and checks |
