# Samsung Tizen TV app development process

**Purpose:** make the first Samsung TV app establish a safe, repeatable workflow for building
additional Samsung Tizen TV apps. The Plex client is the first full product and the proving
project for shared development infrastructure; it is not itself the reusable template.

This playbook is deliberately separate from the Plex product contract in
[samsung-tizen-client-spec.md](samsung-tizen-client-spec.md). A new app should be able to reuse the
toolchain checks, project skeleton, package validation, emulator loop, device test harness and
release safeguards without inheriting Plex APIs, credentials, media assumptions or UI.

## 1. Goals

1. A developer can start a new Samsung TV app from a documented, versioned template and build a
   valid `.wgt` without copying an old product directory.
2. One command validates required local tools, project metadata, bundle compatibility and signing
   configuration without printing secrets.
3. One command builds, installs, launches and gathers useful diagnostics on an available Samsung
   emulator; the same app contract and test scenarios can be run on a retail TV when authorized.
4. Apps consume an explicit, testable platform capability profile and degrade safely when an API
   is unavailable.
5. Emulator results, vendor documentation and individual retail-TV measurements remain distinct
   evidence categories.
6. Signing credentials, DUIDs, tokens, server locations and app-specific private configuration
   never enter git, public build logs, reusable templates or test artifacts.
7. Reusable pieces are extracted only when a second app or an independently reusable platform
   contract validates them; no abstract framework is built solely for hypothetical use.

## 2. Scope and non-goals

**In scope:** Samsung Smart TV applications using the public Tizen TV application ecosystem:
primarily Web apps (`.wgt`), Samsung's TV emulator and TV Extension, remote input, lifecycle,
packaging, signing, test evidence and local/CI developer tooling.

**Not in scope:** Galaxy/Android applications, phones/tablets, Samsung appliances, device rooting,
private/native TV APIs not in Samsung's public developer contract, bypassing certificate or TLS
checks, or claiming that the emulator is equivalent to a retail model.

This workflow must support app-specific architectures. It does not require every future app to use
the Plex client's UI, network protocol, language or playback adapter.

## 3. Shared versus product-specific ownership

| Shared Tizen app-development layer | Plex-client product layer |
|---|---|
| SDK/CLI and emulator discovery; environment report; stable project skeleton; manifest/package validation; build/install/run/log/screenshot helpers; remote-key scenario harness; capability registry and evidence format; secrets policy; model/firmware test-matrix schema; release artifact/checksum mechanics | Plex QR auth and profiles; PMS discovery/API and media models; Home/library/search/detail features; playback policy and AVPlay integration; Plex progress/timeline writes; Plex settings, consent, and metadata |

Shared APIs should be small, dependency-light and usable without PMS. Plex-specific fields, token
handling and test data stay in the product directory. Shared tools accept app id, project root and
target explicitly; they do not hardcode one app's path, certificate name, model, IP or server.

### Required interactive inspection checkpoint

The builder agent, skill and runtime must include an interactive inspection checkpoint before
claiming native UI acceptance. Open the standalone real-TV canvas when a supported, authorized
target is available; otherwise report the specific blocked or unsupported condition and continue
host-verifiable work. Merely opening a desktop mock is not native acceptance. The standalone
toolkit candidate is under implementation; this contract does not claim its installed release
already provides the canvas.

The initial feed may show one genuine capture every ten seconds. Show capture time, age, source,
connection state and command latency; keep old frames visibly stale after a failure. Renderer
paint layers are not full-panel images, continuous video, or proof of hardware-video output.
Never fill an unavailable native pane with fabricated or emulator frames.

Provide D-pad controls and focus-scoped shortcuts: arrow keys navigate, Space/Enter send OK, and
Backspace sends TV Back rather than browser history. Editing metadata or text must not drive the
TV. Inputs use the same bounded, authorized command path, with pending/error feedback and no
held-key backlog. A command must not wait for the next periodic capture to dispatch. Coordinate
clicks require proven current viewport/layer geometry; otherwise declare them unsupported.

Optional device metadata includes model, year, OS version and firmware, with each value labelled
observed, user-provided or unknown. Persist profiles by device identity, not transient canvas
panel ID. Emulation requires explicit selection; comparisons label each source and its capture
time independently. They do not establish frame-for-frame or second-for-second equivalence.

Native inspection shares the existing exclusive Samsung device lease with every capture,
deployment and navigation lane. A separate lock implementation is not mutual exclusion.
Bind services to authenticated loopback endpoints, validate requests, and release snapshots,
forwards, relays and ownership on stop, failure and session exit. Household account mutations
remain product-specific, explicitly authorized actions, never a default builder scenario.

## 4. Standard project shape

The canonical project template should eventually create a structure equivalent to:

