# Vemm for Samsung Tizen

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

A Samsung TV owner browsing and playing personal and shared Plex Media Server libraries from
the couch with a TV remote. Plex remains the authority for media identity, permissions, watch
state and progress. This is a full client in development, not a replacement media server.

## Operating context

The owner's TVs are a 2017 UE55MU6172, two 2019 UE43RU7092, a QE65Q80C and a 2025 QE55QN70F. The wider investigation includes
2018+ televisions and The Frame; those models are not certified by this device's results.
The app is an ES5 Tizen Web application with AVPlay. The former LG native tree
is available in history, not maintained as a second app here.
Host DOM tests use synthetic accounts, servers and AVPlay. Browser renders prove layout, not
Samsung decoding, HDR, performance or panel output.

## Capabilities and constraints

Keep sign-in/QR renewal, profiles, server discovery, Home, libraries, search, details, people,
music/photos, Watchlist/catalogue, DVR, playback, settings and explicit confirmations available.
Preserve remote focus and Back behavior, bounded image/metadata retention and lifecycle cleanup.
Do not initiate playback or account writes merely to display or inspect a screen.
Do not add private APIs or unsupported playback claims to make the interface seem complete.
Licensed catalogue streaming and verified live tuning remain acceptance gaps.

## Brand commitments

Vemm (`/vem/`) is the working product brand and **Your media. At its best.** is
the working tagline. Keep the existing cinematic, remote-first layout as the
product reference. The default Blue (Blue Calm) theme uses quiet navy surfaces and pale-sky focus; Grey,
Black and Pure black (OLED) themes and an accent choice are colour tokens over the same screens, never a
redesign of them.
Keep controls text-first and avoid decorative iconography; retain compact
transport glyphs only where visible text would harm playback operation.
Do not borrow Plex, Samsung, Microsoft or upstream PlxNative branding or imply
endorsement. Vemm is a separate install and must not read/migrate historical
Plx credentials or settings.

## Evidence

The historical LG images/components remain at the immutable
[pre-migration source](https://github.com/dragoshont/plx-native/tree/f74610c8e8fda765245f548adcc6565becdca31b).
They are not current Samsung assets or build dependencies. Samsung implementation and acceptance truth
live in `docs/samsung-tizen-client-spec.md` and the Samsung feasibility/test register.

## Accessibility

Remote-first operation, visible focus, couch-legible text, visible labels for
ordinary controls, accessible names for compact playback glyphs,
English/Spanish/Belarusian copy and scrollable long content. Focus must not
imply selection or permission, and unavailable actions must remain explicitly
disabled or explained.
