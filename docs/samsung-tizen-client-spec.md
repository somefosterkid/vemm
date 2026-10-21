# Samsung Tizen Plex client: product specification

**Status:** implementation in progress; Samsung runtime acceptance outstanding

The focused [upstream-readiness backlog](samsung-upstream-readiness.md) separates remaining
LG movie/show parity gates from the expanded official-client/service scope. No readiness
announcement is authorized by source completeness or installation alone.
**Product target:** a full Samsung Smart TV Plex client with feature parity to the supported
PlxNative feature set, not a proof-of-concept app. Implementation may land in vertical slices; the
completed product is not reduced to the first slice.
**Platform direction:** a separate Samsung Tizen TV Web application (`.wgt`), JavaScript delivered
as an ES5-compatible bundle for the oldest intended engine, and AVPlay for the hardware playback
path. The LG application/build are retired from the active tree under the
[approved independence plan](samsung-repository-independence-plan.md); their
history and licensing remain.

This document is the product and acceptance contract for implementation. Samsung evidence and
model-specific results live in the [feasibility study](samsung-tizen-feasibility.md) and
[test register](samsung-tizen-poc.md). The cross-app tooling and repeatable development workflow
are specified separately in the [Samsung Tizen development process](samsung-tizen-development-process.md).
A requirement marked **TBD** is not a permission to invent a platform capability; resolve it with
Samsung documentation, an emulator probe, or a test on the named retail model before depending on
it.

**Implementation status:** `samsung/Vemm/` remains a separate Tizen 3.0 Web app. It now contains
short-code/QR authorization, Home profiles/PIN entry, owned/shared server discovery, Home shelves,
paged libraries, sort/filter/alphabet menus, collections, multi-server search, metadata/person
details, an isolated AVPlay adapter, PMS playback negotiation/progress, player controls, chapters,
markers, track/quality/version menus, text captions, Up Next and settings. These are source
implementations, not a Samsung support declaration. Tests exercise synthetic account/server
contracts and the real app DOM with fake networking/AVPlay, including a 250-item library with a
200-card retained window, explicit watch-state confirmations and cancellation. Playback requests
server-side audio/subtitle selection before negotiation and asks PMS to join multipart titles.
ES5 parsing and an unsigned Samsung source build are separate gates.
The sign-in PIN and its QR renew automatically on local or Plex-reported expiry, including
when a poll stalls. Failed PIN acquisition retries after five seconds with a visible error;
denial still requires an explicit retry. PIN renewal is independent of credential-storage choice,
which is kept in Settings rather than the link/QR screen; stale polls and timers cannot complete an
older pairing. Backgrounding or leaving pairing cancels renewal.
Samsung menu styling follows the LG implementation's capsule navigation and icon-bearing form
rows (`rust-modules/ui/src/widgets.rs`'s `TabStrip` and `rust-modules/ui/src/theme.rs`'s control
roles), rather than reusing its renderer. Home destinations appear above the shelves; settings
show selected values independently of focus and retain the focused row after preference changes.
These behaviors have synthetic UI coverage; browser previews are not Samsung-panel evidence.
The all-screen redesign now applies this same neutral, remote-first system to profiles/PIN,
servers/favourites, Home, libraries/collections, search, every detail/media variant, people,
Watchlist/catalogue, guide/DVR subviews, photos, settings/diagnostics and confirmations/states.
`samsung/DESIGN.md` records the built layouts and legacy-engine constraints. Library paging
restores the focused title by identity; empty searches do not query the server; Home's featured
title obeys the same favourite-library filter as its shelves. The show primary action requests
`includeOnDeck=1` and opens/resumes the server-selected episode, accepting either object or array
`OnDeck.Metadata`; it never submits the show itself as a playable leaf. Without an on-deck episode,
Seasons remains the navigation path.
The playback overlay uses a compact transport row and progress bar. Chapters, tracks, quality,
playback information, music-queue controls and Stop live under More rather than covering the
video in two rows of always-visible buttons. It hides after five seconds of uninterrupted play,
while subtitles remain independent and errors remain visible.
The owner's screen photos exposed excessive focus borders, crowded Settings, mixed episode
artwork and technical playback copy. The host-only follow-up removes outer button/poster focus
borders, limits detail synopses to two lines, puts Home/library/Search destinations together and
uses series posters on episode shelves when available. Settings exposes one quality/language
value with separate choice pages; audio and subtitles have distinct groups and native tracks
are secondary. Closing player menus returns focus to More. Original-source metadata, the
PMS-reported stream and the requested transcode limit are now distinct; missing output metadata
is not replaced with the chosen limit. Original direct play is capability-gated (see the Direct play row in §9A). These changes were included in the signed `7c6f7158` deployment;
installation does not establish native acceptance of every screen or playback behavior.
The LG-inspired revision follows the application demo loop: full-bleed Home artwork,
persistent capsule navigation, a top Account menu, explicit feature play/info/cycling, focused-only
Home poster captions, expandable detail descriptions and secondary actions behind More.
Season selection opens episodes directly. The [loop analysis](samsung-lg-loop-analysis.md)
records the 27 timeline captures, composition measurements, interaction mapping and deviations;
the loop does not show every LG screen. The installed revision has genuine native sign-in and
initial navigation captures; the full loop comparison, playback performance and complete
LG/official-Plex parity remain unverified.
The installed emulator has not launched on this Apple-Silicon host. Developer-signed application
installation/launch has been observed on the owner's Samsung; that is an install/launch smoke
result, not a pass for every redesigned screen, codec, performance target or retail model.

## 1. Product outcome

Deliver a couch-usable Samsung Tizen TV app that signs into Plex, connects to the user's own or
shared Plex Media Servers, browses and searches their libraries, and plays media while keeping Plex
as the authority for libraries, watch state, and playback progress. The app must neither replace
PMS nor silently write viewing state outside normal, user-initiated playback and explicitly
approved tests.

The original baseline was PlxNative's movie/television feature set. The owner's subsequent
instruction requests **all features of the actual Plex app**; the original exclusions cannot be
used to call this work complete. Music/photos and portions of DVR/Watchlist now have host
implementations, but full parity and native acceptance remain outstanding. Official-client features that depend on Plex
entitlements, licensed services or private distribution contracts also need source-backed
availability evidence; do not invent an API or silently substitute a different media server.
The requirements below describe the movie/TV implementation contract, not an assertion of complete
official-Plex parity.

### Current acceptance gaps

