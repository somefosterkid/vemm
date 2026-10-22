# Vemm Samsung screen system

This describes the built Samsung Web UI, not the LG renderer or a Samsung support declaration.
The built cinematic composition remains grounded in PlxNative's LG screens as a
historical visual reference. Vemm adds a restrained Fluent/Azure-inspired
identity without replacing effective layouts. The viewing scene is a dark
living room, several metres from the panel, using a remote.

## Owner-selected reference

The LG/webOS **application screens in the looping demo on [plxnative.com](https://plxnative.com/#feel)**
are the primary visual reference, not the website's landing-page styling or the LG launcher.
The owner explicitly selected this loop after reviewing the Samsung redesign.
It shows artwork spanning the screen, compact centred Home/Movies/TV Shows/Search navigation,
a separate profile control, title artwork with restrained metadata, a clear Continue/Resume action
and quieter secondary actions. The poster shelf meets the hero rather than starting below an
isolated feature panel. In the shelf view, focused artwork grows and its title/remaining time
become prominent without a heavy rectangular border around the whole card.

Samsung now reproduces those compositions instead of the boxed Home hero and bottom-of-page
utilities. The [loop analysis](../docs/samsung-lg-loop-analysis.md) records captured states,
implementation mapping and deliberate deviations. The source describes the loop as frame-by-frame
webOS simulator output from an openly licensed library. It is visual evidence, not independently
observed LG hardware behavior or proof that Samsung rendering/playback matches it.
The loop covers Home, a movie detail page and library navigation; it does not establish the
appearance or behavior of every settings, episode or playback menu.

## Visual language

Colour comes from a theme (see [Themes and colour tokens](#themes-and-colour-tokens)). The default
**Blue** theme is Blue Calm: a near-black navy canvas (`#081522`), deep-navy selected and raised surfaces,
pale-sky focus (`#D6E6F5` on `#0F2747`), soft-stone secondary copy (`#D7DBE3`) and slate dividers (`#4B5C63`).
The folded-V mark keeps its brand pair (`#3B82F6` / `#B7D0FF`) in every theme. Color is deliberately scarce:
artwork, titles and current tasks lead; the accent marks progress, selection and the play action rather than
washing every screen.

Cinematic scrims fade the artwork into the theme canvas, so the art meets the page without a seam. Use the installed system sans-serif stack;
do not download fonts. Ordinary screen copy is 24px or larger, page headings 48px, identity
headings 56px; cinematic Home/detail type scales with viewport height (Home title `7vh`).
Text-control focus fills only the control with the theme focus colour (pale sky on navy in Blue,
off-white in the neutral themes), without an outer halo. Current navigation also keeps an underline, so color is not the
only selected-state cue.
The original rounded folded-V mark appears in the app header/About/launcher;
live native-system text is used for the in-app wordmark and tagline. Do not add
Inter or another downloaded font.
Media focus looks the same on Home, libraries and search: a small lift and a white ring around
the artwork only (a compositor-only transform; the ring appears at once rather than animating, and Home
posters keep a static shadow; measured 60 fps idle and along a shelf and about 56 fps between shelves
on a 2017 set). Home reveals only the focused caption. It never frames the whole poster and caption.
Selected settings have a separate indicator. The interface is text-first: decorative menu and feature
glyphs are suppressed, while labels remain visible.
Playback retains its compact transport glyphs because those controls intentionally
hide text and keep accessible names. A decoded profile photo remains a functional
identity surface, with an Account text fallback when artwork is unavailable.

## Themes and colour tokens

Every colour is a token and a theme is one set of colours for the tokens, after the W3C Design Tokens format and
the Material 3 colour roles. `js/theme.js` holds three layers: a primitive **palette** (`navy-950`, `grey-900`,
`blue-400` ...); semantic **roles**, which each theme and accent map onto the palette; and the stylesheet, which
names roles only, as `$role` or `$role/alpha` for scrims and tints. Roles: `canvas`, `surface`, `surface-raised`,
`surface-high`, `surface-selected`, `border`; `text`, `text-strong`, `text-secondary`, `text-muted`, `text-accent`,
`text-danger`; `focus`, `on-focus`, `focus-ring`; `accent`, `accent-track`, `primary`, `on-primary`; the derived
translucent `glass-faint`, `glass`, `glass-strong`, `hairline` and `line`; `shadow`, `warning`, `on-warning`,
`qr-plate` and `on-profile`. Content keeps its own colours: profile colours, rating logos and the viewer's
subtitle colours. A test fails on any other literal colour in the stylesheet or scripts.

The 2017 televisions (Chromium 47) have no CSS custom properties. `tools/tizen/build-theme.js` copies every paint
declaration of `css/style.css` (with each shorthand or longhand sharing a value with it, so their cascade is
unchanged) into the generated `js/theme-rules.js`, about 30 KB. `js/theme.js` runs in `<head>`: it reads the saved
choice, resolves the tokens and writes one `<style>` after `style.css`, before the body is parsed and therefore
before the first paint. A choice in Settings rewrites that element at once; choosing the applied theme again does
nothing. `style.css` stays the single layout source, start-up costs one string replacement, and switching needs no
file load or reload. Browsers ignore the `$role` values left in `style.css`.

| Theme | Canvas / surface / raised | Text / secondary | Focus fill / text | Accent |
|---|---|---|---|---|
| Blue (default) | `#081522` / `#102238` / `#13283F` | `#F5F8FC` / `#D7DBE3` | `#D6E6F5` / `#0F2747` | Blue |
| Grey | `#1E1E21` / `#2A2A2E` / `#303035` | `#F2F2F5` / `#CFCFD5` | `#F2F2F5` / `#121214` | White |
| Black | `#0B0B0C` / `#18181B` / `#1E1E21` | `#F2F2F5` / `#CFCFD5` | `#F2F2F5` / `#0B0B0C` | White |
| Pure black (OLED) | `#000000` / `#121214` / `#18181B` | `#E4E4E8` / `#B8B8BF` | `#E4E4E8` / `#000000` | White |

Settings > Appearance offers the theme and, separately, the accent: Match theme (the theme's own), White, Blue,
Teal, Purple, Orange or Pink. The accent colours progress bars, the play/resume button, selected items and links;
focus never uses it. With White, the play button is a brighter glass pill, never a white fill that would look
focused.

Rationale, held by tests where it can be measured:

- **Contrast (WCAG 2.2).** In every theme and accent, body text and the focused label reach 7:1; secondary, muted,
  accent and error text 4.5:1; focus fills, rings and progress fills (against the canvas and their track) 3:1.
- **Dark elevation.** Raised surfaces are lighter, not shadowed (Material and Apple dark mode): canvas < surface <
  raised < high. The steps are larger than a phone's because TV picture modes crush near-black.
- **Pure black.** Black OLED pixels are off, so the canvas is `#000`, but surfaces stay slightly raised and text,
  focus fills and titles are off-white: pure white on black blooms (halation), and large white areas trip the
  panel's brightness limiter. Some OLED panels smear dark moving edges; the near-black **Black** theme avoids that.
- **Ten-foot focus.** Controls fill with the focus colour; artwork, profile photos and inputs get a white ring and
  the card lifts, so focus reads at a distance without boxing the caption. The ring stays white in every theme:
  it is thin, so it neither glares nor dims an OLED panel.
- **Restraint.** Saturated colour is limited to the accent and content; scrims fade into the canvas and stay short.

## Screen families

| Family | Composition |
|---|---|
| Sign-in and account recovery | Paired short code/QR with retry and automatic expiry renewal; optional saved sign-in is managed in Settings |
| Profiles and PIN | Centred circular profile photos with initials while unavailable; unprotected profiles select directly, protected profiles use separate numeric PIN entry |
| Servers and favourites | Structured selection rows, then grouped account/navigation actions |
| Home | Full-bleed feature, persistent Home/favourite-library/Search capsule, separate Account menu, explicit play/info/cycle controls and poster shelves |
| Libraries and collections | Browse toolbar and six-column portrait grid; three-column landscape or square music artwork |
| Search and people | Large search field, server-labelled shelves; biography/portrait and image/title credit rows |
| Details | Cinematic art and scrim, expandable two-line synopsis, primary action and round restart/More controls; secondary actions hidden until requested; extras and cast below |
| Watchlist and catalogue | Poster grid and selected filters; cover, metadata and explicit local-availability actions |
| Guide and DVR | Provider selection, program rows, channel/date views, recording status and server-supplied preference fields |
| Photos | Contained image above one grouped navigation/slideshow row |
| Playback | Icon transport/progress overlay; grouped audio/subtitle choices and native tracks behind Device tracks; More and submenu return paths; five-second auto-hide |
| Settings and diagnostics | Single-column value rows; quality/language alternatives on separate choice pages; privacy explanation in Diagnostics; Home holds the launch-profile toggle and the per-profile Home rows list (Enter shows or hides, Reorder moves with Up/Down); Developer settings (error log, technical readouts, playback decisions in Stats for nerds) appear only after the code is typed on the About version line |
| Confirmations and states | Explicit operation/item copy, confirmation and cancel; readable loading, empty and error/retry copy |

## Layout and input

Use Flexbox, margins and ordinary ES5 DOM helpers, not CSS Grid, flex-gap, CSS custom properties
or modern browser-only framework dependencies. Portrait grids reduce to four columns below
1400px; settings remain one column. Lists (library grids, Home shelves, search results, Settings,
dropdowns and player menus) keep the focused row centred below the fixed header, the first and last
rows stopping at the list's ends; other controls and horizontal rows are revealed at the nearest edge,
without depending on modern `scrollIntoView` options. Vertical menus wrap from end to end; Left/Right
stop at a row's ends rather than entering another section. The A–Z bar jumps to a letter's first title
in the full list, and earlier titles load as the viewer scrolls up. Card focus is restored by media
identity after a library page append.

Displaying, focusing or cycling a Home feature never initiates playback. Its explicit Play/Continue
button does; info opens details. Back on the app's first page (Home, or sign-in/profile/server
selection before Home) shows an "Exit app?" confirmation with Stay focused; Back or
Stay dismisses it and only Exit terminates the app. Biography and availability lookups never play. Resume uses the
PMS-selected on-deck **episode**, not its show ID. A missing on-deck episode leaves season browsing
available. All watched-state, Watchlist and DVR changes retain explicit confirmation.
Home episode shelves use the series poster when supplied, retaining episode number/title and
progress. Episode lists retain their stills rather than making every episode indistinguishable.
Original-file metadata, the PMS-reported stream and the requested transcode limit are distinct.
Missing stream metadata is labelled unreported, never substituted with the chosen limit.
Original/direct playback is requested when Samsung's published media specifications (or an exact
observed model entry) predict support; the server or the decoder can still refuse, and Vemm then
converts unless Direct Play is set to Force.

## Evidence and boundaries

The product and media DOM journeys cover the screen routes, selection, paging, episode identity,
photo controls and confirmed mutations using synthetic accounts, servers and AVPlay.
Browser captures at 1920x1080 and 1280x720 were inspected across these families, including
populated profiles/PIN, filters, person credits and DVR forms. Artwork and media in those captures
are synthetic; browser captures do not prove Samsung-panel rendering, codec support or performance.
Native acceptance and the remaining LG/official-client capability differences are recorded in
`../docs/samsung-tizen-client-spec.md`.
