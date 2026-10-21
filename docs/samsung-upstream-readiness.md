# Samsung upstream-readiness backlog

**Decision: not ready to announce completed Samsung support or native LG parity.**
The separate Samsung client has a broad source/host baseline; developer installation is observed.
Neither implies that its playback, account lifecycle and runtime constraints match the LG app.
The LG comparison refers to historical source, not a second maintained product:
its unused implementation/build are retired from the active tree under
[the independence plan](samsung-repository-independence-plan.md).
Plex Media Server remains the library/watch-state authority.

## LG production-parity recheck (2026-10-12)

The production target is LG movie/show capability parity, not the complete official Plex
service ecosystem. The comparison is frozen to upstream LG release
[`v0.8.0`](https://github.com/GLinnik21/plx-native/releases/tag/v0.8.0)
(`ed7b1360d3f9021f542b8c099f6a3003ea4a59e1`), with development main
`cd3f0646b560b7979b2e5d07570ed398990ccfac` checked separately. The blockers below
exist in the published release as well as development main.

| Capability | Current Samsung evidence | LG-parity verdict |
|---|---|---|
| Browse, search, movie/show details, seasons, collections, people and alternate servers | Implemented and host exercised; per-server favorites and show/season/trailer card actions are present | Source baseline present; full current-artifact remote acceptance remains |
| Intro/credits, chapters, resume, watched/unwatched and episode continuation | Implemented and host exercised | Current-artifact AVPlay/PMS output and write/read-back acceptance remain |
| Quality and direct-play policy | Original plus five fixed ceilings; Direct Play Auto/Force/Off; actual direct/direct-stream/transcode reporting | **Incomplete:** LG's adaptive **quality Auto** is absent. Direct Play Auto is a different setting and is not a substitute |
| Audio track negotiation | The selected track's codec, rather than `Media.audioCodec`, determines original eligibility; unsupported selected audio permits video copy with audio conversion | Regression-backed source fix; actual native track identity/output remains unverified |
| Force and quality labels | Force refuses selections requiring subtitle burning or multipart joining before any request; Original's prediction respects Direct Play Off | Regression-backed source fixes; no silent transcode under Force for these paths |
| Account audio/subtitle policy | Preferred audio language, subtitle mode/language and forced policy are editable; default selections honor PMS `Stream.selected` | Source implementation present, superseding the older missing-editor description below; LG's client-side language/codec ranking remains a separate difference |
| Audio processing | No Samsung `boostDialog`/`normalizeLoudness` request path or controls | **Missing:** LG's entitlement-gated Boost dialog and Normalize loudness |
| Subtitle rendering and menu | SRT/WebVTT overlay, search/download and size/position/color/delay controls; other formats use device/server paths | **Not equivalent:** LG renders styled ASS/SSA and PGS/VobSub locally and groups/ranks subtitle languages. Samsung's flat track list and text-only appearance controls do not establish those behaviors |
| Codec/HDR/performance | Samsung AVPlay with documented capability predictions; earlier direct-play receipts are source-bound to their older builds | LG's Starfish/FFmpeg, Dolby Vision, codec tables and 60-fps GPU renderer do not transfer to Samsung. Acceptance must be named-model and platform-specific |

The 2026-10-12 install cycle put local Samsung 0.2.4, built from `7ee43ce`, on
UE55MU6172, UE43RU7092UXXH, QE65Q80CATXXH and QE55QN70FAUXXH. The owner reported
all four working. A delayed inspector observation on UE55MU6172 showed the account
profile picker after 30 seconds with no displayed network error. These are startup
observations, not verification of the playback rows above; inspector capture restarts
the app and does not preserve a preceding failure.

### UI frame pacing (measured 2026-10-12)

Video already decodes on Samsung's hardware decoder and video plane through AVPlay, so the
LG renderer's hardware-acceleration claim applies to the Samsung app's UI, not its video.
To measure the UI, `requestAnimationFrame` timestamps were recorded through the web inspector
while remote keys moved focus on the signed-in Home. Nothing was played. A rAF gap is a
main-thread frame miss, so this is a conservative bound.

| Home interaction | UE55MU6172 (2017, Tizen 3.0) before → after | QE55QN70F (2025) before → after |
|---|---|---|
| Idle, horizontal shelf moves, 120 ms held-style repeats | 60 fps → 60 fps | 59–60 fps → 60 fps |
| Shelf-to-shelf, Down ×4 then Up ×4 at 350 ms | 45.8 fps, 56 missed frames, worst 167 ms → **55.9 fps, 16 missed, worst 117 ms** | 57.5 fps, 10 missed → **58.6 fps, 6 missed** |

A Chromium trace on the 2017 set showed shelf moves bound by software tile raster and GPU
upload, not JavaScript (3–7 ms per key). The causes were native scrolling of Home, a focus
blur shadow and brightness filter, colour/opacity transitions, and visibility-toggling the
hero. Home now moves `.home-track` by `translate3d`, cards are their own layers with a
transform-only focus animation and a static shadow, and the hero hides by opacity on its
own layer. The remaining misses fall on the first visit to a lower shelf, when its posters
are decoded and rasterized. Other screens were not measured.

Cost: Home now has more paint layers than the toolkit's eight-layer native capture accepts,
so `tizen.py screenshot` refuses a Home capture. Other screens capture as before.
Promoting only the focused card avoids that but measured 53 missed frames at the same key
cadence, so it was reverted.

Do not announce completed LG parity, merge a parity-completion claim or promote the
candidate as production until the source blockers and release-bound device criteria
are resolved. A 60-fps desktop MP4 is not device evidence. Playback, timeline, watch-state,
queue and subtitle-download acceptance require explicitly authorized disposable Plex
records; a household Guest profile is not disposable.

## Store and service authorization checkpoint (2026-10-11)

**B2 and B3 remain blocked, not implementation tasks that can be closed by a green test.**
The sources below were read directly on this date. This is a distribution-risk checklist,
not legal advice or approval from Samsung or Plex. Developer sideloading and the mock film
do not establish Store eligibility or permission to stream Plex's licensed catalogue.

| Question | Confirmed source requirement | Remaining decision or evidence |
|---|---|---|
| Seller membership and region | Samsung's [membership guide](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-seller-office-member.html) starts accounts as Public Sellers, limited to U.S. distribution. Partner status requires a Samsung Content Manager approval and an offline contract; countries are those agreed in that contract. | Choose distribution countries. Individual-versus-company eligibility for this publisher has not been established; the guide requests company-location information, and the [partner guide](https://developer.samsung.com/tv-seller-office/guides/membership/becoming-partner.html) requires a seller group/company information. Obtain an explicit answer through Seller Office before promising availability. |
| Submission and model targeting | Samsung's [publication process](https://developer.samsung.com/tv-seller-office/application-publication-process.html) requires package upload/pre-test, application information, release request, review and verification before service starts. The [distribution guide](https://developer.samsung.com/tv-seller-office/guides/applications/distributing-application.html) selects model groups and service countries, not an unconditional year range. | No Store submission or approval is recorded. Use only accepted model/firmware rows; the guide's 2018+ .NET rule is not evidence for this Web client's support. |
| Signing and update identity | The [launch checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html) requires a manifest, author-signature.xml and signature1.xml; updates retain Tizen ID and author signature and increase package version. Partner APIs require permission. | Signed developer install/update/uninstall belongs to D13. Store pre-test, privilege review and certification remain separate. No release version or tag is authorized here. |
| Review assets and backend access | The launch checklist requests UI-description material, icons, four JPEG screenshots, localized title/description, contact information, privacy-policy URL when collecting personal information and sufficient test credentials. The distribution guide requires enough test accounts for concurrent model-group testing; FCC-targeted groups require Caption and TTS support. | Prepare disposable reviewer accounts and a lawful, reachable test library, never household credentials. No explicit policy approving a personal-PMS-only client was found. Confirm that service model with Samsung and assess Caption/TTS before targeting affected groups. |
| Name, logo and look | Plex's [trademark guidelines](https://www.plex.tv/about/privacy-legal/plex-trademarks-and-guidelines/) permit a unique product name followed by "for Plex", but prohibit Plex/derivatives in the product name, derivative trademark icons, confusing endorsement and copying Plex's look and feel. Uses outside the guidelines need written permission. | Review the actual public title, icons and marketing. An "unofficial" disclaimer alone does not satisfy these rules. Do not rename the app or change an installed identity silently; owner/legal decision is required. |
| PMS interfacing and entitlements | Plex's [Terms of Service](https://www.plex.tv/about/privacy-legal/plex-terms-of-service/) (page revised October 30, 2025) explicitly discuss client applications as "Interfacing Software", privacy notices, copyright notices and associated grants, alongside broad license restrictions and restrictions on exclusive Plex Pass functionality. | Reconcile these provisions and the project's source license with qualified advice or Plex clarification before public distribution. A functional PMS endpoint or a trademark guideline is not a blanket API/service license. Preserve account entitlements; do not bypass Plex Pass or content controls. |
| Licensed/ad-supported catalogue | The same terms describe third-party content as non-transferable and subject to its licensors' terms; they do not grant general copying/distribution rights. | No third-party-client streaming authorization, playable-source agreement, DRM or advertising contract is recorded. B3 stays blocked; local-PMS playback must not be substituted as proof. |

**Go/no-go:** continued bounded developer testing of personal-PMS behavior is separate from
public release. Store distribution and licensed catalogue streaming are **no-go until their
specific external requirements are resolved**. No numeric Samsung startup limit, general
individual-publisher entitlement or personal-server-only approval is asserted from these sources.
The app's existing remote/lifecycle/performance gates remain necessary but are not a substitute
for the current Samsung certification requirements.

## Deployment and follow-up evidence

On 2026-10-11 the observed install was `9db91e36`, installed after the baseline below (superseded by the 2026-10-12 installs above).
Its signed package SHA-256 is
`622156b7ff3406de0cfcb9738e97f8c9c4a8a065c895fee8486e26580b265ef0`.
Install and debug relaunch exited successfully; the post-install live viewer completed 59 cycles
with one capture failure. This is installation/capture evidence, not native feature acceptance.

The frozen pre-install baseline belongs to `7c6f7158`, not `9db91e36`: its producer's freeze
metadata and checksums bind 18 genuine discrete renderer-paint captures to the pre-install run.
The 33.4-second encoded replay stops at failed movie-detail loading, followed by a Home reload
and server-unreachable error. It is not continuous video, not a complete LG-equivalent loop,
and not second-for-second comparable to the LG film.

After installation, every observed advertised PMS identity connection timed out without an
HTTP status. The cause remains unproven; neither PMS/network failure nor a client regression can
be ruled in from that evidence alone. A later native viewer produced genuine frames every ten
seconds, with approximately 406–408 ms capture time on the static server-selection screen.
That proves the capture route without proving Home reachability or interactive control.

The follow-up source through `5b98b23b` saves sign-in automatically, preserves explicit Settings
opt-out and old storage records, exposes Settings while PMS is unavailable, adds selected-profile
Retry, and fixes first-populated-shelf Up and detail-loader focus. Server selection now reports
attempt counts and offers focused Cancel/remote Back with stale-success protection. Host suites,
strict ES5, the SDK build and quality gate passed on committed source. Old Chromium fetch socket
abort remains unresolved; cancelling app results is not proof of cancelling the network socket.

Its signed development update was checked byte-for-byte against the committed app assets,
apart from explicit staged application/package IDs, and retains the installed author certificate.
An artifact inventory also exposed duplicate nested `.buildResult` assets in the old packaging
helper; the helper now packages SDK output directly, with a failing-then-passing regression.
The clean candidate SHA-256 is
`5889bb033cb46202e8375bfb2102be93d13540728b0ce96dffbb1b55347d88b9`.
**At that build, candidate installation and native login-retention/feature acceptance were pending;** later builds are installed on five TVs and the owner's sign-in is retained in daily use.

### Earlier sign-in-screen receipt

On 2026-10-11, source `7c6f7158cb95ecffad955fc7ccac477d444c9bcf` was packaged with the existing Samsung developer certificate,
installed over the owner's private application ID and launched on the owner's previously identified 2017
UE55MU6172 (recorded firmware `T-KTMDEUC-1410.1`; not re-read during this deployment).
Samsung's install command exited successfully and the debug relaunch returned an Inspector port.
Signed package SHA-256: `69b0f2cfd39471168f1efd1847d504328cf65eea58dc314a756f6eff989d0428`.
The package's application assets were compared byte-for-byte with the committed source;
only the staged manifest received the explicit application/package IDs.
No remote navigation, playback or household Plex mutation was performed by the agent.
Fresh native renderer-layer captures were inspected: the installed sign-in screen has no
remember-me checkbox. A bounded live viewer completed 89 cycles without capture failures,
approximately 0.86 seconds per capture, on this static screen. These are separate paint
layers, not full panel/compositor screenshots, and exclude AVPlay's hardware video plane.
Capture tooling and its limits are documented in the separate `tizen-tv-builder` toolkit.
The owner subsequently signed in manually. The native navigation lane observed the profile/server
pickers, Home and shelves; its full LG-reference loop and after-fix comparison are still in progress.
Current-app native playback acceptance remains pending.
This is an install/launch and sign-in-rendering receipt, not panel or
native-playback acceptance. Host suites, strict ES5 parsing and unsigned source build passed
on the committed source before packaging.

## Latest upstream check

Fetched `GLinnik21/plx-native` on 2026-10-11 without merging it into this branch.
The latest observed upstream commit is
[`4e454ea037e355898d22f7f78198c64227748032`](https://github.com/GLinnik21/plx-native/commit/4e454ea037e355898d22f7f78198c64227748032).
It is 14 commits ahead of the original inspected/common-base revision
`38c07fc3e513066c70a90584ef6760672d6c6e5f`. This is a dated snapshot, not a live feed.

| New upstream work | Relevance to Samsung |
|---|---|
| [AV1](https://github.com/GLinnik21/plx-native/commit/17290659fae6ee1bdc2c6445b13ee2474d6984e1) and [VP9](https://github.com/GLinnik21/plx-native/commit/4e454ea037e355898d22f7f78198c64227748032) direct play gated by the set's codec table | LG-specific native playback/FFmpeg/platform changes. Do not transfer the supported-codec claim to AVPlay or newer Samsung models |
| [Reload details after player return](https://github.com/GLinnik21/plx-native/commit/1e07e0bc2e7a657939ad3522ac2fa65a5d30957f) | Product invariant worth checking: resume must reflect the PMS stop position; Samsung's current-app write/read-back acceptance is still pending |
| Undecodable-audio rejection and reopening interrupted direct-play transfers | Useful negotiation/recovery cases, not evidence Samsung already handles native decoder/transport failures |
| Bounded Recently Added paging and ahead-of-scroll posters | Recheck Samsung's 12-item Home shelf limit, decode concurrency and scrolling rather than copying LG's scheduler |
| Multiline subtitle cues, sign-out forgetting plaintext-connection answers, preference defaults staying reset | Include equivalent state/privacy tests where Samsung has that feature; not every LG preference exists in Samsung |
| ELF/storage-helper checks, agent/build docs and website press updates | Mostly LG packaging/tooling/documentation. They do not justify changing the preserved LG app in this Samsung slice |

The local LG description below the README's Samsung section still describes the checked-out LG
revision, not these unmerged AV1/VP9 additions. Keep upstream integration separate from the
Samsung fixes so a port update cannot silently replace working LG code.

This is the release gate for **LG movie/show capability parity**, not a promise to finish the
official Plex service ecosystem by copying LG. Music, photos, DVR, live tuning and licensed
catalogue streaming are tracked separately in the [product backlog](samsung-tizen-client-spec.md#10-unfinished-product-backlog).
The [LG comparison](samsung-tizen-client-spec.md#lg-capability-parity-owner-re-scope) maps the
implemented movie/show behaviors to their actual source.

## Closed source gaps in the current follow-up

| Gap | Resolution | Evidence boundary |
|---|---|---|
| Collection navigation lost Load more on returning from details and could repeat page one | Preserve cached page, loader and cursor; pass collection offsets to PMS | Synthetic 51-item collection journey |
| Careers stopped at 200 credits and local matching at 500 titles | 50-credit Previous/Next pages; compact incremental GUID index with reported 10,000-title safety ceiling | Synthetic 251-credit career and 900-title index; incomplete page rejection |
| Artwork concurrency ended at download, and the 61st URL could revoke an undecoded visible image | Include decode in the three-job limit, revoke after decode, timeout failed decodes and cancel on view exit | Synthetic 73-image lifetime/cancellation journey |
| Account icons overlapped labels; generic choices looked like More actions | Separate static leading icon slots; semantic refresh/clock/sort icons, no generic ellipsis fallback, localized sort directions | Failing-then-passing DOM/CSS regressions; inspected 1280x720 and 1920x1080 host captures; included in the installed package, Account-screen native acceptance pending |

## Device-observed browse fixes

A read-only LG-parity walk on the developer TV found six browse gaps. Each was fixed behind a
failing-then-passing host regression, and the signed package of `bb340ab8` was then installed and
re-observed on the same TV. The captures are renderer paint-layer replays read over the web
inspector, not photographs of the panel. No card was activated and no media or household writes
were made.

| Gap found on the TV | Fix | Observed on `bb340ab8` |
|---|---|---|
| Quality badges clipped at the left of library posters | Library posters use the 2:3 artwork aspect | Full `4K UHD` / `1080P FHD` badges; posters measured 262x393 |
| Up from the grid landed on the account avatar with no focus indicator | White ring outside the avatar | Ring visible; the first Up from the grid reaches Sort and filters, the second reaches Account |
| Library card focus was subtle compared with Home | Library cards use Home's ring and 1.06 scale | Ring visible, computed `matrix(1.06, …)` |
| Profile picker showed only the initial | The plex.tv avatar redirect is followed with credentials omitted, and the final URL must be an `assets.plex.tv/avatars/` filename (the observed shape is `<id>.`) | Photo decoded (180 px wide) |
| Search had no recent searches and showed developer copy | Local recent searches with Clear; footer removed | Recents created and retained across reinstall; no footer |
| A posterless card showed a grey placeholder | Fall back to the item's background art | Art decoded (640 px wide) |

While the on-screen keyboard is up, the window is 604 px tall and the lower edge of the recent
searches sits below the Search scroll area. Arrowing off the input dismissed it (the Search area
grew to 1016 px), and the focused recent term and Clear button were then fully visible. This is
why the layout was left unchanged. Recent-search focus never needed `revealControl` to scroll
(`scrollTop` stayed 0), so that branch is host-tested only.

A second guarded walk on `bb340ab8` opened a show's Seasons and one season's episode listing.
It found two more gaps, fixed in `614aa555` and re-observed on the TV:

| Gap found on the TV | Fix | Observed on `614aa555` |
|---|---|---|
| Season posters about 270x350 and episode stills about 2.64:1 | Listing artwork uses the item's own aspect | Seasons 270x405 (2:3), episodes 564x317.25 (16:9); focused cards scale 1.06 |
| Back from the episode listing reset show-detail focus to Read more | Detail restores the action that opened the listing | Back restores the season, then Seasons, then the original show card |

No episode was opened, played or marked. The viewer twice ended with `protocol_error` after
repeated capture failures around a route change; one reconnect completed each walk. Playback,
trailers, the More menu, typing in Search and Settings toggles remain unobserved.

The LG-inspired Home/detail changes are documented in the [loop analysis](samsung-lg-loop-analysis.md).
They are not a substitute for closing the following runtime gates.

## Phase 1 device pass (build `93e947a8`)

Run on one TV: UE55MU6172. The system build reports Tizen 3.0 (`TIZEN-3.0-TRUNK2017-KantM-RELEASE_20260225.1`); the firmware API that would give the exact version is privilege-blocked.
Every tested app JS file matched the installed build. The run ended on Home with AVPlay `NONE`, preferences and recents restored and the lease released. Request-level write ledgers are private session evidence.

| Result | Cases |
|---|---|
| Observed passing | Playback start, resume, seek, stop and restart; both Continue Watching modes; auto-next off and on (the successor's timeline proves the next episode played); intro and credits marker seeks; watched/unwatched pairs; subtitle search and download (5 results, metadata stream count +1); restoring local settings |
| Observed failing, host-fixed | (a) After an audio-stream switch AVPlay stayed `READY`. The reopen at ~6690 s prepared, but the READY-state `seekTo` never called back; no timeline was sent for 62 s. `avplay.js` now limits that seek to `resumeSeekTimeout` (8 s by default). If the seek fails or times out, it starts playback and retries the seek from `PLAYING`, which Samsung documents as the safe state for seeking HLS. If the retry also fails, it emits `resume-failed`, which the player shows as a status message instead of hanging. Covered by `avplay.test.js`. (b) Remove from Continue Watching left the item on a freshly reloaded Home. Home built its deck from the promoted `home.continue`/`home.ondeck` hubs, which PMS does not filter after removal. `getHomeHubs` now takes the deck from `/hubs/continueWatching`, as LG does (`plex/src/plex/hubs.rs`); if that call fails it falls back to the promoted rows. Covered by `home-deck.test.js`. Both fixes were re-verified on build `ea0d7c9b` (see below) |
| Unverified | Subtitle cue rendering on the panel; PGS/ASS (none in the sampled media); exact firmware and HDR; physical remote; full-panel capture |

Follow-up: LG restarts the transcode with `offset=` and treats the stream as starting at 0 plus a display base (`plex/src/plex/transcoder.rs`). Samsung now also sends the resume point as `offset=` (whole seconds) and prepares AVPlay there with `setStreamingProperty("PREBUFFER_MODE", ms)`; the PMS playlist still spans the whole title, so positions, timelines and markers need no remapping. On a 2018 Tizen 4 TV this cut a transcode resume from 5.4 s to 2.2 s. A TV that refuses the property gets `offset=0` and the READY seek with its PLAYING-state retry, as before.

## Direct-play device pass (build `ea0d7c9b` = `11e87f78` + `9eaaa04c`)

Same TV. Once the update was installed, `productinfo` reported firmware `T-KTMDEUC-1410.1`, model family `UMU6100` and UHD support. All 19 live scripts matched the build. The pass ended on Home with AVPlay `NONE` and preferences restored.

| Result | Cases |
|---|---|
| Fix re-verification: passing | (a) Audio switch at 6693.9 s resumed to 6702.8 s and then 6707.8 s with AVPlay `PLAYING`; the first large-offset attempt failed with an explicit stream-failure status rather than a hang. (b) The removed item is absent from a fresh `/hubs/continueWatching` and from Home |
| Passing | Diagnostics shows the measured profile. With the policy set to Off, the app transcodes |
| **Failing, host-fixed** | Direct play. A 1080p H.264 MKV (9.9 Mbps) and a 3840x1600 HEVC file (14.5 Mbps) both showed *Server transcode*. Root cause: the decision request carried the HLS transcode caps (`protocol=hls`, `videoResolution=1920x1080`, `videoBitrate=8000`). PMS therefore declined any original above those caps, which LG's MDE request (`transcoder.rs`) never sends. A second cause: Plex reports DTS as `dca`, while the profile listed `dts`. `playback.js` now asks for direct play with `protocol=http` and no caps, maps `dca` to the profile's `dts`, and advertises `dca`. If PMS declines, it re-requests a capped HLS transcode with its own decision. Covered by `playback.test.js` with a PMS mock that enforces caps. **Re-verified on the device below** |
| Blocked or unavailable | The PMS dashboard decision for Off mode; a natural decoder rejection (no unsupported sample); progress readback after the transcoded attempts (viewOffset unchanged, to investigate) |

Launching under the debugger once failed with "Could not launch the null application". Reinstalling the unchanged signed WGT once recovered Inspector; the root cause is unproven.

### Direct-play correction re-verification (build `e8b3b4ab`, includes `9d6a2abd`)

Same TV and firmware. All 19 live scripts matched the build. The pass ended on Home with AVPlay `NONE` and local preferences restored.

| Result | Cases |
|---|---|
| **Passing** | Direct play, policy Auto, subtitles Off, on two titles: a 1080p H.264 MKV and a 3840x1600 HEVC file. For each: the app showed *Direct play*; AVPlay reached `PLAYING` and advanced from about 0.25 s to 20.3 s; and PMS `/status/sessions` reported `Media.Part.decision=directplay`. The decision requests carried no caps |
| **Inconclusive** | Progress readback after direct play. The stored offset stayed at the pre-test value across six polls over 50 s, although the reported session offsets reached about 19 s. The protocol cannot distinguish a fault: the harness chose *Play from beginning* and stopped after about 20 s, and PMS is recorded (`tests/run.py`, live-verified) to keep an existing offset when it receives a small progress value, so an unchanged readback is expected server behaviour, not proof of an app defect. The LG harness never asserts persistence after a short play either. The Samsung timeline was since aligned with the LG contract (`plex/src/plex/timeline.rs`): it now also sends `X-Plex-Session-Identifier` and the selected audio/subtitle stream IDs. A valid retest resumes from a known mid-file offset (or plays well over a minute from a known point), stops, and compares the readback to the last reported position; it writes to the account and needs explicit authorization |
| Condition | With the downloaded SRT subtitle selected, both titles transcode; that is the server's normal subtitle-burn decision, not a capability failure. At that build, image or text subtitles in a direct-play stream were not supported on Samsung; SRT/WebVTT drawn by the app's overlay now keeps direct play |
| Disclosed account change | The PMS subtitle selection on the HEVC title was left Off with the owner's authorization. The original downloaded subtitle no longer exists on the server (HTTP 400) and cannot be restored. Cleanup in an earlier attempt also made two unintended queue requests for another item; they were stopped and recorded in the ledger, and the final pass had none |

A renderer network flag reporting no original route is an unsupported observation and does not contradict the app plus PMS evidence. No HDR, panel or dashboard-visual claim is made.

### Progress and focus acceptance (build `c9cb6895`)

Same TV and firmware. The owner authorized this test to write progress to the account. All 19 live scripts matched the build. The pass ended on Home with AVPlay `NONE`, local preferences restored and the original offset written back.

| Result | Cases |
|---|---|
| **Passing** | Progress readback after direct play. The 1080p H.264 title, whose stored offset was 316422 ms, started playing at 542079 ms (about 40%) and played for 92 s, stopping at 634096 ms. A fresh readback after the stop returned 635548 ms, 1.45 s from the last reported position. The original offset was then restored with a stopped timeline and verified by a further readback. Every write is in a private ledger |
| **Passing** | Focus restoration: Home, then the title's details, then Back returned to the same card with the same geometry. The screenshot is a renderer-layer replay, not the panel or video plane |
| **Not observed** | Startup timing. Three cold debug launches each timed out after 60 s without an Inspector port, so cold-start, first-frame and first-Home values are absent. One instrumented recovery launch of the same package recorded cold start at 231 ms and first Home at 13.7 s, with no first-frame mark. It is not a normal-launch measurement and is not counted as a budget sample |

## Follow-up feature parity review

Compared the current checked-out LG sources, not the historical official-Plex gap inventory
in `parity-gaps.md`. The website loop establishes composition, not coverage of these features.
**Full source parity is still incomplete**, separately from native acceptance.

| Area | LG evidence | Samsung evidence and verdict |
|---|---|---|
| Home, libraries and search | `screens/src/home/`, `library/`, `search/`, `onboard.rs` | Home feature/shelves, favorite libraries, server search, A-Z, server sort/filter choices and paged browse are present in `main.js`. Remote/Back coverage is host exercised, not complete panel acceptance |
| Movie/show navigation | `screens/src/detail/hero.rs`, `item_menu.rs` | **Host-implemented in this follow-up:** show and season card-menu Play resolve to a server-selected OnDeck episode, otherwise the first valid episode; the leaf's own ratingKey is fetched before playback. A direct Play trailer action appears only for a typed, identified trailer clip with a safe part key. `lg-parity.test.js` covers resolver, endpoint, trailer metadata and invalid/empty response contracts. This does not establish native playback |
| People, collections and alternate sources | `screens/src/person.rs`, `filmography.rs`, `collection.rs`, `alt_sources.rs` | Paged careers/collections, local GUID availability and Other servers are implemented. Local lookup has an explicit 10,000-title safety ceiling; this is not unlimited-library parity |
| Playback progress and continuation | `plex/src/plex/timeline.rs`, `media/src/route/`, `screens/src/player/` | Timeline, episode queue identity, Up Next, auto-next, markers/chapters, track/version changes and stop paths are implemented in `plex-api.js`, `player.js` and `main.js`. The HUD now exposes direct audio/subtitle controls, Info and chapter tabs/cards, context and remaining-time clocks, a credits countdown/next-episode panel, hierarchical language menus, text-overlay subtitle timing, playback stats and recovery actions. The synthetic player journey covers these surfaces; actual AVPlay/PMS acceptance is pending |
| Audio/subtitle selection | `appkit/src/track_menu.rs` | **Host-implemented in this follow-up:** size, vertical position, color and timing controls apply only to the app-rendered SRT/WebVTT overlay; device-native and burned subtitles are explicitly excluded. Synthetic preference tests cover the allowlist, defaults and migration. **Host-fixed:** playback now starts on the part's PMS `Stream.selected` audio/subtitle (which carries the account's language preferences) and PUTs `/library/parts/{id}` only for an explicit pick, as LG does; previously every start wrote `subtitleStreamID=0`, clearing the server-side subtitle choice. A text-overlay pick is recorded as that stream and never also burned in. **Host-implemented, not device-verified:** server subtitle search/download from the player's Audio and subtitles menu (`js/subtitle-search.js`): only ISO 639-1 languages are sent (PMS answers 500 for 3-letter codes), results are tied to their search generation, a pick PUTs the candidate and polls metadata (10 × 1.5 s) to identify the new stream, and SRT/WebVTT results open as the app overlay. A pick writes to the household's Plex library, so a device check of the download needs explicit owner authorization. **Host-fixed:** changing audio under a text overlay no longer sends `subtitleStreamID=0`, which would have deleted a downloaded subtitle. Account audio/subtitle language, mode and forced-subtitle preferences are now editable in Settings (`js/account-preferences.js`). Still missing: LG's audio boost/loudness controls. Native subtitle styling and audio processing need capability evidence before promising equivalence |
| Playback/account preferences | `screens/src/preferences.rs` (`page_fields`, `field_options`) | Samsung persists Original/fixed quality limits, locale, next-episode mode, Continue Watching action and the 5/10/15/30/60-second seek interval. Direct Play Auto/Force/Off is offered and passed to negotiation; model capability predictions come from Samsung's documented specifications, with exact observed tuples distinguished. Settings edits account audio/subtitle language, mode and forced preferences through `account-preferences.js`; unchanged fields are not written. Default track choice honors PMS `Stream.selected`. LG's adaptive quality Auto and client-side language/codec ranking remain unmatched; native playback and account-update acceptance remain separate |
| File information | `screens/src/tracks_panel.rs` | **Host-implemented in this follow-up:** a read-only detail inspector renders PMS-reported version/part container, size and bitrate, video resolution/profile/aspect and per-stream technical fields including reported Dolby Vision descriptors. Missing fields are omitted rather than interpreted as negative facts. `file-info.test.js` covers representative multi-track metadata. This is not a named-model file/playback certification |
| Platform and additional domains | LG Starfish/ACB/FFmpeg and platform lifecycle; Samsung AVPlay | LG-specific native mechanisms cannot be copied or certified by a browser. Music/photos/DVR/catalogue source paths do not close movie/show gaps; live tuning/licensed playback and Store distribution remain separate blockers |

Close the named source gaps with failing-then-passing synthetic journeys first; retain bounded
navigation and explicit failures. Then run the named-model native matrix below. Do not mark
this table complete merely by adding unavailable controls or copying LG's private interfaces.

## Required before a parity announcement

| Order | Remaining work | Done means | Constraint |
|---|---|---|---|
| 1 | Oldest-target network/runtime compatibility | Actual packaged app completes account/PMS metadata and artwork requests, cancellation, deadline and byte-limit checks with normal TLS and no token-bearing redirect follow | Strict ES5 parsing does not establish fetch/streaming support. Do not substitute unrestricted XHR, which automatically follows redirects, for `redirect: error` |
| 2 | Named-model direct/transcode policy | Model/firmware-bound capability profile is detected and tested; original/direct play, conservative fallback and quality changes preserve identity, aspect and actual stream reporting | `js/model-register.js` binds exact retail model, family, firmware and Tizen version to the two video observations below. Other identities use documented Samsung capability predictions, not measured acceptance; a supported prediction can request the original, with server/decoder fallback unless Force is set. Settings distinguishes documented and observed evidence. **Device-verified on the older build** on one model (UE55MU6172) for a 1080p H.264 MKV and a 3840x1600 HEVC file with subtitles off, confirmed by PMS `decision=directplay`. Progress readback after direct play passed on build `c9cb6895`: 92 s of play from 40%, read back within 1.5 s of the last reported position, then the original offset restored. Current-artifact acceptance and other media tuples/models remain unverified |
| 3 | Native playback parity matrix | H.264/HEVC, applicable UHD/HDR/audio, embedded/external/burned subtitles, versions, chapters/markers, multipart joins and seeks pass on each claimed support row | Requires actual AVPlay and panel/audio evidence, not fake adapter success |
| 4 | Plex progress and queue acceptance | Resume, final stop/read-back, video PlayQueue identity, Up Next/auto-next cancellation and watch confirmations match expected server state | **Partly device-verified** on one model: resume from a mid-file offset, final stop and readback pass, and the original offset was restored (build `c9cb6895`, owner-authorized writes). Queue identity, Up Next, auto-next cancellation and watch confirmations remain unverified on the device. Guest alone does not make household writes disposable |
| 5 | Remote/navigation acceptance | Every LG-parity route has focus/Back/retry behavior; held OK/context menu, scrub/repeats, long titles, all three locales, player More/submenus and five-second auto-hide work on the remote | Owner's brief manual testing is useful feedback, not a complete matrix |
| 6 | Lifecycle and memory | Long browsing/playback, network/server interruption, sign-out, remembered-session deletion, process exit and standby/restore have measured outcomes without unintended playback or writes | Measure decoded image and retained metadata memory; a Blob URL count is not a decoded-memory measurement |
| 7 | Reproducible distribution | Manifest/privilege/credential checks, CI, deterministic package receipt, signing/update/uninstall and developer instructions are repeatable | Developer signing is not Store approval; public name/branding/distribution need their own decision |
| 8 | Freeze and review the claim | Exact release source/artifact, model/firmware support rows, passed/failed/skipped cases and known limitations receive review | Publish only with explicit authorization; do not call unknown models or The Frame supported |

No honest implementation can mark rows 2–6 complete from host mocks. Art Mode remains a separate
acceptance gate only if The Frame is claimed. An unavailable private service or entitlement is a
documented blocker, not permission to fabricate a working feature or replace PMS.

## Short owner test of the installed redesign

Without asking the agent to change household watch state: check Home's feature/info/cycling,
Down to the first shelf and Up to the feature, poster focus, Account/Settings, detail synopsis
expansion, More/Back, season-to-episode browsing and return from collection/person details.
Playback and watched-state actions should only be exercised by the owner on content they intend
to watch/change, or by an authorized test procedure naming disposable records.

## Allowed upstream wording before these gates close

“A separate experimental Samsung Tizen Web client is implemented, with host-tested Plex contracts
and developer install/launch observed on five Samsung TVs from 2017 to 2025. Native acceptance and support coverage
are still in progress.”

Do **not** replace that with “Samsung ready,” “full LG parity,” “all 2017+ TVs supported,” or
“The Frame supported.” A progress report can be accurate without being a support announcement.