| Surface | Existing implementation/evidence | Required before completion |
|---|---|---|
| Account/profiles/servers | Synthetic short-code, PIN, scoped grants and recovery tests | Actual Plex and Samsung TLS/CORS, profile PIN acceptance, QR and relaunch checks |
| Browse/search/details | Mock PMS and host DOM journeys; paged collections and career pages; GUID availability index | Full remote navigation, search cancellation, large-library/image memory and text-fit evidence; career pages retain 50 controls and local indexing has an explicitly reported 10,000-title safety ceiling |
| Playback/progress | Fake AVPlay state/seek and PMS decision/timeline/read-back tests | Named-model native playback, direct/transcode, HDR/audio, native/external/burned subtitle matrix |
| Direct play | Host: js/model-register.js binds exact retail model, family, firmware and Tizen version. Only UE55MU6172 / T-KTMDEUC-1410.1 records H.264 1920x1080 MKV and HEVC 3840x1600 video direct-play observations from docs/samsung-upstream-readiness.md. Other models, and media outside those observations, use the profile predicted from Samsung's published media specifications for the Tizen version and panel (`js/capabilities.js`, status "documented", not measured), which may request direct play. Settings Direct Play Auto/Force/Off and Diagnostics expose which evidence applies; a future verified complete tuple is advertised to PMS and decoder refusal still falls back | Native identity matching and output on the revised policy; previous builds do not verify this new register |
| Up Next/quality/versions | Source implementation with opt-in auto-next; multipart titles request a joined PMS transcode (`partIndex=-1`), never direct-play just the first file | Long sessions, interrupted transitions and actual server/native multipart joins, resume and completion |
| Settings/languages | Non-secret preferences, English/Spanish/Belarusian catalogs, static app-copy coverage and named placeholders | Dynamic errors/copy coverage and physical-TV text fit |
| Credential persistence | Saves the original account token automatically in unencrypted TV storage; Settings opt-out and sign-out deletion; old opt-in records remain readable | TV storage/relaunch/update/deletion behavior; storage is not encryption at rest |
| Lifecycle/input | Background stop, explicit foreground resume, cancelled view reads and coalesced progress queue; synthetic journeys | Physical remote repeats/holds, process-exit reconciliation, suspend/wake and The Frame Art Mode |
| Official Plex ecosystem | Music/photos, guide discovery, DVR scheduling/management and Watchlist read/mutations have host implementations | Live tuning/consumer lifecycle, licensed catalogue playback, server acceptance and remaining parity |
| Distribution/support | Signed `.wgt` from `samsung/build.py`/`release.py`; public prereleases installed with the tizen-tv-builder toolkit | Authorized signing/install, current-app model register and separate Store/legal decision |
| Bounded HTTP bodies | Incremental 4 MiB byte ceiling and full-request deadline; stalled/oversized synthetic streams tested | Real browser streaming/UTF-8/blob APIs; older engines without bounded streaming currently fail explicitly rather than buffering an unbounded body |

No row becomes complete solely because the source builds or a fake adapter returns success.

Playback rejects a media version whose Part has no video/audio Stream (audio for music) before
creating a PlayQueue or asking PMS for a decision. It reports that the file cannot be played and
may be damaged or not analyzed. A decision HTTP 400 gets the same translated guidance; other
HTTP failures retain their status. A generic HTTP 400 does not establish a decoder or network fault.
Unset audio stream IDs are omitted from decision/start queries, matching the LG default-track
contract. This does not repair an incomplete or corrupt source file.

## 2. Intended compatibility and evidence policy

- Intended target floor: Samsung Tizen TVs from model year 2017 onward, initially covering the
  owner's 2017, 2019, 2023 and 2025 sets. 2017 Tizen 3 / Chromium M47 is the oldest observed
  development target, not a compatibility guarantee for every 2017 model.
- The first implementation bundle must run without WebAssembly and without relying on JavaScript
  syntax newer than the 2017 target supports. Transpile and test the shipped bundle as ES5; use
  capability detection for optional APIs.
- Maintain a support row per tested model code, firmware, engine and meaningful model group.
  Emulator results are reported separately from retail-device results. Do not claim a year or
  product line supported from a single model's result.
- Use Samsung's TV emulator for package, runtime, navigation and lifecycle development where its
  model image exposes the behavior. Use named retail TVs for codec/HDR/audio/subtitle output,
  device memory and performance, suspend/resume, and any emulator gap.
- The initial target is all Samsung TVs on which the app passes its declared baseline matrix; it is
  not permission to promise universal 2017+ support. Pre-2017 Tizen TVs are out of scope.
- The Frame is not currently in the available hardware set. Treat Art Mode, standby, wake and
  restore as a separate lifecycle tier; do not infer them from other TVs of the same year.

## 3. Users and primary journeys

1. **First use:** launch the app, sign into Plex with an on-screen QR flow, select a Plex Home
   profile where applicable, choose an available server, and land on Home. Account linking and
   installation guidance are shipped near release, after product development and testing.
2. **Find something to watch:** browse Home shelves or a server library; sort, filter, navigate the
   alphabet rail, search across reachable servers, and open details for a film, show, season,
   episode, collection or person.
3. **Watch:** start or resume playback, see the actual selected version/source, control transport,
   seek and scrub, choose audio/subtitle tracks, use chapter and marker actions, and return to a
   useful screen. PMS receives normal playback timeline/progress updates.
4. **Continue later:** Home and library views reflect PMS watch state and continue-watching
   position. Progress is not synthesized locally as the source of truth.
5. **Recover:** handle unavailable servers, auth expiry, unsupported tracks, playback failures,
   loading and empty results with actionable couch-readable states and retry/back behavior.
6. **Configure:** manage account/server selection, playback preferences, language, privacy/telemetry
   consent, diagnostics and app information through TV-remote navigation.

## 4. Functional requirements

### 4.1 Account, session and servers

- **AUTH-1:** Support Plex account sign-in using a QR/device authorization flow; never require
  typing a Plex password into the TV app.
- **AUTH-2:** Support Plex Home profile selection, sign-out, account/session expiry, and returning
  to sign-in with a clear explanation when reauthentication is needed.
- **AUTH-3:** Discover the user's owned and shared servers, select among them, and handle servers
  that are unavailable, indirect/relayed, or require TLS according to tested Plex behavior.
- **AUTH-4:** Keep the account token out of URLs where headers are supported, UI, logs, screenshots,
  crash reports and analytics. Redact credential-bearing request targets. On sign-out remove
  account credentials from app storage.
  *Stream URL exception:* AVPlay's `open(url)` cannot send request headers, so the PMS token is
  appended to the media URL by `streamUrl` in `js/plex-api.js`, as LG does in
  `plex/src/plex/client.rs`. This URL goes only to `avplay.open`. Adapter errors and events carry
  fixed text, never native error strings, and `tests/tizen/stream-token-exposure.test.js` fails if
  the token can reach a rejection or emitted event. Every token-bearing `fetch` keeps the token in a
  header with `redirect: "error"`; the profile-artwork fetch sends no token.
- **AUTH-5:** Investigate Samsung's supported private/secure storage options and threat model before
  deciding whether localStorage, another web storage API or a platform service is acceptable for
  credentials. Do not claim encryption at rest without verified platform evidence.
- **AUTH-6:** If telemetry/crash reporting is included for parity, each category is off until
  separately consented to, revocable in settings, and constrained to the current PlxNative privacy
  schema. It must never include titles, search terms, subtitle text, server names or addresses.

### Package-time origin policy

`config.xml` intentionally keeps `<access origin="*" subdomains="true"/>`. A user's PMS
origins are arbitrary: LAN IPs, `*.plex.direct` hosts and custom domains cannot be enumerated
at package time. The manifest permits networking; it does not authorize sending credentials
anywhere. Account tokens are sent only to `plex.tv` (including the fixed Plex-owned
`discover.provider.plex.tv` and `metadata.provider.plex.tv` endpoints); server tokens are sent
only to user-selected PMS servers or the user's explicitly selected/discovered server grants.
Token-bearing fetches keep credentials in headers, omit cookies and use `redirect: "error"`
so a redirect cannot forward a token to a different origin. External profile-artwork requests
carry no Plex token. The AVPlay stream-URL exception and its separate token-exposure control
remain as described in AUTH-4; this fetch policy is not a claim that AVPlay can enforce redirects.
Host manifest, account and transport tests pin these constraints; packaged-runtime TLS/CORS
and redirect behavior still require named-device acceptance.

### 4.2 Browse, search and metadata

- **BROWSE-1:** Home presents useful Plex-backed hubs/shelves, including continue-watching and
  recently added content when the server supplies them.
- **BROWSE-2:** Support movie and TV libraries, shows, seasons and episodes; paginated loading;
  recently added/unwatched shelves; sort, server-provided filters, unwatched-only views and
  alphabet/first-character navigation.
- **BROWSE-3:** Search reachable servers and group results by supported media kind. Search state,
  query and focus must be controllable using the supported Samsung remote/input model.
- **BROWSE-4:** Item details show available metadata, artwork, synopsis and available actions.
  Support show/season/episode navigation, collections, related items, extras/trailers, cast/crew,
  person information and filmography when supplied by Plex endpoints.
