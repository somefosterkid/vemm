# Vemm brand and identity

## Working identity

**Name:** Vemm
**Pronunciation:** `/vem/`, one syllable
**Working tagline:** **Your media. At its best.**

Vemm is the working product identity for this independently maintained,
unofficial Plex-compatible Samsung Tizen media player. It is not a claim of
trademark registration, exclusivity or completed legal clearance. Existing
businesses use VEMM in unrelated fields; final naming clearance remains an
external decision.

## Identity layers

| Layer | Current decision |
|---|---|
| User-facing source display name | **Vemm** |
| Product/protocol name sent to Plex | **Vemm** |
| Repository | canonical [`dragoshont/vemm`](https://github.com/dragoshont/vemm); archived [`dragoshont/plx-native`](https://github.com/dragoshont/plx-native) preserves migration review/history |
| Installed Samsung application/package | `VemmTvApp0.Vemm` / `VemmTvApp0` |
| Saved settings/session keys | `vemm-tizen-*`; no old setting/token import |
| Signing identity | a future Vemm author, separate from the historical Plx app |
| Historical releases/assets | Existing Plx names, tags, filenames and links remain immutable |

Vemm and the historical Plx application are separate installs. Installing Vemm
does not update, uninstall or read data from the old app.

## Visual system

The Vemm mark is an original rounded folded `V`, recreated from the
user-authorized visual references for legibility at launcher size and from
normal living-room distance. It avoids Plex, Samsung, Microsoft and upstream
PlxNative logos and avoids literal film/media objects.

Source-maintained assets:

- `samsung/brand/vemm-mark.svg`
- `samsung/brand/vemm-app-icon.svg`
- `samsung/brand/vemm-wordmark.svg`
- generated packaged copy: `samsung/Vemm/brand/vemm-mark.svg`
- deterministic launcher raster: `samsung/Vemm/icon.png`

`tools/tizen/build-icon.py` parses the simple vector geometry and generates the
PNG with Python's standard library. No font download, image library or build
dependency is introduced.

The logo palette and the default Blue (Blue Calm) theme's interface roles are:

| Role | Value |
|---|---|
| Primary / front fold | `#3B82F6` |
| Light / rear fold | `#B7D0FF` |
| Canvas | `#081522` |
| Surface / raised surface | `#102238` / `#13283F` |
| Selected surface | `#1D3C66` |
| Play action / progress | `#2F6BCC` / `#6B93C9` |
| Focus fill / text | `#D6E6F5` / `#0F2747` |
| Focus ring (artwork) | `#FFFFFF` |
| Secondary text | `#D7DBE3` |
| Divider | `#4B5C63` |

The Grey, Black and Pure black (OLED) themes and the accent choices are described in
[`samsung/DESIGN.md`](../../samsung/DESIGN.md#themes-and-colour-tokens); the logo keeps its colours in every theme.

System typography, cinematic artwork composition and remote-first spacing
remain. The UI is text-first: decorative menu glyphs are suppressed; compact
playback transport glyphs and profile artwork remain because they carry
functional meaning. The accent is reserved for progress, the play action and selected
state rather than decorating every surface.

## Usage and non-affiliation

Use **Vemm** for current source, application screens, contributor documentation
and future release presentation. Describe published 0.2.7 and older packages
with their historical display name when accuracy requires it.

Vemm is unofficial and is not affiliated with, endorsed by or sponsored by
Plex, Samsung, LG, Microsoft or the upstream UI project's maintainer. Product
and service names identify their respective owners.