```text
<app>/
  app.json                  # app id, display name, version, privileges, target policy
  config.xml                # generated/validated Tizen widget manifest
  src/
    platform/               # thin public-Tizen adapters
    app/                    # app-owned features and composition
  assets/
  tests/
    unit/
    contract/
    emulator/
  tools/
    app.config.example      # safe placeholders only
  dist/                     # ignored generated package and unsigned bundle
```

The exact language, bundler, test runner and source layout remain a first-app engineering decision.
The reusable contract is the manifest, package, build output and test interface, not a mandatory
UI framework. An app may use TypeScript or modern source syntax only when its production bundle
passes the engine target's syntax/API checks.

## 5. Canonical developer loop

The final workflow should be discoverable and composable, with a single documented top-level tool
or command family:

1. **Inspect environment:** report Tizen Studio/CLI/TV Extension/emulator versions, installed
   platforms/templates/virtual machines, host architecture and missing prerequisites. Never print
   certificates, passwords, DUIDs, tokens or private endpoints.
2. **Create app:** generate a new product directory from the versioned template, with a unique
   app id and placeholder metadata; do not copy historical native/LG build assumptions.
3. **Validate source:** lint and unit/contract test; verify bundle syntax against each declared
   engine tier, privileges and manifest; scan source and package metadata for credentials and
   machine-specific values.
4. **Build:** create deterministic, inspectable unsigned/static web assets and the signed package
   as distinct outputs. Record source revision, tool versions, target profile and artifact digest.
5. **Run emulator:** select an explicit image; create/boot if needed; install, launch, inject
   repeatable remote keys, collect app logs and screenshot, then close the app cleanly. Report the
   emulator's exact virtual model/platform image in the result.
6. **Run device:** only with explicit authorization and target identity; validate connectivity,
   certificate profile and install permission; install/launch; run a bounded test; gather app
   logs; close the test app and release the TV lock. Do not leave a developer app running when the
   owner needs the set.
7. **Record evidence:** add results to the app-specific register with exact model/firmware, test,
   criterion, outcome and evidence type. Update shared capability knowledge only if supported by
   vendor evidence or more than one relevant, named-device observation.
8. **Release:** validate signing/distribution permissions, version/package metadata and checksum;
   keep private signing assets outside the repo; retain an audit trail for the release artifact.

No step may silently continue after a failed precondition. Error output names the failed check and
the safe next diagnostic, not a guessed cause or a security bypass.

App-local command family (this repository):

```sh
npm ci --prefix tests/tizen --ignore-scripts
tools/tizen/check-es5.sh samsung/Vemm
tools/tizen/test.sh
tools/tizen/build-source.sh samsung/Vemm
tools/tizen/build-web.sh samsung/Vemm <security-profile>
```

These scripts only build and test **this** app with Samsung's official `tizen` CLI.
`build-web.sh` requires the signing profile explicitly and writes generated packages beneath
`samsung/dist/` (ignored by Git). `build-source.sh` runs Samsung's unsigned source build into a
unique temporary output directory and removes only its own output on exit.

`test.sh` runs synthetic account/PMS/native-adapter contracts, the host DOM product journey,
generated-locale freshness and strict Acorn ES5 parsing. Dependencies are declared and locked under
`tests/tizen/`; they are host tools, not production assets. Use
`node tools/tizen/build-locales.js --write` after editing `samsung/strings.json` or
the inherited catalogs now maintained in `samsung/locales/`, and
`node tools/tizen/build-theme.js --write` after changing a colour in `samsung/Vemm/css/style.css`.
None of these commands launch a Samsung runtime.

Generic, app-independent tooling — environment doctor, project generator, manifest/privilege audit,
deterministic packing and signature checks, emulator and retail-TV harnesses, remote/inspector
workbench, capture and recording — is deliberately **not** part of this repository. It lives in the
separate `tizen-tv-builder` toolkit, which this app does not depend on to build, test or package.

## 6. Emulator and device policy

- The Samsung emulator is the default local Tizen integration loop. It is useful for package
  install/launch, shell/runtime compatibility for its image, remote navigation, layout, web APIs
  it implements, and basic app lifecycle.
- Emulator capabilities and OS version are read from the selected image, never inferred from a
  marketing model or from the host Tizen Studio version. For this project, the currently installed
  image is **Tizen 10.0 x86_64**. It is not evidence for 2017/2018 engines; no older image was
  present at the time this process spec was written.
- First-host attempt (2026-10-09): `em-cli launch` could not start the x86_64 image on this
  Apple-Silicon macOS host, reporting that hardware virtualization is unsupported. The VM config
  already had hardware virtualization disabled; retrying through the official manager returned the
  same blocker. The image is therefore installed but **not yet runtime-verified** on this host.
  Do not equate a package build or a `list-vm` entry with a successful emulator run. Resolve this
  with a supported host/image combination or a Samsung-supported emulator update; do not edit VM
  internals or bypass the manager as a workaround.