- **BROWSE-5:** Preserve server-provided ordering, identifiers and access-denied distinctions.
  Missing optional metadata is not an error; authorization failure is not an empty library.
- **BROWSE-6:** Avoid fetching or retaining unbounded image/catalog data. Paginate, cancel stale
  requests, and bound image and metadata caches for low-memory TVs.

### 4.3 Playback and progress

- **PLAY-1:** Use Samsung AVPlay as the default hardware playback adapter; encapsulate AVPlay behind
  a typed playback interface so UI/state orchestration does not call `webapis.avplay` directly.
- **PLAY-2:** Negotiate direct play versus PMS transcode from the selected media, the exact TV's
  measured/documented capabilities, subtitle choice, server response and user quality preference.
  Do not infer support from filename, year alone, `MediaSource.isTypeSupported`, or another model.
- **PLAY-3:** Support play/resume, pause, stop, backward/forward seek, continuous seek/scrub, landed
  playhead display, buffering/waiting/error states, and return/navigation behavior. Show the
  actual landed position when AVPlay keyframe-snaps a seek.
- **PLAY-4:** Report start, periodic timeline, pause/stop and completion to PMS using the relevant
  Plex protocol. Reconcile read-back from PMS and handle interruption/relaunch without inventing
  progress. Only explicit playback actions may make these state changes.
- **PLAY-5:** Support audio stream enumeration/selection, default-track behavior, and safe switching
  during playback where the target API requires it. Unsupported tracks must fail clearly without a
  hang or silent loss of the working track.
- **PLAY-6:** Support embedded text subtitles, external text subtitle retrieval/rendering, and
  server-side subtitle transcode/burn-in where local rendering is unsupported. Investigate ASS/SSA,
  PGS and VobSub individually; never claim subtitle parity from an embedded-SRT result.
- **PLAY-7:** Support chapters, Skip Intro, Skip Credits, Up Next/auto-advance, track menus, playback
  information and quality/source selection where Plex exposes the required data and action.
- **PLAY-8:** Preserve source aspect ratio. Select and verify AVPlay display modes explicitly;
  non-16:9 material must not be stretched. Define HDR signaling and picture-quality expectations
  per tested model and media format.
- **PLAY-9:** Playback loss, server refusal, DRM/codec/API failure and timeout have distinct
  observable, recoverable states. The app can return to detail/Home and retry; no unbounded spinner
  or black-screen success state is acceptable.
- **PLAY-10:** Test direct-play and transcode paths separately, across the declared model matrix.
  A 1080p H.264 pass is not a 4K, HDR, audio or subtitle pass.

### 4.4 TV UI, settings and lifecycle

- **UI-1:** Provide a TV-first 10-foot interface with complete remote-control operation, visible
  focus, consistent back behavior, safe-area layout, couch-readable typography and no required
  mouse, touch or keyboard.
- **UI-2:** Implement Home, library shelves/grid, search, detail, collection/person, profiles/login,
  player/HUD/menus, settings, diagnostics, privacy and failure/empty/loading states.
- **UI-3:** Support press, release, repeat/long-press and directional navigation according to the
  physical/emulated remote. Prevent duplicate actions from key repeat, focus loss and lifecycle
  restoration.
- **UI-4:** Maintain per-screen focus and scroll state across supported navigation and transient
  app suspension. Cleanly restore or restart after foregrounding, app exit/relaunch and network
  loss.
- **UI-5:** Include language selection/translations for the supported PlxNative languages, and test
  text fit at actual TV sizes. Server-owned/user-owned strings may need elision; app-owned text
  should remain complete and couch-readable.
- **UI-6:** The Frame Art Mode, standby/wake and background playback policy require a separate
  tested contract before that model family is marked supported.

## 5. Non-functional acceptance

- The UI and all core navigation are operable by remote only; every screen has explicit focus,
  loading, empty, failure and back behavior.
- On the oldest supported model, library navigation remains responsive under a representative
  200-item result and posters load progressively. The 2017 probe's scripted median focus latency
  was 49 ms in a deliberately simple page; target the same 150 ms median maximum for product
  navigation, and separately measure p95/max on device.
- Cold launch, first useful Home content, detail open, first frame, image memory, peak memory, long
  session stability and recovery have numeric budgets set per model tier before performance signoff.
  The existing POC's first-frame-under-5-seconds and zero unrecovered stalls over ten minutes are
  initial playback gates, not already-proven full-app budgets.
- Do not block the UI thread on network, image decode, AVPlay waits, parsing or file/storage
  operations. Bound concurrency, response sizes, queues and caches.
- Log typed state transitions and redacted diagnostics sufficient to explain failures without
  collecting private library data.
- Every shipped runtime bundle must pass static checks for accidental token/URL inclusion, JavaScript
  engine compatibility, package privileges and app identifiers.
- CI/host tests are necessary but insufficient: release signoff includes the Samsung emulator and
  at least one retail set for each declared supported model group, with playback-specific checks on
  the physical device.

## 6. Architecture contract

### 6.1 Product separation

