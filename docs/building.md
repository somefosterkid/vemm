# Building and distributing Vemm for Samsung

The maintained source is `samsung/Vemm/`, a public-API Tizen Web app with
Samsung AVPlay. No ARM cross-toolchain, native Makefile or LG SDK is required.
Node and Python 3.10+ run the host checks; an **already-installed** Tizen Studio
Web CLI is needed only for the unsigned SDK build or separately authorized
signing. Do not install SDKs or access certificates as an implicit test step.

## Host loop

```sh
npm ci --prefix tests/tizen --ignore-scripts --no-audit --no-fund
tools/tizen/test.sh
tools/tizen/build-source.sh samsung/Vemm
```

`test.sh` runs synthetic DOM/API contracts, independent repository inventory,
locale/icon freshness, Python staging/source tests, benchmark/probe host tests
and the ES5/Chromium M47 compatibility gate. No device or account is contacted.
`build-source.sh` uses `TIZEN_CLI`, PATH or `TIZEN_HOME`, builds unsigned into a
unique temporary directory and removes only its owned output.

Catalogs are under `samsung/locales/`; additions/overrides are
`samsung/strings.json`. After edits run
`node tools/tizen/build-locales.js --write`.
Colours in `samsung/Vemm/css/style.css` are theme tokens (`samsung/Vemm/js/theme.js`); after
changing one run `node tools/tizen/build-theme.js --write`.
The original icon is reproducible with `python3 tools/tizen/build-icon.py --write`.
The generated outputs have freshness checks.

Commit and confirm a clean tree before the final gates. Afterward confirm the
tree remains clean; bind evidence to that exact SHA. An unsigned source build
does not prove signing, install/update, remote input, AVPlay decoding, HDR,
panel output or performance. Those require separately authorized named-model
acceptance, not an LG native benchmark.

## Separate Vemm distribution

Vemm uses `VemmTvApp0` / `VemmTvApp0.Vemm`, `vemm-tizen-*` storage,
`Vemm-X.Y.Z.wgt`, `Vemm-source-<sha>.zip`, `vX.Y.Z` tags and a separately
retained Vemm author certificate. It is not an update to the historical Plx app
and reads none of that app's tokens/preferences. Published `Plx-*.wgt`,
`samsung-v*` tags and old source offers remain immutable history.

For a separately authorized future release:

```sh
python3 samsung/source_bundle.py --output /absolute/private/release-directory
python3 samsung/release.py X.Y.Z --notes-file /path/to/vX.Y.Z-notes.md
```

The source builder refuses a dirty or untracked source tree and existing output
files. It archives **all tracked source at HEAD**, including tests, build recipes,
catalogs, notices and license texts; its filename includes the exact SHA and it
writes a checksum. The local publisher includes that archive and checksum next
to the WGT. `--no-publish` builds without publishing, but still requires signing
authorization. Do not execute the publisher merely to validate source cleanup.

`samsung/build.py` stages the explicit root app files, flat `.js`, `.css` and
`.svg` assets from their product directories, plus `LICENSE`, `LICENSING.md`,
`THIRD-PARTY-NOTICES.md`, `TRADEMARKS.md` and the explicit `LICENSE_FILES`
inventory from `licenses/` (not arbitrary local directory contents). Hidden files, source maps, old WGTs
and unrelated/private file types are not product assets. This is a staging
boundary, not a secret scanner: review the actual source and staged entries.
The notices are legal payload,
not executable dependencies. Review actual archive entries and preserve matching
complete-source availability under GPL section 6(d).

`.github/workflows/samsung.yml` runs host/source checks for all PR/main changes.
Its SDK/signing job is restricted to an explicit `vX.Y.Z` tag. It preserves
the Vemm local-author publication handoff when a release already exists;
ordinary CI artifacts are not signed production updates. Release identity and
post-publication checks are in [the transition contract](samsung-project-transition.md).
