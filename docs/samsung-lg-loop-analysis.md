# LG application-loop reference and Samsung implementation

## Source and evidence boundary

The owner selected the **LG/webOS application shown inside the demo**, not the styling of
[plxnative.com](https://plxnative.com/#feel), the LG launcher or a generic streaming service.
The inspected asset is [`feel-1080p60.av1.mp4`](https://plxnative.com/media/feel-1080p60.av1.mp4).
Its duration is approximately 27.35 seconds. The website identifies the footage as frame-by-frame
webOS simulator output using an openly licensed library. This is a composition reference, not
independent reproduction on an LG television and not evidence of Samsung support.

The complete loop was sampled at 0.5, 1.5, 2.5 and every subsequent half-second timestamp through
26.5 seconds: **27 captures across the whole timeline**. These are timeline samples, not 27
different screens or an exhaustive capture of all 60 frames per second. Opening fades and
transitions were distinguished from settled compositions. Reference captures and synthetic
Samsung comparison images remain private session artifacts; no household photos, reference
movie imagery or title logos are shipped as Samsung assets.

## Screen and interaction inventory

| Representative time | Visible state | Layout and usability lesson |
|---|---|---|
| 0.5 s | Opening background/fade | Do not grade an incomplete transition as an empty Home |
| 3.5 s | Spring featured on Home, information control focused | One title, short metadata/synopsis, distinct primary and information actions |
| 6.5 s | Sintel featured, Continue focused | Resume is the clear primary action; white focus belongs to the button, not a large surrounding box |
| 9.5 s | Home shelves, Tears of Steel focused | Poster grows slightly; title and minutes remaining appear beneath the focused poster |
| 12.5 s | Tears of Steel movie detail | Cinematic backdrop, Resume plus compact secondary controls, credits and cast below |
| 15.5 s | Home shelves again | Return to browsing preserves the same visual system |
| 16.5 s | Shelf-to-feature transition | Intermediate overlapping content is transition evidence, not a target static layout |
| 18.5 s | Home navigation focus | Navigation remains available independently of the content's current vertical position |
| 21.5–22.5 s | Movies selected with shelves visible | A selected destination is distinct from remote focus; the same capsule and poster language persists |
| 24.5 s | Movies navigation focus over featured composition | Switching destinations does not require a separate full-page action menu |
| 26.5 s | Sintel Home feature and shelf edge | Full-screen art, lower-left feature actions, position dots and posters meet in one composition |

The loop repeats featured-title, shelf and destination states. It shows **Home, movie detail and
library/destination navigation**, not Settings, pairing, episodes, a player menu, DVR, music or
photos. Those other Samsung routes cannot honestly be described as pixel reproductions of this
video. Their layouts retain the existing shared neutral control system and the simpler interaction
patterns described below.

## Composition measurements

These are approximate normalized measurements of settled reference samples, not a claim about
the upstream renderer's exact design tokens.

| Element | Reference observation | Samsung implementation |
|---|---|---|
| Safe inset | Profile and left content begin around 5% of viewport width | `5vw` inset for Account, feature and shelves |
| Navigation | Centred translucent rounded capsule near the top; separate profile at left | Fixed Home/favourite-library/Search capsule and separate Account control |
| Backdrop | Artwork spans the viewport with dark readability gradients | Full-bleed feature image and scrims; previous image node replaced on feature change |
| Feature copy | Large title/logo, one metadata line, short synopsis in the lower-left region | Real title text, metadata and two-line synopsis; no fabricated title logo |
| Primary action | Filled Continue/Resume control, adjacent round information/secondary controls | Explicit Play/Continue, info and next-feature buttons with accessible names |
| Feature position | Small dots beneath the feature | Up to eight deduplicated featured titles and position dots |
| First shelf | Poster edge enters around 75–80% of the reference viewport | Shelf meets the feature within the first viewport; exact placement varies with viewport/copy |
| Poster focus | Small scale increase without a large border; focused caption stands out | 1.06 scale, attached progress bar and focused-only Home title/remaining-time caption |
| Shelf mode | Persistent navigation, focused shelf below it | Focus-aware scroll alignment and hidden feature content when shelves are active |
| Detail | Backdrop-led composition, short copy, restrained action strip, cast below | Approximately 82vh hero, expandable synopsis, primary plus round restart/More controls |

Samsung deliberately uses explicit feature cycling rather than a timer that changes a title under
the remote. The actual Plex library names replace hard-coded Movies/TV Shows labels; other
library types remain accessible. Title text is used because this Samsung metadata path does not
supply the upstream demo's logo artwork. Synthetic preview artwork contains its own lettering;
cropped lettering in those fixtures is not a second product title or evidence about real posters.

## Usability changes and retained behavior

- Down from navigation reaches the feature; Down again reaches the first shelf. Up from that
  shelf restores the feature. Horizontal action rows traverse adjacent controls deterministically.
- Displaying, focusing and cycling features never starts playback or writes watch state.
  **Activating Play/Continue does**; information opens details. Show playback still resolves the
  PMS-selected on-deck episode instead of treating a show ID as a playable leaf.
- Account utilities are reachable at the top rather than below every shelf. Back closes that
  panel first. Existing profiles, server choice, settings and service routes remain available.
- Detail secondary actions live behind More instead of a wall of pills. Back closes More first.
  Read more, on the Play row, opens the full synopsis in a modal; watch-state changes retain confirmation.
- A show's page lists the episodes of its seasons directly; choosing a season from anywhere opens that page on it.
  Episode browsing retains episode identity, progress and stills; Home prefers series posters.
- The player retains its compact transport/progress system and five-second playing auto-hide.
  Seek controls expose the configured skip interval. Back from a submenu returns to Playback
  options before dismissing the menu; Stop, tracks, chapters and quality remain reachable.
- Source-file quality, PMS-reported stream quality and requested transcode limits remain separate.
  This redesign changed no playback policy; direct play now follows `js/capabilities.js` predictions.

The pre-change adversarial assessment found invisible utility focus, unreadable full synopses,
boxed Home composition, excessive detail actions and a deep season journey. Those findings
informed the changes above. That assessment evaluated the earlier tree, **not a post-change
PASS verdict**. Automated design-detector warnings were reviewed in TV context, not treated as
proof that browser heuristics certify couch usability.

## Acceptance and remaining differences

The implementation described by this dated analysis changed only the Samsung Web app
and its tests/documentation. The LG Rust renderer was unchanged in that revision;
it is now retired from the active tree, with its original source retained in history.
Host DOM journeys exercise actual Samsung UI code against synthetic Plex/AVPlay responses.
Browser captures at 1280x720 and 1920x1080 establish host composition and directional focus,
not Samsung font rasterization, legacy-engine rendering, remote latency or hardware playback.

The initial revision was host-only. The subsequent signed `7c6f7158` package was installed on
the owner's 2017 UE55MU6172 on 2026-10-11; genuine sign-in and initial browsing paint layers
were captured. A full recorded LG-loop comparison is still in progress. Installation and
those partial captures do not certify all layouts or any 2018+ model. The wider
[product acceptance gaps](samsung-tizen-client-spec.md#current-acceptance-gaps)
remain open. Current authorized acceptance must include feature/shelf transitions,
long library names, long titles, synopsis expansion, account/More return paths, season navigation
and player-menu dismissal/auto-hide on the named model and firmware. Native performance,
codecs, actual stream decisions and The Frame lifecycle require their own evidence.