- Keep the Samsung client in the independently buildable `samsung/Vemm/` Tizen
  Web application. Vemm uses `VemmTvApp0.Vemm` and its own future author;
  historical Plx package identity/releases remain unchanged and separate.
  Native Rust/C references below describe the immutable
  [pre-migration source](https://github.com/dragoshont/plx-native/tree/f74610c8e8fda765245f548adcc6565becdca31b),
  not current local modules or build dependencies.
- Do not attempt to ship PlxNative's webOS-native executable, GLES/SDL renderer, `libcurl` seam,
  FFmpeg ABI bindings, Starfish/ACB interfaces or LG storage services on Tizen.
- Initially reuse PlxNative as the behavioral/API/test oracle: API notes, fixtures, mock PMS,
  feature definitions and protocol decisions. Its current Rust layers are not assumed reusable in
  a 2017 browser runtime.
- Do not make WebAssembly a requirement. A later 2020+ optimization may be considered only if
  profiling proves a benefit and the baseline JavaScript implementation remains the reference.

### 6.2 Proposed Tizen client boundaries

1. `platform/`: AVPlay adapter, key/remote input, app lifecycle, capability discovery, private
   storage and image/media presentation.
2. `plex-api/`: typed Plex HTTP/XHR transport, auth/device-link flow, server discovery, request
   cancellation and redaction.
3. `domain/`: server-independent media/session models, browse queries, navigation/playback state,
   marker/progress policy and error taxonomy.
4. `features/`: account/profiles, Home, library, search, detail, collection/person and player
   orchestration; state changes occur through owned transitions/events rather than screen-to-screen
   mutation.
5. `ui/`: shared tokens, remote focus/navigation, cards/shelves/grids, dialogs/menus, text fitting,
   overlays and localization.
6. `tests/`: domain unit/contract tests, mocked PMS integration tests, deterministic UI navigation,
   bundle compatibility checks, emulator scenarios and the retail-device test register.

The primary runtime is browser JavaScript packaged in `.wgt`. Use TypeScript or another typed source
language only if the build demonstrably emits an ES5-compatible artifact. Decide the bundler,
transpiler/polyfills, component model, secure-storage implementation, image cache and AVPlay event
adapter through short, measured architecture spikes before locking the production stack.

### 6.3 Architectural decisions to resolve before depending on them

| Decision | Required evidence | Safe default until resolved |
|---|---|---|
| Source language and ES5 toolchain | Bundle syntax scan + Samsung emulator + 2017 browser probe | Emit plain ES5 JavaScript; no Wasm |
| UI composition/rendering | Emulator input/focus probe and 200-item retail grid memory/latency run | DOM/CSS, virtualized lists, one focus owner; avoid large unbounded trees |
| Credential storage | Samsung TV API documentation and model probes; sign-out/deletion tests | Keep credentials out of logs/URLs; do not claim encrypted storage |
| Direct play/transcode decision | PMS decision/API contract plus per-model codec and AVPlay tests | Predict from Samsung's published specifications; PMS or decoder refusal falls back to conversion unless Direct Play is Force |
| Subtitle rendering | AVPlay capability docs and independent embedded/external/ASS/PGS/VobSub tests | Prefer text overlays only for verified formats; request server-rendered fallback |
| Image strategy | PMS transcoder behavior, cache ceilings, low-memory testing | Server-resized images, progressive loading, bounded cache |
| User telemetry | Privacy/legal review and Tizen-compatible transport | Off, absent unless explicit separate consent and verified implementation |
| Store distribution | Samsung Seller Office and Plex policy review | Treat as unresolved; local developer sideloading is not Store approval |

The initial runtime uses plain ES5 modules under `js/` (Plex transport, AVPlay, playback protocol,
subtitles, preferences, sessions and generated translations), composed by `main.js`. This is
not a Rust/Wasm port. Acorn parses every shipped JavaScript file with `ecmaVersion: 5`; this proves
syntax only, not availability of fetch/Promise/URL or other APIs on an old TV. Host-only npm
dependencies live under `tests/tizen/` and are not packaged in the application.
The HTTP path also requires response streaming (`body.getReader()`), UTF-8 decoding and blobs.
That is a separate runtime gate; the ES5 check alone does not establish it. The owner's 2017
Tizen 3.0 (Chromium M47) set — older than every 2018+ target — runs this streaming path on device
for sign-in, browsing, artwork and playback negotiation. An `XMLHttpRequest` fallback was
considered and rejected: XHR follows redirects silently and re-sends custom headers, which would
weaken the `redirect: "error"` policy that keeps `X-Plex-Token` from reaching a redirect target.
An engine without streaming fetch therefore fails closed with "This TV runtime is not supported
yet" (`tests/tizen/response-limits.test.js`) instead of downgrading transport security.

Music libraries now navigate artists/albums/tracks and use the universal music transcoder with
an HTTP MP3 request. Album queues are local, capped at 200 tracks, with shuffle and repeat
off/one/all; they are not PMS PlayQueues. Photo libraries open a page-local viewer/slideshow,
fetch server-resized images, enforce the response ceiling and a 15-second decode deadline, and
release object URLs on replacement/back. Synthetic real-app journeys cover both features;
MP3 delivery, photo formats and native output remain unobserved on Samsung hardware.
Read requests owned by the current client can be cancelled on navigation; explicit mutations and
playback cleanup are not cancelled by view replacement. Discovery/search clients are registered
with the view owner, including identity probes, so obsolete reads are cancelled and retries do not
probe more connections after cancellation. Legacy-engine transport still needs completion.

The guide/DVR feature is separated into `television.js` and `television-ui.js`. It reads existing
EPG providers, guide shelves/channel lineups, subscriptions and scheduled recording statuses.
Recording templates come from PMS; their encoded hint/parameter values are decoded once and
re-encoded once, preserving nested percent encoding. Scheduling and subscription cancellation
require explicit confirmation and suppress duplicate clicks. Scheduling is offered only for
providers advertising `subscribe` with flavor `record`; tuner setup and automatic conflict
resolution are not performed. Recording preference controls follow server-supplied settings;
the bracketed preference wire shape follows the vendored OpenAPI's `style: deepObject` contract.
Actual PMS acceptance and conflict/status behavior still require an authorized test server.

Sources: vendored `docs/plex-openapi.json`, `/media/providers`, `/livetv/epg/channels`,
`/media/subscriptions`, `/media/subscriptions/template`, and `/media/subscriptions/scheduled`.
Live tune returns a media UUID without a normal PMS rating key. The documented HLS path has
a separate `consumerId`, but consumer allocation, keepalive and release are not established;
there is intentionally no speculative Tune/Play action allocating a tuner without reliable cleanup.

Watchlist uses the account token at `discover.provider.plex.tv`, not a PMS grant.
Read: `/library/sections/watchlist/{all|available|released}`. Explicit add/remove use PUT
`/actions/addToWatchlist` and `/actions/removeFromWatchlist`; `ratingKey` is the final segment
of a validated `plex://movie|show/{24hex}` GUID, never a numeric PMS item ID.
Source: [python-plexapi MyPlexAccount](https://github.com/pushingkarmaorg/python-plexapi/blob/8a9ade7f364582cabb6d5bc200994fddb2113d48/plexapi/myplex.py),
`watchlist`, `addToWatchlist`, `removeFromWatchlist`. These are maintained-client implementation
evidence, not official Plex cloud API documentation or independently observed account behavior.
Cloud search uses Discover `/library/search` with `searchProviders=discover`, and consumes the
external `SearchResults[].SearchResult[].Metadata` group. Details use the returned validated
metadata key at `metadata.provider.plex.tv` with `includeUserState=1`.
Local availability is resolved by exact GUID per movie/show library:
`/library/sections/{id}/all?includeGuids=1&guid=...`, with each server's own token, and matching
GUIDs are checked again in the response. It is not a title-only guess.
Source: the pinned client's `searchDiscover`, `_toOnlineMetadata`, and
[LibrarySection.getGuid](https://github.com/pushingkarmaorg/python-plexapi/blob/8a9ade7f364582cabb6d5bc200994fddb2113d48/plexapi/library.py).
Catalogue search displays at most 30 returned results, local matching at most 200 cards.
Licensed/ad-supported playback remains disabled: personal-library decision schemas do not
establish cloud streaming authorization, ad obligations or DRM. The absence of a DRM flag in
that schema is not evidence that catalogue content is unprotected.

Backgrounding cancels auto-next, stops native playback and attempts final timeline/cleanup.
Foregrounding reloads details but never restarts playback without a user action. Photo resources
and pairing polls are stopped while hidden; non-player views restore with focus/scroll state.
Process termination can interrupt final network writes, so pagehide cleanup is best effort,
not a guarantee of server reconciliation after a killed process.
Periodic progress keeps one in-flight request and one coalesced pending sample; terminal stopped
state takes priority, avoiding an unbounded queue during a slow/offline session.

Samsung documents [Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html),
not encryption at rest. At the owner's explicit request, successful sign-in now saves the
original Plex account token automatically, unencrypted on this TV. Settings can disable saving,
and that opt-out survives sign-out. Version-1 explicitly accepted records remain readable;
new version-2 records describe storage without inventing historical consent. Protected Home profiles
must still be selected and PIN-authorized. Sign-out and expiry recovery attempt deletion, and a
deletion failure requires the user to clear app data rather than claiming a secure sign-out.
No telemetry/crash upload transport is installed.

## 7. Verification contract and test register

Retain and extend `docs/samsung-tizen-poc.md`'s test register. Give every test an ID and record app
revision, target model/firmware, source/media class, clean/cold or warm state, procedure, numeric
criterion, result and evidence category.

Required evidence categories: source-backed/vendor-documented, host unit/integration, mock PMS,
Samsung-emulator-observed, owner-observed, and retail-device-observed. A claim must name which one
supports it. The emulator cannot prove actual decoder, HDR, audio, subtitle, panel, memory-pressure
or physical remote behavior.

Product acceptance suites:

- **AUTH:** QR pairing, profile selection, multi-server discovery, unavailable server, expiry,
  reauth, sign-out and credential/log redaction.
- **BROWSE:** Home hubs, paging, large library grid, image failure/retry, all supported filters and
  sort metadata, letter navigation, global search, metadata details, seasons/episodes, collections,
  cast/person, related items and extras.
- **PLAY:** HTTPS/direct-play H.264, HEVC and applicable UHD/HDR classes; server transcode; supported
  and unsupported audio; each subtitle mode; track selection; pause/resume; forward/backward seek;
  chapter and marker actions; Up Next; progress report/read-back; long playback; app/server
  interruption and retry.
- **UI/LIFECYCLE:** TV remote navigation, repeat/hold behavior, every screen's focus/back path,
  large text and localization, orientation/safe area, memory/long-session stability, suspend/resume,
  relaunch, and The Frame Art Mode if claimed.
- **PRIVACY/SAFETY:** no background playback-start or account mutation; timeline writes only during
  user-initiated playback; consent defaults off; no secret leakage in source, package metadata or
  logs; a test profile/server for all write-path testing.

Exit gate for each support row: emulator smoke and navigation pass; host/mock suites pass; on a
named retail model, launch/auth, browse/search, the applicable codec/audio/subtitle cases,
progress read-back, recovery and performance pass. Every codec and lifecycle feature not exercised
is marked unsupported or unknown for that row, never implied by a neighboring model.

## 8. Sequenced implementation plan

Phases are implementation slices of this complete product, not a reduced product scope.
Keep the Samsung source/build/distribution loop coherent at every phase.

0. **Reusable Tizen process foundation:** environment inventory, clean app template, validated
   packaging, emulator harness, diagnostics, key/lifecycle conformance, mock fixtures and CI
   contract. Prove the workflow on both a generated unrelated sample and the Plex app; see
   [development process](samsung-tizen-development-process.md). Do not let cross-app tooling
   replace app-specific product work.
1. **Plex Tizen app foundation:** separate Web app skeleton, reproducible package/build command,
   ES5-output gate, Samsung emulator boot, remote-key/focus loop, diagnostics, local mock-PMS
   fixtures and CI smoke. No Plex secret or Samsung retail certificate needed.
2. **Plex account and session:** QR auth, Plex Home profiles, server discovery/selection, safe
   storage investigation, account lifecycle and multi-server API tests.
3. **Shared UI and discovery:** theme/layout/navigation primitives, Home hubs, library browsing,
   paging, sort/filter/A–Z, images and caching, search, detail/collection/person/extras.
4. **Playback foundation:** AVPlay adapter lifecycle/state machine, direct play, PMS transcode
   fallback, player HUD, input, pause/resume/seek, actual playhead and recoverable errors.
5. **Plex playback parity:** timeline/progress protocol, quality/source changes, audio/subtitle
   selection, subtitle fallback, chapters, Skip Intro/Credits and Up Next/auto-advance.
6. **Product completion:** preferences/settings, localization/text fit, privacy consent, optional
   diagnostics/telemetry, memory/performance hardening, accessibility, lifecycle/resume and failure
   audit.
7. **Compatibility and release:** run the support matrix on Samsung emulator and available retail
   TVs, determine supported model groups, Store/distribution feasibility, signing/package pipeline,
   install/update/uninstall and recovery docs, then write developer and user-facing onboarding
   instructions. No broad support claim before this gate.

At each slice, run its smallest host/mock tests and the Samsung host/source gates.
Launch an emulator only when available and authorized, without claiming hardware acceptance.
Use a retail set only when its evidence is required;
the Samsung device lease governs every physical-device operation. Keep certificate credentials and tokens
outside the repo. Ask for explicit consent before any test that writes to the household's Plex
viewing history.

## 9. Product decisions and questions

The implementation can begin with safe defaults below; revisit before the corresponding feature
depends on them.

| Question | Initial default |
|---|---|
| What does “full Plex app” mean for this product? | Owner expanded scope to official-Plex features; §10 tracks music/photos/live TV/Watchlist/catalogue gaps explicitly. Movie/TV implementation alone is not completion. |
| Intended Samsung floor? | 2017 Tizen 3 as the target floor, with per-model evidence; do not imply that one 2017 model certifies the tier. |
| First local development server? | Existing mock PMS and fixtures; owner token only for later real-server tests that need it. |
| Which PMS records may tests change? | None without explicit authorization for a named test profile/item/action. |
| When does user onboarding happen? | Near release, after app behavior, support range, install/signing and distribution are established. |
| Initial distribution promise? | Developer-mode sideload for engineering only; public store path unresolved. |
| Plex branding/name? | Independent, unofficial Plex client; conduct trademark/licensing review before public distribution or naming. |

## 9A. LG comparison and remaining-work dashboard

Source audit of this fork at `b6aa83a8`, not a claim about every upstream release or the official
Plex client. Samsung results below are host/synthetic implementation evidence only. The historical
[LG parity audit](https://github.com/dragoshont/plx-native/blob/f74610c8e8fda765245f548adcc6565becdca31b/docs/parity-gaps.md) scopes itself to movies/shows and contains older paths and
superseded assertions; current source takes precedence.

| Feature | Actual LG source boundary | Samsung baseline and remaining work |
|---|---|---|
| Music and photos | `rust-modules/data/src/browse/mod.rs`, `SecKind::from_wire`, accepts only movie/show. Tests in `browse_fetch_state_tests.rs` explicitly reject artist/photo. Generic metadata/hub names are not playable screens. | Music queues/shuffle/repeat and photo slideshow exist on host. Server music PlayQueues, larger queues, native audio/image formats, interruption recovery and memory limits remain. These are new product features, not copied LG screens. |
| Live TV/DVR | No `/livetv` or `/media/subscriptions` bindings found in Rust source; the LG parity audit excludes this domain. | Guide/grid and confirmed DVR operations exist on host. Tuner consumer allocation/keepalive/release, storage-location selection, conflict workflows and actual server/native acceptance remain. LG provides no tuner lifecycle to reuse. |
| Watchlist | No Watchlist read/add/remove bindings found in Rust source. | Paged reads, confirmed mutations and exact-GUID local matches exist on host. Cloud/profile acceptance, packaged remote paging and recovery remain. |
| Cloud catalogue | `rust-modules/plex/src/plex/discover.rs` implements person biographies and `CreditGroup` filmography, not general catalogue search or licensed playback. `rust-modules/data/src/person.rs` joins credits to local availability; unowned credits are not local playback targets. | Metadata search/details, local matching and 50-credit career pages exist on host. Licensed/ad-supported streaming is blocked on authorization, DRM and ad contracts. A Discover module name does not prove AVOD support. |
| Server queues and Up Next | `rust-modules/plex/src/plex/timeline.rs`, `create_play_queue`, POSTs `/playQueues` with `type=video`, continuous episodes, queue/item IDs and server identity. `rust-modules/media/src/route/plan.rs` retains queue projections. | Local music queue is not equivalent to a server PlayQueue. Reuse the identity/projection rules, but establish music-specific creation, mutation, paging and cleanup contracts rather than copying the video-only call. |
| Localization | LG has English/Spanish/Belarusian catalogs under `locales/`; translated movie/show surfaces do not supply translations for the new media/service domains. | Static/conditional copy and named placeholders covered on host. Dynamic errors/composite copy, old-engine formatting and actual display text fit remain. |
| Playback and lifecycle | `rust-modules/media/src/player/CLAUDE.md` documents bundled FFmpeg demux, access-unit queues, Starfish feed and ACB hardware-plane binding. Those are LG-specific native interfaces. | AVPlay is a separate adapter. Hidden-state stop and foreground no-auto-play are host exercised; codecs, HDR/audio/subtitles, seeks, process kill, standby and The Frame Art Mode need Samsung acceptance. LG device results cannot certify these. |

**Reusable:** PMS/account identity separation, GUID versus local ratingKey boundaries, stream
selection, timeline/queue identity and movie/show domain rules. The ES5 app currently reimplements
these contracts; it does not execute the Rust core. LG GPU widgets, raw-socket/libcurl runtime and
Starfish/ACB decoder integration are not drop-in Tizen Web code.

### LG capability parity (owner re-scope)

The owner asked to target LG capability parity first, taking low-risk gaps before new domains.
Each row compares source behaviour; Samsung evidence is host-only.

| LG capability (source) | Samsung status |
|---|---|
| Person biography and catalogue credits (`discover.rs`) | Present: `personProfile`, `personCredits` |
| Credit-to-local availability join (`person.rs` `guid_index`/`match_local` over `/library/people/{id}/media`, keyed by the GUID tail) | **Added:** `localCatalogueIndex`/`matchCredit`/`personLibraryIndex`. Held credits open the local item ("In this library"); others keep "Search libraries"; an unreadable or truncated index is reported, never shown as availability. `people.test.js` and `filmography-ui.test.js` (fails against the previous commit) |
| Extras/trailers shelf, Play from beginning, Remove from Continue Watching, related items | Present |
| Up Next via `/allLeaves` | Present (`nextEpisode`) |
| Show hero uses the PMS-selected on-deck episode (`plex/library.rs::metadata`, `screens/detail/hero.rs`) | **Added:** `includeOnDeck=1`, object/array metadata handling and Play next episode/Resume/Restart actions tied to the episode's own ID. Regression exercises the episode lookup and 20000ms resume, not show playback. Season selection remains available; without an on-deck result, choose an episode from Seasons |
| Item context menu on cards (`item_menu.rs`: go to item/show, mark watched, play, play from start, trailer, remove from deck) | Present in `js/item-menu.js`: holding OK (600 ms), Tools or Info opens it; Play/Resume is the first row rather than a watch-state mutation; Cancel restores the card. Show/season Play resolves a playable episode, and a trailer action requires a metadata-qualified safe trailer. A short OK opens the card on key-up. `lg-parity.test.js`, `lg-parity-ui.test.js`. Physical Enter key-up and native playback of these targets remain unverified |
| Continue Watching OK = Play vs Open details preference | **Added:** `continueAction` preference, default Open details, as on LG |
| Video server PlayQueue (`timeline.rs` `create_play_queue`) | **Added:** `createVideoPlayQueue` POSTs `/playQueues` (`type=video`, continuous for episodes); timelines carry `playQueueID`/`playQueueItemID`. A queue failure falls back to plain playback. Creating a queue is a server write: fakes only until an authorized test profile exists |
| Alternate sources across servers (`/library/all?guid=…`) | **Added:** "Other servers" on movie/show detail, which excludes the current server and labels each copy with server, library and resolution. OK opens that server's detail page; the playing copy is never swapped |
| Favorite libraries onboarding (`screens/src/onboard.rs` first-run step, then Settings) | **Added:** `js/favorites.js`. First visit to each server offers the step; Skip writes nothing and at least one library stays selected; hidden libraries also drop their Home shelves. Sign-in is the existing plex.tv PIN link and profile picker |
| Quality ladder and Force direct play (`screens/src/preferences.rs`, `media/src/route/plan.rs`) | Original and five fixed ceilings are present; **LG's adaptive quality Auto is missing**. Original marks the source version and distinguishes actual Direct Play/Direct Stream/Transcode. Its prediction respects Direct Play Off and the selected audio codec. Force asks for the original without transcode fallback and refuses subtitle-burning/multipart selections before playback requests. The capability table follows documented AVPlay constraints; predictions are not measurements. Frame-rate matching has no AVPlay API and stays a TV picture setting. Earlier direct-play observations are bound to older builds, not the current candidate |
| Account audio & subtitles (`plex/src/plex/account/preferences.rs`) | **Added:** `js/account-preferences.js` and Settings > Audio & subtitles read and write the profile's preferred audio language, subtitle mode, subtitle language and forced-subtitle policy on `clients.plex.tv/api/v2/user/profile`; only changed fields are sent, and picking an audio language enables automatic selection as on LG. `account-preferences.test.js`, `account-preferences-ui.test.js`. Not exercised against plex.tv from a television |

The [source parity review](samsung-upstream-readiness.md#follow-up-feature-parity-review) tracks
the remaining movie/show differences. Host code now provides show/season card-menu episode
routing, a metadata-qualified trailer shortcut, preferences for the app-rendered SRT/WebVTT
overlay, a configurable seek interval, and a read-only PMS file/track inspector. Audio
enhancements remain a source gap; none of these
host changes certifies Samsung native playback, subtitle composition or model support.

### Remaining work by dependency

These rows summarize the detailed unchecked tasks in section 10; they are not additional scope.
No row is complete merely because its host fixtures pass.

| Priority | Work | Completion evidence | Dependency/hold |
|---|---|---|---|
| 1 | Legacy bounded transport and old-engine compatibility | Timeout/body-size/token/redirect regressions plus oldest-target runtime exercise | Ordinary coding; runtime result needs supported emulator or named TV |
| 2 | Server music PlayQueues and larger queues | Queue identity, paging/order/shuffle/repeat, transition and failure tests; native playback acceptance | Music-specific PMS contracts and authorized test records |
| 3 | Dynamic localization, paging, focus/HUD and resource ceilings | Every screen's error/empty/retry/remote journeys; text-fit and measured memory | Host work first, then packaged runtime |
| 4 | DVR destinations/conflict workflows | Server-provided settings/storage choices, explicit confirmation and ambiguous-failure handling; actual scheduling acceptance | Authorized named test profile/recording |
| 5 | Live channel playback | Proven consumer allocation, keepalive and release on success/error/exit; no leaked tuner | Unresolved service lifecycle; no speculative tune action |
| 6 | Licensed catalogue streaming | Authorized playable source, DRM/ad requirements and compliant native playback | Service/legal contract blocker, not solved by LG reuse |
| 7 | CI/package checks and Windows/Ryzen emulator workflow | Host/ES5/source gates, manifest/credential checks; observed emulator launch/readiness/input/capture | Windows x64 tooling readiness unobserved; no installation here |
| 8 | Model acceptance and release | Named firmware codec/lifecycle/performance register; signing/update/uninstall and release checks | Explicit signing/deploy/account-write/publish grants still required |

**Not ready for a full-support claim:** the expanded host baseline is implemented, but live tuning,
licensed catalogue streaming, legacy runtime compatibility and current-app Samsung acceptance
remain open. Earlier feasibility probes are not acceptance of this application.

## 10. Unfinished product backlog

This is the editable task list requested by the owner. Checked entries mean the named **host
implementation** is committed and exercised, never that a Samsung model passed. All unchecked
entries remain outstanding. Repository edits, builds and synthetic tests are approved; external
device, signing, publishing and household-account operations retain their specific safety gates.
Work directly through the dependency-ready items rather than waiting for a native worker.

### Real-TV navigation issue ledger

The owner authorized ongoing issue capture, fixes and deployment on the existing UE55MU6172
on 2026-10-11. Record the LG-reference Home/feature → shelves → movie details → Back →
Movies journey before and after each deployment. Native recordings contain fresh renderer
paint layers at approximately one frame per second, not panel/video-plane output. Household
playback and watch-state writes remain excluded.

| ID | Issue and evidence | Fix / acceptance status |
|---|---|---|
| UX-01 | Owner reports missing profile photo. Source confirms initials-only profile picker and generic Account glyph. LG `plex/account.rs` supplies `thumb`; `session_profile_cache_tests.rs` uses a plex.tv user-avatar URL. | Implemented in `29f8ab60`: returned avatars in the picker and active Account control use bounded image loading; initials/glyph remain until decode succeeds. Regression failed before the fix and passes after; decode-to-visible and credential/origin boundaries are exercised. Native acceptance pending. |
| UX-02 | `openProfiles` inserts “Use this profile” even for an unprotected identity, adding a redundant confirmation. | Candidate switches an unprotected profile in one click; protected identities retain PIN validation and stale-result guards. Host journey passes; native acceptance pending. |
| UX-03 | Account opens utilities on Home but jumps directly to Settings in a library (`browseHeader`). | Implemented in `29f8ab60`: same Account panel on Home and libraries; Refresh stays in the selected destination. Host library Account/Back/focus journey passes. Native loop acceptance pending. |
| CAP-01 | Full-panel capture/screencast unavailable on this firmware; genuine renderer-layer replay works. | Keep fresh layers and timing/step receipts. Do not label the recording full-panel or 60-fps LG-equivalent footage. Actual signed-in loop capture in progress. |
| UX-04 | Native baseline: focused first-shelf episode caption is clipped at the left edge. The scaled first card extends beyond a horizontally clipped row with zero left padding. | Candidate gives the row a 1vw overscan gutter while preserving the 5vw poster inset. Native after-fix comparison required. |
| UX-05 | Native follow-up confirms feature exists and nav Down correctly returns to it at scroll 0; the earlier nav-Down failure claim was withdrawn. Real defects: nav Up enters shelves, lower-shelf Up skips adjacent rows for fixed nav/other shelves, hero Up targets Account. | Candidate bounds nav Up, uses adjacent shelf rows with nearest horizontal column, and routes hero Up to Home navigation. Separate host regressions failed before the fixes. Native after-fix comparison required. |
| UX-06 | Native baseline: one Recently Added poster is a play-glyph placeholder. | Cause unresolved: distinguish missing metadata, HTTP failure and decode failure before changing image handling. |
| UX-07 | Native baseline: shelf titles are Romanian while navigation is English/UK wording. | App locale and server-supplied library/hub names are separate. Investigate metadata/locale requests; do not translate personal library names or claim all localized source titles are UI errors. |
| UX-08 | Native baseline: focused season reads “Sezonul 8” without series identity. | Candidate includes `parentTitle` with the season title when supplied. Native comparison required. |
| UX-09 | Native baseline: linked-account/profile and server pickers add two screens/three presses; server connection observed at roughly 30–72 seconds. | Record account protection/admin flags and advertised connection attempts before removing gates. Never bypass a protected profile or assume a sole server grant is reachable. Connection latency cause remains open. |
| UX-10 | Updates/restarts of the default memory-only build lose sign-in. Owner explicitly requested retention. | Successful linking now saves the original account token automatically. Version-2 storage and legacy restoration, Settings opt-out across later links, storage failure, sign-out deletion and protected PIN gating have host coverage. Native restart/update acceptance pending; preserve installed app/package IDs and author signing identity. |
| UX-11 | Native baseline movie details never rendered; Back reloaded Home into focusless loading and then server-unreachable. Pending sections/hubs requests had no observed HTTP result; root cause unknown. | Detail loading now focuses its Back escape control; regression failed before and passes after. Preserve this as an incomplete loop, not successful LG parity. Investigate request timeouts and Home loading from fresh native evidence; no claim of network recovery yet. |
| UX-12 | Independent review found Up trapped at the first populated shelf when a preceding hub was empty, and transient unprotected-profile switch failure lacked Retry. | Populated-row selection now consistently skips empty hubs; selected-profile Retry preserves stale-result guards. Host regressions added; native acceptance pending. Library Refresh destination now explicitly asserted. |
| UX-13 | Native after-install connections to every advertised PMS origin timed out; Settings was unreachable without Home. No HTTP status was returned. | Settings is now available from server selection and discovery failure. Connection progress shows attempt number and Direct/Relay without private origins; focused Cancel and remote Back return to server discovery, cancel registered clients and ignore late success. Duplicate server selections are disabled while connecting. Host regressions exercised. Native audit still requires actual reachability; old Chromium without AbortController can retain timed-out fetch sockets, so physical socket cancellation remains unresolved. |

Fix batch `29f8ab60` passed the committed-tree Samsung suite, strict ES5 parser, unsigned SDK
build and quality gate. Its signed development package was verified byte-for-byte against the
committed app assets, with only explicit application/package IDs added to the staged manifest.
That package was superseded, not installed. The subsequent `9db91e36` package was installed
successfully with a checksum-bound receipt from the device lane. Its login was still memory-only;
the owner's later persistence correction supersedes that default. The frozen pre-install loop
is truncated at failed movie-detail loading: 18 genuine discrete paint captures encoded into a
33.4-second replay, not a continuous recording or a frame-for-frame LG comparison. Native
after-fix acceptance remains separate from host checks and installation.

### Player and protocol

- [x] Implement joined multipart server transcodes with whole-title resume/progress; host contract tested. Source: `docs/plex-openapi.json`, decision `partIndex=-1`.
- [x] Reject concurrent playback starts and seeks; cancel closed seeks promptly and ignore late/timed-out callbacks. Host race regressions exercised.
- [x] Select server audio/subtitle streams before playback negotiation, preserve default audio when not overridden, and stop on refused selection. Source: `rust-modules/plex/src/plex/library.rs`, `select_streams`.
- [x] Retrieve external captions from `/library/streams/{id}` with UTF-8 encoding and source-backed SRT conversion, rather than inventing filename extensions. Host transport/parser integration tested.
- [ ] Exercise multipart joins, seeks across file boundaries and final watch state against a test PMS and native AVPlay.
- [ ] Verify model profiles on device. Host: shipped model-register.js binds only UE55MU6172 / UMU6100 / T-KTMDEUC-1410.1 / Tizen 3.0 to the two recorded video direct-play observations (H.264 1920x1080 MKV, HEVC 3840x1600). Other model/firmware/family/API results use documented capability predictions and may request direct play; they are not measured acceptance. Settings and Diagnostics distinguish this evidence. Exact runtime identity matching and current-artifact output remain device-unobserved; a model-family code alone is insufficient.
- [ ] Exercise direct-play, fallback and quality changes for H.264/HEVC/UHD/HDR per named model; preserve aspect ratio and verify panel/audio output.
- [ ] Complete queue/PlayQueue handling, shuffle, repeat and playback ordering where applicable.
- [ ] Test progress retries, final stop/read-back, server restart, network loss and long sessions. Final stop/read-back passed on the 2017 device (build `c9cb6895`: 92 s of play from 40%, readback within 1.5 s, original offset restored); retries, server restart, network loss and long sessions remain.
- [ ] Verify audio track defaults, selection and failures on device, including model-specific DTS limitations.
- [ ] Verify embedded/external SRT/WebVTT and server-rendered ASS/SSA/PGS/VobSub individually.
- [ ] Test subtitle/audio/version changes while preparing, paused, seeking and completing on device. Host: a 12-journey generation matrix rejects superseded prepare/seek/listener callbacks; terminal events retire pending resumes, replacement preserves pause intent, and view-owned subtitle/seek results are guarded. Native AVPlay timing/output remains unobserved.
- [ ] Verify held-key scrub/repeat on device. Host journeys prove accelerated Left/Right targets bounded to zero/duration, one seek on keyup or 300 ms idle, no double commit, and hidden-HUD reveal without activation. The player HUD hides after five seconds of
  uninterrupted playing; navigation/OK first reveals controls without activating them. Media
  keys still act while hidden. Pausing, buffering, errors and open menus retain visible controls;
  menu closure and resume restart the timer, and teardown cancels it. Synthetic host journeys
  cover these transitions; Samsung-panel acceptance remains outstanding.
- [ ] Exercise Up Next/auto-next cancellation and completion across episode/season boundaries.

### Account, browsing and app UX

- [ ] Confirm Home PIN request shape against primary Plex evidence and actual test-account behavior.
- [ ] Verify pairing QR, shared grants, TLS/CORS and unavailable/denied-server recovery in the packaged TV app.
- [x] Cancel view-owned reads and active response readers, including search/discovery clients; cancellation/deadline and signed-account journeys exercised on host.
- [ ] Exercise repeated Back/search/sign-out under packaged-runtime network loss and retry.
- [ ] Verify every screen's remote focus, scroll restoration, loading/empty/error and retry paths on device. Host table-driven journeys cover 24 request routes (including nested DVR, catalogue and shared listing routes), Retry re-fetch and Back focus/scroll; five cached/local route families retain actions/exits. Player/photo resource journeys are separate host tests. No-library favorites, failed details, profile/server return ownership and nested DVR retries are fixed; physical-remote behavior remains unobserved.
- [x] Join catalogue credits to this server's titles by GUID tail, as LG `person.rs` does; held credits open the local item. The compact index checks up to 10,000 titles, reports truncation and rejects incomplete/misaligned pages.
- [x] Replace the 200-credit display cap with 50-credit Previous/Next pages; preserve the career page on return and exercise a 251-credit career. Remove the 500-title local-index cutoff; a 900-title synthetic index reaches its final title.
- [x] Advance collection pages with explicit PMS offsets and retain the loader/remaining pages when returning from details; a 51-item collection regression exercises both behaviors.
- [ ] Finish search type/group completeness and older PMS response-variant acceptance.
- [x] Add explicitly user-initiated watched/unwatched and remove-from-Continue-Watching actions with confirmation, duplicate-click prevention and synthetic writes only. Sources: `docs/pms-api.md` §timeline and `rust-modules/plex/src/plex/hubs.rs`.
- [ ] Verify explicit watch actions against a named authorized test profile/item, including show/season leaf behavior and metadata refresh failures.
- [x] Bound download-plus-decode concurrency to three; release Blob URLs after decode rather than evicting undecoded visible images at 60 URLs; cancel pending decodes on view exit. A 73-image synthetic regression exercises both lifetime and cancellation.
- [ ] Establish measured decoded-image/metadata low-memory ceilings and long-session stability on the target TV.
- [x] Add missing-key coverage for static/conditional control and status copy in English/Spanish/Belarusian; localize static elements and named resume/duration/record/auto-next placeholders.
- [ ] Verify dynamic error/composite copy and locale-sensitive formatting on the target engine. Host: runtime error boundary localizes HTTP failures and rejects unknown external copy in Spanish/Belarusian; counts, server labels, seek/track/version/quality/confirmation strings use locale placeholders. AST scan rejects raw error-message sinks and English concatenation, with planted regressions. Target text fit and formatting remain unobserved.
- [ ] Verify English/Spanish/Belarusian text fit, accessibility and couch legibility on actual display sizes.
- [x] Stop playback while hidden, cancel auto-next, reload details on foreground without auto-play, and coalesce slow progress writes; synthetic lifecycle/queue regressions exercised.
- [ ] Verify graceful exit/process-kill and interrupted-session reconciliation on Samsung.
- [ ] Verify the Settings sign-in storage choice across relaunch/deletion, protected-profile PIN gates and storage-error recovery on TV.
- [ ] Test The Frame Art Mode, wake/standby and restore separately before claiming support.

### Expanded official-Plex features

Each item starts with endpoint/schema/entitlement evidence and mock contracts, then full UI and
runtime integration. A feature requiring an unavailable private service remains blocked with its
evidence; it is not replaced by another media server.

- [x] Music host baseline: artists/albums/tracks, metadata/artwork, bounded local album queue, shuffle/repeat and audio player; synthetic UI/session contracts exercised.
- [ ] Music completion: server PlayQueues, larger album queues, native MP3/transcode verification and interruption recovery.
- [x] Photos host baseline: album navigation, page-local viewer/slideshow, decode timeout and object-URL cleanup; synthetic UI/resource contracts exercised without progress writes.
- [ ] Photos completion: verify native supported formats, display/remote behavior and measured memory ceilings.
- [x] Live TV host discovery: advertised EPG providers, guide shelves, date/channel grid and existing channel lineups; recording capability is checked before offering scheduling.
- [ ] Live tuning: establish consumer allocation/keepalive/release and native codec/transcode behavior before allocating a real tuner.
- [x] DVR host operations: template-driven scheduling, subscription cancellation/preferences and scheduled/conflict status display, with confirmation and synthetic-only writes.
- [ ] DVR server acceptance, target storage/location selection and comprehensive conflict-management workflows.
- [x] Watchlist host operations: account-backed paged reads, confirmed add/remove, and exact-GUID local availability across scoped server grants.
- [ ] Watchlist cloud/profile acceptance and remote paging/recovery on the packaged app.
- [x] Discover (Plex catalogue) metadata search/details and local matching; source-backed and synthetic signed-account journey exercised.
- [ ] Licensed/ad-supported catalogue playback: establish Plex service authorization, DRM and ad obligations; do not substitute personal-PMS playback contracts.
- [ ] Inventory remaining official-client features/entitlements and map each to implemented, unsupported or blocked evidence.

### Baseline runtime and reusable development process

- [x] Decide the legacy-engine HTTP transport without weakening token/redirect/TLS policy. Streaming fetch is observed on the oldest owned engine (2017 Tizen 3 / M47); engines without it fail closed. An XHR fallback is rejected because it cannot refuse redirects carrying the token (§ runtime notes above).
- [ ] Verify fetch/Promise/URL/UTF-8/blob and CSS API support on the oldest supported engine. Host: the existing ES5 gate now rejects post-M47 runtime APIs, NodeList.forEach and CSS gap/custom properties, including planted regressions; shipped sources already avoid them, so no unsafe transport polyfill is added. Optional AbortController remains feature-detected; its absence cannot prove physical socket cancellation. Samsung [Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html), Table 1, maps 2017 / Tizen 3.0 to Chromium M47 (checked 2026-10-11). Source scans do not establish native API behavior.
- [x] Add automatic manifest/package privilege/identifier and credential-leak checks. `tests/tizen/manifest.test.js` pins the justified privilege set, keeps the signed app/package ID out of the tree and allows exactly one wildcard `<access>` rule (PMS origins are per-user). The wildcard rationale and token scope/redirect policy are now documented near AUTH and pinned by the host manifest test; package-time PMS origins cannot be enumerated. The unused `application.launch` privilege was removed. The workbench `tizen.py audit` (dragoshont/tizen-tv-builder) adds privilege-use, ES5 and credential-leak scans and blocks packaging on failure; on this app it passes with no errors, and its remaining warnings are the required wildcard, a heuristic miss for `internet` (XHR) and the example IP in a validation message.
- [x] Wire Samsung host/mock/ES5/source gates into CI. `.github/workflows/samsung.yml` runs `tools/tizen/test.sh` for all PR/main changes and checks generated locales/icon and complete source. The unused LG recipes are retired. Generic workbench/inspector tests run in the separate toolkit's CI.
- [ ] Automate emulator install/launch/readiness/keys/logs/capture/teardown on a supported host. *Implemented in the workbench (`tizen.py emulator`) and tested against fakes; a real run is unobserved because the x86_64 TV emulator needs HAXM/WHPX/KVM and cannot run on Apple Silicon.*
- [ ] Automate authorized lock-aware retail install/test/capture/teardown with explicit target identity. *Implemented in the workbench (`tizen.py identify`/`retail`: lane lock, DUID-hash fingerprint match before install, signed package required, owned-forward cleanup); a real retail run on the next TV is unobserved.*
- [x] Prove the reusable workflow on a generated second app, not just Plex. The workbench CI scaffolds a non-Plex app and runs its tests, audit, deterministic double pack, package check, an unsigned-refusal check, a planted-credential failure and the budget harness on Ubuntu and Windows; a real SDK build and signing of a generated app passed `check-package --require-signed` locally.
- [ ] Establish cold-start/first-Home/first-frame/memory/latency/long-session numeric budgets per tier. First device attempt (build `c9cb6895`): three cold debug launches timed out before Inspector attached, so no budget sample was observed.
- [ ] Run current-app acceptance and populate the model/firmware support register; earlier probes do not count.
- [ ] Validate signing/update/uninstall, separate Store/branding/legal feasibility, and release packaging.
- [ ] Finish developer/user onboarding and publish only after runtime acceptance and explicit release authorization.

**Immediate order:** multipart source contract (host done) -> playback transition regressions ->
request cancellation/legacy-engine transport -> browsing/localization -> expanded media/service
contracts -> packaged-runtime/device acceptance. Hardware-dependent tasks can be prepared but not
marked done from mocked results.
