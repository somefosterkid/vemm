# Vemm Samsung client data handling

Applies to current Vemm source. Published Samsung 0.2.7 is a separate historical
Plx package. Vemm does not read/import that app's tokens, settings or storage.
Historical LG policy is linked from the root privacy document, not an active
policy for this package.

## Services

The app communicates with Plex for linking, profiles, server discovery and
supported account/catalogue features, and with the selected media servers for
library metadata, artwork, playback and progress. Those services process
requests under their own policies. The app has no separate hosted backend
operated by this repository's maintainer.

Playback can update watched state, resume position and Continue Watching even
when the media are samples on a personal server. Account preference changes
can be shared with other Plex clients; the UI distinguishes them from settings
stored only on the TV.

## On the TV

**Stay signed in** defaults on. The saved account token is stored in
**unencrypted Web storage**, not the LG Key Manager. Settings can turn saved
sign-in off and delete the saved token. Signing out also clears recent searches
and resets the current in-memory account/server state.

Playback/language preferences, the new default-off graphics preference,
favorite-library choices and recent searches use local app storage. Sign-out
does not erase every local preference: **Reset preferences** removes app
preferences, favorite-library choices and recent searches. Storage errors are
reported; if saved sign-in cannot be removed, the app directs the user to clear
its data on the TV.

**Live TV** (optional) keeps one playlist link, which often contains a username
and password, and the name of the last channel watched, in the same unencrypted
storage. The TV contacts that provider directly to read the playlist, its logos
and its channels, over plain http if the link says so. The link and channel
addresses are never sent to Plex or shown in messages, Stats or the error log;
Settings can remove the link, and **Reset preferences** removes it too.

Downloaded artwork uses bounded requests, decoded images and temporary Blob
URLs. The optional graphics backend adds bounded in-memory WebGL textures,
released on view/image/lifecycle changes. It does not upload artwork or device
data to the project maintainer.

## Diagnostics and sharing

Vemm has no analytics or crash-upload feature enabled. This does
not describe the inherited LG application, which has separate optional
reporting features. Do not interpret LG Sentry/PostHog documentation or
sponsorship as a Samsung service.

The separate Tizen toolkit, developer inspector and benchmark can collect
device metadata, logs, source/package hashes and timing records when an
operator runs them. Those development records may contain private addresses,
device identifiers or application content. Keep raw records private and
redact them before sharing. The account-free benchmark blocks external
connections and playback; it is not the normal signed-in application.

For questions about this Samsung implementation, contact the maintainer through
[the canonical repository](https://github.com/dragoshont/vemm), not the upstream
author's support mailbox. Never include account tokens, passwords, certificates,
private server addresses or unredacted inspector logs in a public issue.