- Historical note (2026-10-09): early shared helpers lived in this repository and have since moved
  to the separate toolkit. On this host, the generator produced a clean `tv-samsung-3.0` `BasicEmptyProject`; the build
  wrapper originally ran a heuristic scan for common post-ES5 syntax, Samsung's `tizen build-web`, and
  `tizen package -t wgt` with an explicitly selected local signing profile. The signed package
  passed ZIP integrity checking and
  the build output/checksum landed under ignored `samsung/dist/`, outside the app source directory.
  This proves local generation/build/package only: the package was not installed or launched, and
  this does not validate its UI or any retail model. New app IDs use the reserved
  `example.invalid` placeholder and must be changed to an identifier controlled by the app owner.
- A missing historical image must be represented as “not available in this emulator setup,” not
  worked around by compiling code against a newer engine and claiming old-model support. Use
  source-level compatibility checks, vendor sources and an actual older retail set for those tiers.
- Retail-device tests are needed for real remote behavior, video decoder/API compatibility, HDR,
  sound, subtitles, panel composition, memory/performance, and hardware-dependent suspend/wake.
- Physical-device operations use a short TV lock around one bounded test. Device access, account
  writes, certificate trust changes, network disruption, install/uninstall and panel/sound changes
  require appropriate human authorization.
- The emulator may contain a clean synthetic account/mock server. Never seed a user's personal
  token into a checked-in fixture, test package, reusable template or CI log.

## 7. Capability and compatibility model

Every reusable platform capability is described by:

- API/feature name and official documentation URL/version;
- minimum documented Tizen TV version and known model-group constraints;
- runtime feature-detection method, if any;
- whether emulator support is documented and the exact image on which it was observed;
- named retail model, firmware and test artifact for device observations;
- fallback behavior and whether fallback has actually been tested.

There is no global “Samsung TV supported” boolean. Product apps declare a baseline plus optional
capabilities. The app's effective capability set is the intersection of build-time support,
runtime detection and verified server/device behavior. Unknown playback capability chooses a safe
server-side transcode or a clear unavailable state; it never guesses native decode support.

## 8. Reusable process deliverables

The reusable deliverables (agent skills, project template, environment checker, build/package and
audit wrapper, emulator harness, device harness, conformance contract and compatibility evidence
register) are owned by the separate `tizen-tv-builder` toolkit and versioned there. This repository
keeps only the Samsung Plex app, its tests, and the thin app build scripts listed in §5. App-specific
device results stay in `docs/samsung-upstream-readiness.md`.

## 9. First-app process milestones

The Plex client is used to discover and verify the reusable process, in this order:

1. Inventory the installed SDK and emulator images and make a non-destructive environment report.
2. Create a clean, separate Tizen Web app skeleton using the supported template/CLI; attempt the
   installed Tizen 10 emulator, and exercise remote input, logs and screenshots on a host where the
   official emulator actually starts. The initial template has been generated and packaged; emulator
   launch and remote-input evidence remain blocked on a supported host.
3. Turn observed setup/build/emulator steps into reusable commands and test them from a fresh
   throwaway app directory, not only from the Plex app.
4. Add app-specific mock PMS fixtures and build Plex vertical slices against the shared app
   contract. Keep every Plex credential absent from the repository.
5. Add older-engine compatibility checks and use available 2017/2019 retail sets only for checks
   the Tizen 10 emulator cannot prove. Keep the model evidence granular.
6. Harden lifecycle, AVPlay, performance, privacy and release behavior against the Plex spec.
7. Re-run the reusable workflow from a clean generated sample, record timing/failure modes, and
   finish the deferred environment, signing, device setup and user-facing onboarding docs.

**Reusable-workflow acceptance:** a second, unrelated sample Tizen TV app can be generated, built,
installed/launched in the emulator, driven by scripted remote input, diagnosed from collected logs
and removed using the documented workflow without editing Plex code or accessing the user's Plex
credentials. A full clean-machine onboarding run is done last, after process churn has settled.

**Current result:** the unrelated sample and Plex app have both been generated, built and packaged;
the emulator install/launch and remote-input conditions remain unmet on this host, so reusable-
workflow acceptance has not passed.

## 10. Measurements for process improvement

Record these for the first app, then compare against the next app:

- elapsed time and manual actions from a prepared workstation to first emulator launch;
- elapsed time from a new app directory to a signed emulator-installable package;
- number of undocumented steps, failed commands and recovery actions;
- percentage of the app build/test loop runnable without a retail TV;
- setup repetitions required per developer, emulator image and physical target;
- number and type of secret-bearing artifacts prevented by automated checks;
- time to diagnose a failed package, launch, network, AVPlay or lifecycle test;
- number of app-specific files modified to use a shared tool/template;
- proportion of shared components exercised by an unrelated sample app;
- host, emulator and retail-device test coverage reported separately.

Optimize repeated, evidence-backed work. Do not optimize by skipping required device tests, merging
different model tiers, hiding failure details, or moving private data into shared templates.
