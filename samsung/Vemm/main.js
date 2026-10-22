(function () {
    "use strict";

    var screen = document.getElementById("screen");
    var status = document.getElementById("status");
    var currentClient = null;
    var currentServerId = "";
    var holdCard = null;
    var holdTimer = null;
    var currentSection = null;
    var homeSections = [];
    var currentItems = [];
    var currentOffset = 0;
    var viewGeneration = 0;
    var itemsLoading = false;
    var sectionLandingFocus = null;
    var sectionLandingAt = 0;
    var authClient = null;
    var authPin = null;
    var authTimer = null;
    var authExpiryTimer = null;
    var authGeneration = 0;
    var accountToken = "";
    var accountClient = null;
    var activeProfile = null;
    var linkedProfile = null;
    var servers = [];
    var libraryFilters = {};
    var libraryGenreTitles = {};
    var libraryMenus = null;
    var letterCache = null;
    var letterReturn = null;
    var navigation = [];
    var restoreView = null;
    var retryView = null;
    var imageGeneration = 0;
    var imageQueue = [];
    var imageActive = 0;
    var imageUrls = [];
    var imageDecodes = [];
    // Finished artwork outlives its screen so that returning is instant. It is bounded by count, image
    // size and total bytes (hero art can be hundreds of KB on a TV with little memory), evicts the least
    // recently used image that is not on screen, and revokes what it drops.
    var ARTWORK_CACHE_LIMIT = 1500;
    var ARTWORK_PRELOAD_LIMIT = 1500;
    var ARTWORK_CACHE_BYTES = 1024 * 1024;
    // About 5% of the TV's memory, between 32 and 128 MB; 32 MB when the TV does not report it.
    var ARTWORK_CACHE_TOTAL = (function () {
        var total = 0;
        try { total = window.tizen.systeminfo.getTotalMemory(); } catch (error) { total = 0; }
        return Math.max(32, Math.min(128, Math.round(total / 1048576 / 20))) * 1024 * 1024;
    }());
    var artworkBytes = 0;
    var artworkCache = {};
    var artworkKeys = [];
    // Home artwork, and optionally library artwork, can also live on the TV (opt-in). The store is only touched while
    // preferences.saveHomeArtwork is on. Entries are keyed "serverId|path|WxH" in the store and in artworkCache alike; with
    // preferences.preloadArtwork the app start puts the saved ones (within the cache bounds) into artworkCache as "preloaded".
    var artworkStore = window.VemmArtworkStore ? window.VemmArtworkStore.open(window.indexedDB) : null;
    var clientSerial = 0;
    var homeCache = null;
    var homePending = false;
    var player = null;
    var playerItem = null;
    var playerClient = null;
    var playerSettings = null;
    var subtitleTimer = null;
    var hudTimer = null;
    var hudBuffering = false;
    // The buffering ring's last value and whether its 3 s spinner-only time has passed (setBufferRing).
    var ringValue = true;
    var ringPatient = false;
    var ringTimer = null;
    var hudFocus = null;
    var scrubReturnFocus = null;
    var nextTimer = null;
    var playerClosing = false;
    var lastAction = 0;
    var scrubTarget = null;
    var scrubRepeats = 0;
    var scrubTimer = null;
    // Seek preview frames (js/preview-thumbs.js) of the playing title, or null.
    var previewThumbs = null;
    var scrubOwner = null;
    // One seek runs at a time; presses while it lands queue the latest target (see seekToPlayer).
    var seekOwner = null;
    var seekInFlight = null;
    var queuedSeek = null;
    var stalledSeek = null;
    // Until a start or a seek moves the picture, AVPlay refuses a pause (right after play() it throws): Pause / Play
    // then only records what to do once it moves (true pause, false play, null nothing asked; applyWantedPause).
    var pauseWanted = null;
    var playerStarting = false;
    // Waiting for the server: `reconnect` after AVPlay lost the stream (reconnectPlayer), `stall` while it only
    // buffers (watchStall). reconnectOpens counts reopens since playback last played on; reconnectFrom is where
    // the latest one began; reconnectResume marks the next startPlayer as such a reopen.
    var reconnect = null;
    var stall = { timer: null, wait: null };
    var reconnectOpens = 0;
    var reconnectSince = 0;
    var reconnectFrom = null;
    var reconnectResume = false;
    var progressNoted = false;
    var playerPanel = "";
    var playerPosition = 0;
    var playerDuration = 0;
    var playerStatsVisible = false;
    // Re-reads the playing title's intro/credits choice after the viewer changes it in the menu.
    var playerSkipRefresh = null;
    var subtitleTiming = false;
    var subtitleTimingRepeats = 0;
    var subtitleTimingDirection = 0;
    var subtitleTimingDetentUntil = 0;
    var upNextGeneration = 0;
    var externalCues = null;
    var musicQueue = null;
    var musicLoading = false;
    var playlistQueue = null;
    var playlistLoading = false;
    var queueShuffle = false;
    var queueRepeat = "off";
    var viewCleanup = null;
    // Home hero: stepFeature(1 or -1) shows the next/previous featured title; the timer advances it while focus rests on the hero or navigation row.
    var stepFeature = null;
    var featureTimer = null;
    var viewClients = [];
    var suspendedView = null;
    var foregroundRecovery = null;
    // The background start of the focused Play control (preloadOnFocus).
    var preload = window.VemmPreload ? window.VemmPreload.create() :
        { arm: function () {}, cancel: function () {}, take: function () { return null; } };
    var subtitleSearchGeneration = 0;
    var preferences = { quality: "original", nextEpisode: "countdown", language: "en", continueAction: "details",
        skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low", subtitleColor: "white",
        subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto", enhancedGraphics: false,
        saveHomeArtwork: false, artworkLimitMb: 10, saveLibraryArtwork: false, preloadArtwork: true, autoAdvanceFeatures: true,
        minBuffer: 1, skipIntro: "button", skipCredits: "button", ratingSources: ["rt_critic", "rt_audience", "imdb", "tmdb"],
        theme: "blue", accent: "theme" };
    var preferenceError = "";
    var statsTimer = null;
    var graphics = null;
    var graphicsFailure = false;
    var product = window.VemmProduct || {
        name: "Vemm", pronunciation: "/vem/", tagline: "Your media. At its best.",
        platform: "Samsung Tizen", status: "working brand"
    };
    document.title = product.name;
    var brandName = document.querySelector(".app-header h1");
    var brandTagline = document.querySelector(".app-header p");
    if (brandName) { brandName.textContent = product.name; }
    if (brandTagline) { brandTagline.textContent = product.tagline; }
    var headerTitle = document.querySelector(".app-header .header-title");
    // The page name shown centered in the top bar, where it stays put while the list scrolls.
    function setHeaderTitle(text) { if (headerTitle) { headerTitle.textContent = text; } }

    function graphicsFallback() {
        graphicsFailure = true;
        setStatus("New graphics enhancements are unavailable here. Existing graphics remain active.", true);
    }

    function clearGraphics() {
        if (graphics) { graphics.clear(); }
    }

    function presentBackdrop(image) {
        if (!preferences.enhancedGraphics || !currentClient || document.hidden ||
                !screen.contains(image) || image.getAttribute("data-artwork-state") !== "loaded") { return; }
        if (!window.VemmGraphics) { graphicsFallback(); return; }
        try {
            if (!graphics) {
                graphics = window.VemmGraphics.create({ document: document, onError: graphicsFallback });
                graphics.setEnabled(true);
            }
            graphics.present(image);
        } catch (error) {
            clearGraphics();
            graphicsFallback();
        }
    }
    function directPlayProfile() {
        if (preferences.directPlay === "off" || !window.VemmCapabilities) { return null; }
        return window.VemmCapabilities.detect({ userAgent: navigator.userAgent,
            productinfo: window.webapis && window.webapis.productinfo,
            avinfo: window.webapis && window.webapis.avinfo });
    }
    function directPlaySummary() {
        if (preferences.directPlay === "off") { return translate("Direct play: {state}", { state: translate("Off") }); }
        var profile = directPlayProfile();
        if (!profile) { return translate("Direct play: {state}", { state: translate("Off") }); }
        var formats = profile.video.join("/").toUpperCase() + ", " + profile.audio.join("/").toUpperCase() + ", " +
            profile.maxWidth + "x" + profile.maxHeight + ", " + translate("up to {fps} fps", { fps: profile.maxFrameRate || 60 }) +
            (profile.hdr === "hdr10" ? ", HDR10/HLG" : "");
        var text = preferences.directPlay === "force" ?
            translate("Direct play: {state}", { state: translate("Force") }) + " (" + formats + "). " +
                translate("The original file is always sent; if this TV cannot decode it, playback stops instead of converting.") :
            translate("Direct play: {state}", { state: translate("Auto") }) + " (" + formats + "). " +
                translate("From Samsung's published media specifications; other formats convert on the server.");
        if (profile.status === "observed" && profile.model) {
            text += " " + translate("Confirmed on this TV model: {model}.", { model: profile.model });
        }
        return text;
    }
    var pendingRestore = null;
    // Home moves vertically with a GPU transform on .home-track instead of scrolling the screen:
    // native scrolling repaints the whole Home on Tizen's older engines (50-150 ms per shelf on a
    // 2017 set), while translate3d is a compositor move (one 16.7 ms frame).
    var homeY = 0;
    if (window.VemmPreferences) {
        try {
            preferences = window.VemmPreferences.load(window.localStorage);
            window.VemmI18n.setLanguage(preferences.language);
        } catch (error) { preferenceError = errorText(error); }
    }
    if (typeof window.Promise !== "function" || typeof window.fetch !== "function" ||
            typeof window.URL !== "function" || typeof window.Blob !== "function") {
        status.textContent = "This browser lacks required network or media APIs. Use a supported Samsung runtime.";
        status.className = "status status-error";
        return;
    }
    preloadArtwork();
    function translate(text, values) {
        if (window.VemmI18n) { return window.VemmI18n.text(text, values); }
        return String(text).replace(/\{([A-Za-z0-9]+)\}/g, function (match, key) {
            return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
        });
    }

    function errorText(error) {
        return window.VemmI18n && window.VemmI18n.error ? window.VemmI18n.error(error) :
            translate(error && error.message || "Playback failed. Stop and retry.");
    }

    function savePreferences() {
        try {
            window.VemmPreferences.save(window.localStorage, preferences);
            window.VemmI18n.setLanguage(preferences.language);
        } catch (error) {
            setStatus("Could not save preferences. Check app storage permissions.", true);
            return false;
        }
        applyTheme();
        return true;
    }

    // js/theme.js applied the saved theme before the first paint; a new choice applies at once (the same one: nothing).
    function applyTheme() {
        if (window.VemmTheme) { window.VemmTheme.apply(document, preferences.theme, preferences.accent); }
    }

    function visit(action) {
        pendingRestore = null;
        if (restoreView) {
            var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
            navigation.push({ restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop });
            if (navigation.length > 20) { navigation.shift(); }
        }
        action();
    }

    function backView() {
        if (player) { stopPlayer(); return; }
        if (cancelServerConnection) { cancelServerConnection(); return; }
        var previous = navigation.pop();
        if (!previous) {
            if (currentClient && screen.className.indexOf("screen-home") === -1) { loadHome(false); return; }
            confirmExit();
            return;
        }
        pendingRestore = previous;
        previous.restore();
    }

    function resetImages() {
        clearGraphics();
        imageGeneration += 1;
        imageQueue = [];
        imageDecodes.slice().forEach(function (cancel) { cancel(); });
        imageUrls.forEach(function (url) { window.URL.revokeObjectURL(url); });
        imageUrls = [];
    }

    // The stable server id when it is known (also before the client exists), else a per-client serial.
    function artworkKey(client, path, size) {
        var owner = client ? client.serverId : currentServerId;
        if (!owner && client) { owner = client.artworkId = client.artworkId || "client" + (++clientSerial); }
        return owner + "|" + path + "|" + (size ? size.width + "x" + size.height : "");
    }

    function releaseArtwork(key) {
        window.URL.revokeObjectURL(artworkCache[key].url);
        artworkBytes -= artworkCache[key].size;
        delete artworkCache[key];
        artworkKeys.splice(artworkKeys.indexOf(key), 1);
    }

    // Changing server, switching profile or signing out forgets the previous identity's Home and downloaded artwork.
    // Artwork preloaded from the TV's own store is keyed by server and outlives them; dropSavedArtwork() releases it.
    function resetServerCaches() {
        homeCache = null;
        forgetListings();
        artworkKeys.slice().forEach(function (key) { if (!artworkCache[key].preloaded) { releaseArtwork(key); } });
    }

    function dropSavedArtwork() {
        artworkKeys.slice().forEach(function (key) { if (artworkCache[key].preloaded) { releaseArtwork(key); } });
    }

    // At app start: one pass over the store puts the saved artwork, Home first, into artworkCache. Object URLs of stored blobs
    // cost no pixels until an image uses them, so the byte budget (not the download count limit) caps the pass.
    function preloadArtwork() {
        if (!artworkStore || !preferences.saveHomeArtwork || !preferences.preloadArtwork ||
                !window.URL || !window.URL.createObjectURL) { return; }
        artworkStore.preload(ARTWORK_PRELOAD_LIMIT - artworkKeys.length, ARTWORK_CACHE_TOTAL - artworkBytes,
            ARTWORK_CACHE_BYTES).then(function (entries) {
            if (!entries || !preferences.saveHomeArtwork || !preferences.preloadArtwork) { return; }
            // The entries arrive highest priority first; the last one cached is the most recently used.
            entries.slice().reverse().forEach(function (entry) {
                if (artworkCache[entry.key] || artworkKeys.length >= ARTWORK_PRELOAD_LIMIT ||
                        artworkBytes + entry.size > ARTWORK_CACHE_TOTAL) { return; }
                artworkCache[entry.key] = { url: window.URL.createObjectURL(entry.blob), generation: -1,
                    size: entry.size, preloaded: true };
                artworkBytes += entry.size;
                artworkKeys.push(entry.key);
            });
        }).catch(function () { /* saved artwork is only a convenience */ });
    }

    function cacheArtwork(job, url, blob) {
        if (artworkCache[job.key] || blob.size > ARTWORK_CACHE_BYTES) { return false; }
        // The count limit is for downloaded images; the preloaded ones are bounded by bytes alone.
        function downloaded(key) { return !artworkCache[key].preloaded; }
        while (artworkKeys.filter(downloaded).length >= ARTWORK_CACHE_LIMIT || artworkBytes + blob.size > ARTWORK_CACHE_TOTAL) {
            var overCount = artworkKeys.filter(downloaded).length >= ARTWORK_CACHE_LIMIT;
            var victim = artworkKeys.filter(function (key) {
                return artworkCache[key].generation !== imageGeneration && (!overCount || downloaded(key));
            })[0];
            if (victim === undefined) { return false; }
            releaseArtwork(victim);
        }
        artworkCache[job.key] = { url: url, generation: job.generation, size: blob.size };
        artworkBytes += blob.size;
        artworkKeys.push(job.key);
        return true;
    }

    function imageUnavailable(node, failure) {
        node.setAttribute("data-artwork-state", "unavailable");
        node.setAttribute("data-artwork-error", failure);
        node.alt = translate("Artwork unavailable");
        node.src = placeholderArt();
    }

    // Shows a cached image without queueing or downloading it.
    function useCachedArtwork(job) {
        var entry = artworkCache[job.key];
        if (!entry) { return false; }
        artworkKeys.push(artworkKeys.splice(artworkKeys.indexOf(job.key), 1)[0]);
        entry.generation = job.generation;
        job.node.setAttribute("data-artwork-state", "decoding");
        job.node.onload = function () {
            job.node.onload = null;
            job.node.onerror = null;
            if (job.generation !== imageGeneration) { return; }
            job.node.setAttribute("data-artwork-state", "loaded");
            if (job.loaded) { job.loaded(); }
        };
        job.node.onerror = function () {
            job.node.onload = null;
            job.node.onerror = null;
            if (artworkCache[job.key] === entry) { releaseArtwork(job.key); }
            if (job.generation !== imageGeneration) { return; }
            if (entry.preloaded && job.persist) {
                artworkStore.remove(job.persist);
                missed(job);
            } else { imageUnavailable(job.node, "decode"); }
        };
        job.node.src = entry.url;
        return true;
    }

    function decodeArtwork(job, blob) {
        job.node.setAttribute("data-artwork-state", "decoding");
        return new Promise(function (resolve, reject) {
            var url = window.URL.createObjectURL(blob);
            imageUrls.push(url);
            var complete = false;
            var timer = setTimeout(function () { finish(new Error("Artwork decode timed out.")); }, 5000);
            function cancel() { finish(); }
            function finish(error, loaded) {
                if (complete) { return; }
                complete = true;
                clearTimeout(timer);
                job.node.onload = null;
                job.node.onerror = null;
                if (error || !loaded || !cacheArtwork(job, url, blob)) { window.URL.revokeObjectURL(url); }
                if (loaded && job.persist && !job.fromDisk && job.generation === imageGeneration) { saveArtwork(job, blob); }
                imageUrls.splice(imageUrls.indexOf(url), 1);
                imageDecodes.splice(imageDecodes.indexOf(cancel), 1);
                if (error) { reject(error); }
                else {
                    if (loaded && job.generation === imageGeneration) {
                        job.node.setAttribute("data-artwork-state", "loaded");
                        if (job.loaded) { job.loaded(); }
                    }
                    resolve();
                }
            }
            imageDecodes.push(cancel);
            job.node.onload = function () { finish(null, true); };
            job.node.onerror = function () { finish(new Error("Artwork could not be decoded.")); };
            job.node.src = url;
        });
    }

    // Saved artwork that is missing or broken: downloaded when the client exists, else left to the later render.
    function missed(job) {
        if (job.client) { enqueueImage(job, job.first); return; }
        job.node.setAttribute("data-artwork-state", "unavailable");
        job.node.setAttribute("data-artwork-error", "unsupported");
    }

    function pumpImages() {
        while (imageActive < 6 && imageQueue.length) {
            var next = imageQueue.shift();
            if (next.node.vemmFar === true || useCachedArtwork(next)) { continue; }
            (function (job) {
                imageActive += 1;
                var failure = "fetch";
                job.node.setAttribute("data-artwork-state", "fetching");
                Promise.resolve().then(function () { return job.client.image(job.path, job.size); }).then(function (blob) {
                    if (job.generation !== imageGeneration) { return; }
                    failure = "size";
                    if (blob.size > (job.maxBytes || 2 * 1024 * 1024)) { throw new Error("Artwork exceeds the image memory limit."); }
                    if (job.node.vemmFar === true || (screen.contains && !screen.contains(job.node))) { return; }
                    failure = "decode";
                    return decodeArtwork(job, blob);
                }).catch(function () {
                    if (job.generation === imageGeneration) { imageUnavailable(job.node, failure); }
                }).then(function () { imageActive -= 1; pumpImages(); });
            }(next));
        }
    }

    function twoDigits(value) { return value < 10 ? "0" + value : String(value); }

    // The value a library is sorted by, as one short line under the card; empty when the item has none.
    function sortCardValue(item, key) {
        var media = item.Media && item.Media[0] || {};
        function day(seconds) {
            var date = new Date(Number(seconds) * 1000);
            return Number(seconds) > 0 ? date.getFullYear() + "-" + twoDigits(date.getMonth() + 1) + "-" + twoDigits(date.getDate()) : "";
        }
        function score(value, image) {
            if (typeof value !== "number" || isNaN(value)) { return ""; }
            return /rottentomatoes/.test(String(image || "")) ? Math.round(value * 10) + "%" : value.toFixed(1);
        }
        if (key === "originallyAvailableAt") { return String(item.originallyAvailableAt || "").slice(0, 10); }
        if (key === "rating") { return score(item.rating, item.ratingImage); }
        if (key === "audienceRating") { return score(item.audienceRating, item.audienceRatingImage); }
        if (key === "addedAt") { return day(item.addedAt); }
        if (key === "lastViewedAt") { return day(item.lastViewedAt); }
        if (key === "duration") {
            var minutes = Math.round((Number(item.duration) || 0) / 60000);
            return minutes ? (minutes >= 60 ? Math.floor(minutes / 60) + "h " : "") + minutes % 60 + "m" : "";
        }
        if (key === "mediaHeight") {
            var resolution = String(media.videoResolution || "").toLowerCase();
            var height = Number(media.height) || 0;
            return resolution === "4k" || height >= 2000 ? "4K" : /^\d+$/.test(resolution) ? resolution + "p" :
                resolution === "sd" ? "SD" : height ? height + "p" : "";
        }
        if (key === "mediaBitrate") {
            var rate = Number(media.bitrate) || 0;
            return rate >= 1000 ? (rate / 1000).toFixed(1) + " Mbps" : rate ? rate + " kbps" : "";
        }
        if (key === "unviewedLeafCount") {
            return item.unviewedLeafCount === undefined ? "" : translate("{count} unwatched", { count: item.unviewedLeafCount });
        }
        return "";
    }

    function card(parent, item, client, siblings, options) {
        options = options || {};
        var node = button(parent, "", function () {
            if (options.open) { options.open(item); return; }
            if (options.deck && preferences.continueAction === "play" &&
                    ["movie", "episode", "clip"].indexOf(item.type) !== -1) {
                playFromCard(item, client, true);
                return;
            }
            visit(function () {
                if (item.type === "photo") {
                    var photos = (siblings || [item]).filter(function (entry) { return entry.type === "photo"; });
                    openPhotos(photos, Math.max(0, photos.indexOf(item)), client);
                } else if (item.type === "season") {
                    openListing(item.parentTitle || item.title, function (offset) {
                        return client.getChildren(item.ratingKey, offset);
                    }, client, 0, null, null, item.parentRatingKey ? { showRatingKey: item.parentRatingKey } : null);
                } else { openDetail(item.ratingKey, client, item.type === "playlist"); }
            });
        });
        node.className = "media-card";
        if (options.deck && ["movie", "episode", "clip"].indexOf(item.type) !== -1) {
            preloadOnFocus(node, client, function () {
                return preferences.continueAction === "play" ? cardTarget(item, client, true) : null;
            });
        }
        var seriesPoster = options.shelf && item.type === "episode" && (item.grandparentThumb || item.parentThumb);
        node.setAttribute("data-shape", !seriesPoster && ["episode", "clip", "photo"].indexOf(item.type) !== -1 ? "landscape" :
            ["artist", "album", "track", "playlist"].indexOf(item.type) !== -1 ? "square" : "portrait");
        node.vemmCard = { item: item, client: client, options: options };
        var image = element("img", "poster");
        image.alt = item.title || "Media";
        image.src = placeholderArt();
        node.appendChild(image);
        // The progress bar follows the poster so it sits on the artwork's bottom edge on every screen.
        if (item.viewOffset && item.duration) {
            var progress = element("span", "card-progress");
            var fill = element("span", "card-progress-fill");
            if (fill.style) { fill.style.width = Math.min(100, Math.max(0, item.viewOffset * 100 / item.duration)) + "%"; }
            progress.appendChild(fill);
            node.appendChild(progress);
        }
        node.appendChild(element("span", "card-title", seriesPoster ? item.grandparentTitle || item.title :
            item.type === "season" && item.parentTitle ? item.parentTitle + " · " + item.title :
            item.title || item.tag || "Untitled"));
        var episodeNumber = item.type === "episode" && item.parentIndex !== undefined && item.index !== undefined ?
            "S" + item.parentIndex + " E" + item.index : "";
        var remaining = options.shelf && item.viewOffset && item.duration ?
            translate("{minutes} min left", { minutes: Math.max(1, Math.round((item.duration - item.viewOffset) / 60000)) }) : "";
        node.appendChild(element("span", "card-meta", options.sort && options.sort !== "titleSort" ?
            sortCardValue(item, options.sort) : item.type === "episode" ?
            [episodeNumber, item.title, remaining].filter(Boolean).join(" · ") : item.type === "playlist" ?
            translate("{count} items", { count: item.leafCount || 0 }) : remaining || String(item.year || "")));
        if (item.viewCount) {
            var watchedMark = element("span", "card-watched", "✓");
            watchedMark.setAttribute("aria-label", translate("Watched"));
            node.appendChild(watchedMark);
        }
        var shape = node.getAttribute ? node.getAttribute("data-shape") : "portrait";
        node.vemmArt = { image: image, client: client, path: seriesPoster || item.thumb || item.art || item.composite,
            size: shape === "landscape" ? { width: 480, height: 270 } : shape === "square" ? { width: 360, height: 360 } : { width: 240, height: 360 },
            category: options.shelf ? "home" : options.library ? "library" : undefined };
        if (options.lazy) { node.vemmFar = true; } else { showArt(node); }
        return node;
    }

    // Library cards fetch their artwork only while near the viewport (see syncLibraryArt).
    function showArt(node) {
        var art = node.vemmArt;
        if (node.vemmFar === false) { return; }
        node.vemmFar = false;
        queueImage(art.image, art.client, art.path, art.size, undefined, undefined, undefined, art.category);
    }

    function hideArt(node) {
        if (node.vemmFar !== false) { return; }
        node.vemmFar = true;
        node.vemmArt.image.onload = null;
        node.vemmArt.image.onerror = null;
        node.vemmArt.image.removeAttribute("data-artwork-state");
        node.vemmArt.image.src = placeholderArt();
    }

    // category is "home" or "library" for artwork that may be saved on the TV.
    function queueImage(node, client, path, size, maxBytes, loaded, first, category) {
        node.setAttribute("data-artwork-error", "");
        // Saved artwork needs no client: the remembered Home shows it before the connection exists.
        var persist = category && artworkStore && preferences.saveHomeArtwork &&
            (category === "home" || preferences.saveLibraryArtwork) && (client ? client.serverId : currentServerId);
        var unavailable = !path ? "metadata" :
            (!client || !client.image) && !persist || !window.URL || !window.URL.createObjectURL ? "unsupported" :
            client && client.image && imageQueue.length >= 200 ? "capacity" : null;
        if (unavailable) {
            node.setAttribute("data-artwork-state", "unavailable");
            node.setAttribute("data-artwork-error", unavailable);
            return;
        }
        node.setAttribute("data-artwork-state", "queued");
        var job = { client: client, path: path, node: node, generation: imageGeneration, size: size, maxBytes: maxBytes, loaded: loaded,
            key: artworkKey(client, path, size), first: first };
        if (persist) { job.category = category; job.persist = job.key; }
        if (useCachedArtwork(job)) { return; }
        if (persist) { lookupArtwork(job); return; }
        enqueueImage(job, first);
    }

    function enqueueImage(job, first) {
        if (first) { imageQueue.unshift(job); } else { imageQueue.push(job); }
        pumpImages();
    }

    // Tries the TV's storage before downloading. Every lookup queued in the same turn is read in one IndexedDB transaction and
    // each image is attached as soon as it is read. It runs beside the download queue, so it never holds a slot.
    var pendingLookups = [];
    function lookupArtwork(job) {
        pendingLookups.push(job);
        if (pendingLookups.length === 1) { Promise.resolve().then(flushLookups); }
    }

    function flushLookups() {
        var jobs = pendingLookups;
        pendingLookups = [];
        function stale(job) { return job.generation !== imageGeneration || job.node.vemmFar === true || (screen.contains && !screen.contains(job.node)); }
        var byKey = {};
        var keys = [];
        jobs.forEach(function (job) {
            if (stale(job)) { return; }
            if (!byKey[job.persist]) { byKey[job.persist] = []; keys.push(job.persist); }
            byKey[job.persist].push(job);
        });
        if (!keys.length) { return; }
        function attach(key, blob) {
            var list = byKey[key];
            byKey[key] = null;
            (list || []).forEach(function (job) {
                if (stale(job)) { return; }
                if (!blob || !preferences.saveHomeArtwork) { missed(job); return; }
                job.fromDisk = true;
                decodeArtwork(job, blob).catch(function () {
                    artworkStore.remove(job.persist);
                    job.fromDisk = false;
                    if (!stale(job)) { missed(job); }
                });
            });
        }
        // A failed or timed-out batch leaves the unread keys to be downloaded.
        artworkStore.getMany(keys, attach).then(function () {
            keys.forEach(function (key) { if (byKey[key]) { attach(key, null); } });
        });
    }

    function saveArtwork(job, blob) {
        if (artworkStore && preferences.saveHomeArtwork) {
            artworkStore.setLimit(preferences.artworkLimitMb * 1024 * 1024);
            artworkStore.put(job.persist, blob, job.category);
        }
    }

    function setDetailMode(enabled) {
        var shell = document.querySelector && document.querySelector(".app-shell");
        if (shell) { shell.className = enabled ? "app-shell detail-mode" : "app-shell"; }
    }
    var usingRelay = false;

    function recoverSession(error) {
        if (error.status !== 401 && error.status !== 403) { return false; }
        if (error.scope === "account" && error.status === 401) {
            var deleted = signOut();
            setStatus(translate("{message} {warning}", { message: translate("Your Plex session expired. Sign in again."),
                warning: deleted ? "" : translate("The saved session could not be deleted. Clear this app's data on the TV.") }), true);
            return true;
        }
        if (error.scope === "server" && error.status === 401 && accountClient) {
            currentClient = null;
            openServers("This server's access grant expired. Select a server again; your Plex account is still linked.");
            return true;
        }
        return false;
    }

    function cancelViewRequests() {
        viewClients.forEach(function (client) { client.cancelRequests(); });
        viewClients = [];
        if (currentClient && currentClient.cancelRequests) { currentClient.cancelRequests(); }
        if (accountClient && accountClient.cancelRequests) { accountClient.cancelRequests(); }
    }

    function stopFeatureTimer() {
        if (featureTimer !== null) { clearTimeout(featureTimer); featureTimer = null; }
    }

    function armFeatureTimer() {
        stopFeatureTimer();
        var active = document.activeElement;
        if (!stepFeature || !preferences.autoAdvanceFeatures || !active || !active.parentNode ||
                !/(?:home-navigation|home-feature-actions)/.test(active.parentNode.className || "")) { return; }
        var generation = viewGeneration;
        featureTimer = setTimeout(function () {
            featureTimer = null;
            if (generation !== viewGeneration || player || !stepFeature) { return; }
            stepFeature(1);
            armFeatureTimer();
        }, 16000);
    }

    function clear(node) {
        if (node === screen) { homePending = false; preload.cancel(); }
        if (node === screen && !player) {
            cancelViewRequests();
        }
        if (node === screen) {
            removeSubtitlePreview();
            stepFeature = null;
            stopFeatureTimer();
        }
        if (node === screen && viewCleanup) {
            var cleanup = viewCleanup;
            viewCleanup = null;
            cleanup();
        }
        if (node === screen) {
            resetImages();
            setDetailMode(false);
            setHeaderTitle("");
            screen.className = "screen";
        }
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
        // After the children are gone, so writing scrollTop lays out an empty screen, not the old one.
        if (node === screen) { screen.scrollTop = 0; }
    }

    function element(tagName, className, text) {
        var node = document.createElement(tagName);
        if (className) {
            node.className = className;
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        return node;
    }

    function page(title, kind) {
        screen.className = "screen screen-" + kind;
        if (kind === "settings") { setHeaderTitle(title); return; }
        screen.appendChild(element("h2", "page-title", title));
    }

    function group(parent, title, className) {
        var section = element("section", className || "menu-group");
        if (title) { section.appendChild(element("h3", "group-title", title)); }
        parent.appendChild(section);
        return section;
    }

    // Transparent, so the theme's placeholder surface and glyph behind the image show (style.css, artwork placeholders).
    function placeholderArt() {
        return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='360'/%3E";
    }

    function titleTile(parent, item, action, client, caption) {
        var node = button(parent, "", action);
        node.className = "title-tile";
        var art = element("img", "title-tile-art");
        art.alt = "";
        art.src = placeholderArt();
        node.appendChild(art);
        var copy = element("span", "title-tile-copy");
        copy.appendChild(element("span", "title-tile-title", item.title || item.tag || translate("Untitled")));
        if (caption) { copy.appendChild(element("span", "title-tile-caption", caption)); }
        node.appendChild(copy);
        if (client) { queueImage(art, client, item.thumb, { width: 240, height: 360 }); }
        return node;
    }

    function moveHome(y) {
        var track = screen.querySelector(".home-track");
        if (!track) { return false; }
        homeY = Math.max(0, Math.round(y));
        track.style.webkitTransform = track.style.transform = "translate3d(0," + (-homeY) + "px,0)";
        screen.scrollTop = 0;
        return true;
    }

    // Shared focus behaviours. Where Left from a Home row's first card came from, so Down from the account button
    // can return there. sideways is set while Left/Right steps along a row: only the row scrolls, never the page.
    var homeReturn = null;
    var sideways = false;
    function hasClass(node, pattern) { return !!node && pattern.test(node.className || ""); }
    // Lists keep the focused row in the middle of the visible height; a shelf (title and row) counts as one row.
    var CENTERED = /(?:^| )(?:item-list|catalogue-grid|shelf|settings-menu|search-results|dropdown-list|player-menu)(?: |$)/;
    // How far content must move for box's middle to sit in the middle of [top, bottom].
    function centerShift(box, top, bottom) { return Math.round((box.top + box.bottom - top - bottom) / 2); }
    function usable(nodes) {
        return Array.prototype.filter.call(nodes, function (node) { return !node.disabled && !insideHidden(node); });
    }
    // Vertical menus wrap: Up on the first item goes to the last, Down on the last to the first.
    function wrapFocus(controls, active, direction) {
        var index = controls.indexOf(active);
        if (controls.length) { controls[index < 0 ? 0 : (index + direction + controls.length) % controls.length].focus(); }
    }
    // Horizontal rows: Left/Right step along them and stop at their ends (see moveFocus), never entering another section.
    var ROWS = /(?:^| )(?:shelf-row|detail-cast-row|people-results|page-toolbar|home-navigation|home-feature-actions|playback-controls|chapter-strip|detail-actions)(?: |$)/;
    function rowOf(node) {
        var row = node && node.parentNode;
        if (hasClass(row, /(?:^| )playback-group(?: |$)/)) { row = row.parentNode; }
        return hasClass(row, ROWS) ? row : null;
    }

    // The one reveal for every focus change. Rows scroll sideways only as far as needed. Vertically, inside a list
    // the focused row is centred below the fixed header (the browser stops the first and last rows at the ends);
    // anything else scrolls only as far as needed. Fixed bars never scroll, and menus scroll inside themselves.
    function revealControl(node) {
        if (!node.getBoundingClientRect) { return; }
        var home = screen.className.indexOf("screen-home") !== -1;
        if (home && hasClass(node.parentNode, /home-feature-actions/)) {
            screen.className = "screen screen-home";
            if (!moveHome(0)) { screen.scrollTop = 0; }
            return;
        }
        var box = node.getBoundingClientRect();
        var shelf = null;
        var list = null;
        for (var parent = node.parentNode; parent && parent !== screen; parent = parent.parentNode) {
            if (hasClass(parent, /(?:^| )(?:browse-header|letter-bar)(?: |$)/)) { return; }
            if (hasClass(parent, /(?:^| )(?:shelf-row|home-navigation)(?: |$)/)) {
                var edges = parent.getBoundingClientRect();
                if (box.left < edges.left + 8) { parent.scrollLeft -= edges.left + 8 - box.left; }
                else if (box.right > edges.right - 8) { parent.scrollLeft += box.right - edges.right + 8; }
            }
            if (!shelf && hasClass(parent, /(?:^| )shelf(?: |$)/)) { shelf = parent; }
            if (!list && CENTERED.test(parent.className || "")) { list = parent; }
            if (hasClass(parent, /(?:^| )(?:player-menu|dropdown-list)(?: |$)/)) {
                var menu = parent.getBoundingClientRect();
                parent.scrollTop += centerShift(box, menu.top, menu.bottom);
                return;
            }
        }
        if (parent !== screen || sideways) { return; }
        var header = screen.querySelector(".browse-header");
        var bounds = screen.getBoundingClientRect();
        var top = header ? header.getBoundingClientRect().bottom + 12 : bounds.top + 8;
        var bottom = bounds.bottom - 8;
        var shift = list ? centerShift(shelf ? shelf.getBoundingClientRect() : box, top, bottom) :
            box.top < top ? box.top - top : box.bottom > bottom ? box.bottom - bottom : 0;
        var track = home && screen.querySelector(".home-track");
        if (!track) { if (shift) { screen.scrollTop += shift; } return; }
        // Home moves its track instead (moveHome). The hero is hidden while a shelf has focus, so the first shelf
        // stops right under the header, and the last stops at the bottom edge. The browser may already have scrolled
        // the screen to the focused card; moveHome undoes that, so it counts as part of the track's position.
        var y = homeY + screen.scrollTop;
        var first = track.querySelector(".shelf");
        var low = first ? y + first.getBoundingClientRect().top - top : 0;
        var high = y + track.getBoundingClientRect().bottom - bounds.bottom;
        moveHome(Math.max(low, Math.min(high, y + shift)));
        if (node.vemmCard) { screen.className = "screen screen-home shelves-focused"; }
    }

    // Developer mode only: the error log keeps what the app told the viewer went wrong.
    function devMode() { return !!window.VemmDevMode && window.VemmDevMode.enabled(window.localStorage); }
    function logError(message) {
        if (window.VemmDevMode) { window.VemmDevMode.record(window.localStorage, message); }
    }

    function setStatus(message, isError) {
        if (isError && message) { logError(message); }
        var retry = Array.prototype.filter.call(screen.querySelectorAll("button"), function (control) {
            return /(?:^| )route-retry(?: |$)/.test(control.className);
        })[0];
        if (retry && retry.parentNode && !isError) { retry.parentNode.removeChild(retry); }
        if (isError && !player && retryView && !retry) {
            var retryAction = retryView;
            button(screen, "Retry", retryAction).className += " route-retry";
        }
        status.textContent = translate(message || "");
        status.className = isError ? "status status-error" : "status";
        if (isError && player) { showHud(); cancelHudTimer(); }
    }

    // A loading placeholder holds focus without consuming a pending Back restore, which belongs
    // to the controls the view renders once its data arrives.
    function focusLoading() {
        if (!pendingRestore) { focusFirst(); return; }
        var controls = screen.querySelectorAll("button, input, select");
        for (var i = 0; i < controls.length; i += 1) {
            if (!controls[i].disabled && !insideHidden(controls[i])) { controls[i].focus(); return; }
        }
    }

    function focusFirst() {
        var controls = screen.querySelectorAll("button, input, select");
        if (pendingRestore) {
            var previous = pendingRestore;
            pendingRestore = null;
            if (controls[previous.focus] && !controls[previous.focus].disabled && !insideHidden(controls[previous.focus])) {
                controls[previous.focus].focus();
                screen.scrollTop = previous.scroll || 0;
                return;
            }
        }
        for (var i = 0; i < controls.length; i += 1) {
            if (!controls[i].disabled && !insideHidden(controls[i])) {
                controls[i].focus();
                return;
            }
        }
    }

    function addSectionHeading(parent, title) {
        parent.appendChild(element("h2", "section-heading", title));
    }

    function stopAuthorization() {
        if (authClient && authClient.cancelRequests) { authClient.cancelRequests(); }
        authGeneration += 1;
        if (authTimer !== null) {
            clearTimeout(authTimer);
            authTimer = null;
        }
        if (authExpiryTimer !== null) {
            clearTimeout(authExpiryTimer);
            authExpiryTimer = null;
        }
        authPin = null;
    }

    function pollAuthorization(generation, info) {
        if (generation !== authGeneration || !authPin) {
            return;
        }
        authClient.pollAuthorization(authPin).then(function (result) {
            if (generation !== authGeneration) {
                return;
            }
            if (result.status === "pending") {
                info.textContent = translate("Waiting for you to sign in…");
                authTimer = setTimeout(function () {
                    pollAuthorization(generation, info);
                }, 3000);
            } else if (result.status === "linked") {
                accountToken = result.token;
                stopAuthorization();
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                var storageWarning = "";
                if (window.VemmSession) {
                    try {
                        if (window.VemmSession.enabled(window.localStorage)) {
                            window.VemmSession.save(window.localStorage, accountToken);
                        }
                    }
                    catch (error) { storageWarning = translate("Could not save sign-in. Check app storage permissions."); }
                }
                openProfiles(storageWarning);
            } else if (result.status === "expired") {
                beginAuthorization(info.parentNode);
            } else {
                stopAuthorization();
                info.textContent = translate(result.status === "denied" ?
                    "Sign-in was denied. Get a new code to try again." :
                    "This code expired. Get a new code to try again.");
                setStatus(info.textContent, result.status === "denied");
            }
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = translate("Network issue while checking sign-in. Retrying…");
            authTimer = setTimeout(function () {
                pollAuthorization(generation, info);
            }, 5000);
        });
    }

    function button(parent, label, action, literal, iconName) {
        var icon = iconName || (/^(Play|Resume|Pause|Start watching)/.test(label) ? "play" :
            /^(Back|Cancel|Close|Stop and return)/.test(label) ? "back" :
            /^(Search|Discover)/.test(label) ? "search" :
            /^(Settings|Diagnostics|Reset|Transcode|Sort)/.test(label) ? "settings" :
            /^(Change server|Refresh servers|Retry discovery)/.test(label) ? "server" :
            /^(Favorite|Watchlist|Mark|Remove from)/.test(label) ? "check" :
            /^(Change profile|Sign out|Use linked account)/.test(label) ? "profile" :
            /^Live TV/.test(label) ? "television" :
            /^Refresh$/.test(label) ? "refresh" :
            /^More$/.test(label) ? "more" : "none");
        var node = element("button", "secondary-button menu-control menu-icon-" + icon,
            literal ? label : translate(label));
        node.type = "button";
        node.addEventListener("click", function (event) {
            if (homePending) { setStatus("Connecting…"); return; }
            action(event);
        });
        node.addEventListener("focus", function () { revealControl(node); });
        parent.appendChild(node);
        return node;
    }

    // The profile list opens with the most recently chosen profile focused.
    var LAST_PROFILE_KEY = "vemm-tizen-last-profile";
    // Set at launch only: the first profile list opens the last profile itself when Settings asks for that.
    var autoOpenPending = false;

    // Each profile may tint its icon; the choice lives on this TV only, keyed by profile uuid.
    var PROFILE_COLORS_KEY = "vemm-tizen-profile-colors";
    var PROFILE_COLORS = [
        { name: "Red", value: "#e5484d" }, { name: "Orange", value: "#f08a24" },
        { name: "Yellow", value: "#e0b72a" }, { name: "Green", value: "#3fb868" },
        { name: "Teal", value: "#27b5b0" }, { name: "Blue", value: "#4f8cff" },
        { name: "Purple", value: "#9b6bf2" }, { name: "Pink", value: "#e866a8" }
    ];
    function profileColors() {
        var colors = {};
        try { colors = JSON.parse(window.localStorage.getItem(PROFILE_COLORS_KEY) || "{}") || {}; } catch (error) { colors = {}; }
        return colors;
    }
    function profileColor(uuid) {
        var value = profileColors()[uuid];
        return typeof value === "string" && paletteColor(value) ? value : "";
    }
    function paletteColor(value) {
        return PROFILE_COLORS.filter(function (color) { return color.value === value; })[0];
    }
    function saveProfileColor(uuid, value) {
        var colors = profileColors();
        if (value) { colors[uuid] = value; } else { delete colors[uuid]; }
        try { window.localStorage.setItem(PROFILE_COLORS_KEY, JSON.stringify(colors)); } catch (error) { return false; }
        return true;
    }
    // A profile shows its initial on its colour: the override if there is one, else the Plex colour found in
    // its avatar URL, and the Plex avatar over that unless overridden. The stylesheet colours by data-color
    // name (Chromium M47 has no CSS variables); Plex colours are arbitrary hex, so each gets one small background rule.
    function decorateProfile(node, profile) {
        var uuid = String(profile && profile.uuid || "");
        var override = paletteColor(profileColor(uuid));
        if (profile) { node.setAttribute("data-initial", (profile.title || profile.username || "P").slice(0, 1).toUpperCase()); }
        if (override) { node.setAttribute("data-color", override.name.toLowerCase()); return; }
        plexColor(node, profile && profile.thumb);
        profileAvatar(node, profile);
    }
    var plexStyle = null;
    var plexColors = {};
    function plexColor(node, url) {
        var hex = avatarHex(url);
        if (hex) { plexHex(node, hex); }
    }
    // The Plex colour in an avatar URL, also behind a proxy host: .../avatars/<HEX>/<letter>/<n>.
    function avatarHex(url) {
        var found = /\/avatars\/([0-9A-Fa-f]{6})\/[0-9A-Fa-f]+\//.exec(typeof url === "string" ? url : "");
        return found ? found[1].toUpperCase() : "";
    }
    function plexHex(node, hex) {
        if (!document.head) { return; }
        if (!plexColors[hex]) {
            plexColors[hex] = true;
            if (!plexStyle) { plexStyle = document.head.appendChild(document.createElement("style")); }
            plexStyle.textContent += '.identity-choice[data-plex="' + hex + '"]::before,' +
                '.browse-header .account-control[data-plex="' + hex + '"]{background:#' + hex + '}';
        }
        node.setAttribute("data-plex", hex);
    }
    // A name wider than its box scrolls while the button is focused and rests otherwise. The travel
    // distance is measured, so the one shared keyframes rule is rewritten before the animation starts.
    // Only the name span moves, never the initial drawn beside it.
    var marqueeStyle = null;
    function marqueeOnFocus(node, name) {
        node.addEventListener("focus", function () {
            var overflow = name.scrollWidth - name.clientWidth;
            if (overflow <= 1 || !document.head) { return; }
            if (!marqueeStyle) { marqueeStyle = document.head.appendChild(document.createElement("style")); }
            var distance = "-" + (overflow + 8) + "px";
            marqueeStyle.textContent = "@keyframes profile-marquee{0%,15%{text-indent:0}45%,60%{text-indent:" +
                distance + "}90%,100%{text-indent:0}}";
            if (!/(^| )marquee( |$)/.test(name.className)) { name.className += " marquee"; }
        });
        node.addEventListener("blur", function () {
            name.className = name.className.replace(/ ?marquee/, "");
        });
    }
    // The profile list is remembered so the screen opens at once; plex.tv refreshes it behind.
    var PROFILES_KEY = "vemm-tizen-profiles";
    var profilesEditing = false;
    // plex.tv stamps a profile avatar URL with ?c=<last use>, which changes each time that profile is used; the stamp
    // is not part of the picture, so it must not make an unchanged profile list or cached photo look new. The stamped
    // URL is still the one fetched, so the browser never serves a stale photo for it.
    function stableThumb(thumb) {
        return typeof thumb === "string" ? thumb.replace(/([?&])c=\d+(&|$)/, function (match, lead, tail) { return tail ? lead : ""; }) : thumb;
    }
    function profilesJson(profiles) {
        return JSON.stringify(profiles, function (key, value) { return key === "thumb" ? stableThumb(value) : value; });
    }
    function slimProfiles(profiles) {
        return profiles.map(function (profile) {
            var slim = pick(profile, ["uuid", "title", "thumb", "protected", "admin"]);
            if (!slim.title && profile.username) { slim.title = profile.username; }
            return slim;
        });
    }
    function rememberedProfiles() {
        try {
            var saved = JSON.parse(window.localStorage.getItem(PROFILES_KEY));
            if (Array.isArray(saved) && saved.length) { return slimProfiles(saved); }
        } catch (error) { /* nothing remembered */ }
        return null;
    }
    function profileColorChoice(profile) {
        var uuid = String(profile.uuid || "");
        var values = [{ value: "", label: translate("Plex default"), literal: true }];
        PROFILE_COLORS.forEach(function (color) {
            values.push({ value: color.value, label: translate(color.name), literal: true, swatch: color.name.toLowerCase() });
        });
        settingsChoices(profile.title || profile.username || "Profile", values, function () { return profileColor(uuid); }, function (value) {
            if (saveProfileColor(uuid, value)) { backView(); }
        });
    }
    function openProfiles(warning, keepEditing) {
        profilesEditing = !!keepEditing;
        restoreView = function () { openProfiles("", profilesEditing); };
        retryView = restoreView;
        stopAuthorization();
        var generation = ++viewGeneration;
        clear(screen);
        page(translate("Who is watching?"), "profiles");
        var corner = group(screen, "", "profile-corner");
        button(corner, "Sign out", function () { confirmDialog("Sign out of Plex on this TV?", "Cancel", "Sign out", signOut); });
        var message = typeof warning === "string" ? warning : "";
        if (message) { screen.appendChild(element("p", "inline-error", message)); }
        var autoOpen = autoOpenPending && preferences.autoOpenProfile;
        autoOpenPending = false;
        var body = group(screen, "", "profile-body");
        var editButton = null;
        var drawn = rememberedProfiles();
        var drawnJson = drawn ? profilesJson(drawn) : "";
        function draw(profiles) {
            var kept = document.activeElement;
            var keptProfile = kept && kept.vemmProfile || null;
            var keptEdit = !!kept && kept === editButton;
            // Focus on Sign out, or anywhere else outside the lists, stays where it is.
            var focusLost = !(kept && screen.contains && screen.contains(kept)) || !!keptProfile || keptEdit;
            clear(body);
            var identities = group(body, "", "identity-list");
            var lastProfile = "";
            var lastChoice = null;
            try { lastProfile = window.localStorage.getItem(LAST_PROFILE_KEY) || ""; } catch (error) { lastProfile = ""; }
            var restored = null;
            profiles.forEach(function (profile) {
                if (profile.admin) { linkedProfile = profile; }
                var title = profile.title || "Profile";
                var identity = button(identities, "", function () {
                    if (profilesEditing) { profileColorChoice(profile); return; }
                    retryView = null;
                    // An unprotected profile goes straight to Home; only a PIN needs its own page.
                    if (!profile.protected) { enterHome(profile, accountClient.switchProfile(profile.uuid, "")); return; }
                    var selection = ++viewGeneration;
                    clear(screen);
                    page(profile.title || "Profile", "profile-pin");
                    var pin = element("input", "remote-input");
                    pin.type = "password";
                    pin.maxLength = 4;
                    pin.setAttribute("inputmode", "numeric");
                    pin.setAttribute("aria-label", translate("Profile PIN"));
                    screen.appendChild(pin);
                    function selectProfile() {
                        if (!/^[0-9]{4}$/.test(pin.value)) {
                            setStatus("Enter the four-digit profile PIN.", true);
                            return;
                        }
                        var request = ++selection;
                        var generation = viewGeneration;
                        setStatus("Switching profile...");
                        accountClient.switchProfile(profile.uuid, pin.value)
                            .then(function (token) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                enterHome(profile, Promise.resolve(token));
                            }).catch(function (error) {
                                pin.value = "";
                                if (generation !== viewGeneration || request !== selection) { return; }
                                if (error.status === 401 || error.status === 403) {
                                    accountClient.getProfiles().then(function () {
                                        if (generation === viewGeneration) {
                                            setStatus("Profile PIN refused. Check the PIN and retry.", true);
                                        }
                                    }).catch(function (sessionError) {
                                        if (generation === viewGeneration && !recoverSession(sessionError)) {
                                            setStatus(errorText(sessionError), true);
                                        }
                                    });
                                } else { setStatus(errorText(error), true); }
                            });
                    }
                    button(screen, "Use this profile", selectProfile);
                    button(screen, "Back to profiles", openProfiles);
                    focusFirst();
                }, true);
                // Only the name moves in the marquee; the initial and photo are drawn around it.
                var name = element("span", "profile-name", title);
                identity.appendChild(name);
                identity.className = "identity-choice";
                identity.vemmProfile = String(profile.uuid);
                if (profile.protected) { identity.setAttribute("data-protected", "true"); }
                decorateProfile(identity, profile);
                marqueeOnFocus(identity, name);
                if (lastProfile && profile.uuid === lastProfile) { lastChoice = identity; }
                if (keptProfile !== null && identity.vemmProfile === keptProfile) { restored = identity; }
            });
            var actions = group(body, "", "page-actions");
            editButton = button(actions, profilesEditing ? "Done" : "Edit profiles", function () {
                profilesEditing = !profilesEditing;
                editButton.textContent = translate(profilesEditing ? "Done" : "Edit profiles");
                setStatus(profilesEditing ? "Choose a profile to change its colour." : "");
            });
            if (keptEdit) { editButton.focus(); }
            else if (restored) { restored.focus(); }
            else if (focusLost) {
                if (pendingRestore) { focusFirst(); }
                else if (lastChoice) { lastChoice.focus(); }
                else { (identities.querySelector("button") || editButton).focus(); }
            }
        }
        // Choosing the last profile for the viewer: a PIN-protected one still asks for its PIN, and one that is gone leaves the list.
        function openLast() {
            if (!autoOpen) { return; }
            autoOpen = false;
            var wanted = "";
            try { wanted = window.localStorage.getItem(LAST_PROFILE_KEY) || ""; } catch (error) { wanted = ""; }
            Array.prototype.some.call(body.querySelectorAll(".identity-choice"), function (node) {
                if (!wanted || node.vemmProfile !== wanted) { return false; }
                node.click();
                return true;
            });
        }
        if (drawn) { draw(drawn); openLast(); }
        setStatus(drawn ? message : "Loading Plex Home profiles...", !!(drawn && message));
        accountClient.getProfiles().then(function (profiles) {
            if (generation !== viewGeneration) { return; }
            var fresh = slimProfiles(profiles);
            try { window.localStorage.setItem(PROFILES_KEY, JSON.stringify(fresh)); } catch (error) { /* only a convenience */ }
            if (profilesJson(fresh) !== drawnJson) {
                drawnJson = profilesJson(fresh);
                draw(fresh);
            }
            openLast();
            if (message) { setStatus(message, true); }
            else if (profilesEditing) { setStatus("Choose a profile to change its colour."); }
            else { setStatus(""); }
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            if (drawn) { setStatus(errorText(error), true); return; }
            var retry = button(body, "Retry profiles", openProfiles);
            button(body, "Use linked account", openServers);
            setStatus(errorText(error), true);
            retry.focus();
        });
    }

    // Home appears at once: the remembered one (or a skeleton) while the profile switch, server discovery
    // and connection happen behind it. switching resolves to the new account token, or null to keep the
    // current one. Until Home is loaded, presses on it only say "Connecting…"; Back leaves for the lists.
    function enterHome(profile, switching) {
        activeProfile = profile;
        try { window.localStorage.setItem(LAST_PROFILE_KEY, String(profile && profile.uuid || "")); }
        catch (error) { /* only a convenience */ }
        resetServerCaches();
        currentClient = null;
        currentServerId = "";
        usingRelay = false;
        navigation = [];
        var remembered = rememberedHome();
        if (remembered) { renderHome(remembered.sections, remembered.hubs); } else { renderHomeSkeleton(); }
        homePending = true;
        restoreView = function () { openProfiles(); };
        retryView = null;
        cancelServerConnection = function () { openProfiles(); };
        setStatus("Connecting…");
        var generation = viewGeneration;
        switching.then(function (token) {
            if (generation !== viewGeneration) { return; }
            if (token) { accountClient = window.PlexApi.createAccountClient({ token: token }); }
            openServers("", true);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            openProfiles(errorText(error));
        });
    }

    var HOME_PREFIX = "vemm-tizen-home-";
    var HOME_LIMIT = 300 * 1024;
    var HOME_ITEM_FIELDS = ["ratingKey", "type", "title", "grandparentTitle", "parentTitle", "parentIndex", "index", "year",
        "contentRating", "summary", "thumb", "art", "grandparentThumb", "grandparentArt", "parentThumb", "parentRatingKey",
        "viewCount", "viewOffset", "duration", "tag"];
    function homeKey(serverId) {
        var profile = activeProfile || linkedProfile;
        return HOME_PREFIX + String(profile && profile.uuid || "linked") + "-" + serverId;
    }
    // The shelves the viewer hid or reordered for this profile and server (Settings > Home).
    function homeRowsKey() {
        var profile = activeProfile || linkedProfile;
        return window.VemmHomeRows.key(profile && profile.uuid, currentServerId);
    }
    function pick(source, fields) {
        var out = {};
        fields.forEach(function (field) { if (source[field] !== undefined) { out[field] = source[field]; } });
        return out;
    }
    // The last Home for this profile and server, trimmed to what renderHome reads. Only a convenience.
    function rememberHome(sections, hubs) {
        if (!currentServerId) { return; }
        try {
            var json = JSON.stringify({
                sections: sections.map(function (section) { return pick(section, ["key", "type", "title"]); }),
                hubs: hubs.filter(function (hub) { return hub.Metadata && hub.Metadata.length; }).map(function (hub) {
                    var out = pick(hub, ["title", "hubIdentifier", "context", "librarySectionID"]);
                    out.Metadata = hub.Metadata.slice(0, 12).map(function (item) {
                        var trimmed = pick(item, HOME_ITEM_FIELDS);
                        if (typeof trimmed.summary === "string") { trimmed.summary = trimmed.summary.slice(0, 300); }
                        return trimmed;
                    });
                    return out;
                })
            });
            if (json.length <= HOME_LIMIT) { window.localStorage.setItem(homeKey(currentServerId), json); }
        } catch (error) { /* only a convenience */ }
    }
    // Also selects the remembered server, which Home's favorite libraries are keyed by.
    function rememberedHome() {
        try {
            var id = window.localStorage.getItem(lastServerKey());
            var saved = id && JSON.parse(window.localStorage.getItem(homeKey(id)));
            if (saved && Array.isArray(saved.sections) && Array.isArray(saved.hubs)) {
                currentServerId = id;
                return saved;
            }
        } catch (error) { /* no remembered Home */ }
        return null;
    }
    // Also forgets the remembered profile list, which belongs to the signed-in account.
    // The last account audio/subtitle preferences per profile, so the Settings page can draw before plex.tv answers.
    var ACCOUNT_AUDIO_PREFIX = "vemm-tizen-account-audio-";
    function accountAudioKey() {
        var profile = activeProfile || linkedProfile;
        return ACCOUNT_AUDIO_PREFIX + String(profile && profile.uuid || "linked");
    }
    function readAccountAudioCache() {
        try {
            var value = JSON.parse(window.localStorage.getItem(accountAudioKey()));
            return value && typeof value === "object" && typeof value.subtitleMode === "number" && typeof value.subtitleForced === "number" ? value : null;
        } catch (error) { return null; }
    }
    function writeAccountAudioCache(value) {
        try { window.localStorage.setItem(accountAudioKey(), JSON.stringify(value)); } catch (error) { /* only a convenience */ }
    }

    function forgetRememberedHome() {
        try {
            window.localStorage.removeItem(PROFILES_KEY);
            window.localStorage.removeItem(AVATARS_KEY);
            for (var i = window.localStorage.length - 1; i >= 0; i -= 1) {
                var key = window.localStorage.key(i);
                if (key && (key.indexOf(HOME_PREFIX) === 0 || key.indexOf(ACCOUNT_AUDIO_PREFIX) === 0 || key.indexOf(LISTING_PREFIX) === 0)) { window.localStorage.removeItem(key); }
            }
        } catch (error) { return false; }
        return true;
    }

    function signOut() {
        var storageError = false;
        if (window.VemmSession) {
            try { window.VemmSession.forget(window.localStorage); }
            catch (error) { storageError = true; }
        }
        if (window.VemmRecents && !window.VemmRecents.reset(window.localStorage)) { storageError = true; }
        if (!forgetRememberedHome()) { storageError = true; }
        stopAuthorization();
        accountToken = "";
        accountClient = null;
        accountAudio = { client: null, state: "idle", value: null, error: null };
        activeProfile = null;
        linkedProfile = null;
        servers = [];
        resetServerCaches();
        dropSavedArtwork();
        if (artworkStore && preferences.saveHomeArtwork) { artworkStore.clear(); }
        currentClient = null;
        currentServerId = "";
        currentItems = [];
        currentSection = null;
        usingRelay = false;
        navigation = [];
        restoreView = null;
        addConnectForm("");
        if (storageError) { setStatus("The saved session could not be deleted. Clear this app's data on the TV before leaving it unattended.", true); }
        return !storageError;
    }

    var cancelServerConnection = null;
    function serverAvailable(server) { return !!server.token && server.connections.length > 0; }
    function lastServerKey() {
        var profile = activeProfile || linkedProfile;
        return "vemm-tizen-last-server-" + String(profile && profile.uuid || "linked");
    }
    function rememberServer(id) {
        try { window.localStorage.setItem(lastServerKey(), id); } catch (error) { /* only a convenience */ }
    }
    // The one available server, else the remembered one if it is still available, else null.
    function automaticServer() {
        var available = servers.filter(serverAvailable);
        if (available.length === 1) { return available[0]; }
        var last = null;
        try { last = window.localStorage.getItem(lastServerKey()); } catch (error) { last = null; }
        return available.filter(function (server) { return server.id === last; })[0] || null;
    }

    // serverList is null when the connection is automatic; a failure then shows the server list.
    function connectToServer(server, serverList) {
        var selection = ++viewGeneration;
        currentClient = null;
        if (serverList) {
            Array.prototype.forEach.call(serverList.querySelectorAll(".server-choice"), function (choice) {
                choice.disabled = true;
            });
        }
        // An automatic connection shows nothing until Home renders; Back still returns to the list.
        var cancelButton = null;
        if (serverList) {
            cancelButton = button(screen, "Cancel connection", function () {
                if (selection !== viewGeneration) { return; }
                openServers();
            });
            cancelButton.focus();
            setStatus("Connecting securely; trying relay if needed...");
        }
        cancelServerConnection = function () { if (selection === viewGeneration) { openServers(); } };
        viewCleanup = function () { cancelServerConnection = null; };
        window.PlexApi.selectServer(server, { onAttempt: function (attempt) {
            if (selection !== viewGeneration || !serverList) { return; }
            setStatus(translate("Trying secure connection {index} of {total} ({kind})…", {
                index: attempt.index, total: attempt.total,
                kind: translate(attempt.relay ? "Relay" : "Direct")
            }));
        }, onClient: function (client) {
            if (selection !== viewGeneration) { return false; }
            viewClients.push(client);
            return true;
        } }).then(function (selected) {
            if (selection !== viewGeneration) { return; }
            cancelServerConnection = null;
            resetServerCaches();
            currentClient = selected.client;
            currentClient.serverId = server.id;
            currentServerId = server.id;
            rememberServer(server.id);
            usingRelay = selected.relay;
            if (needsFavoritesOnboarding()) { openFavorites(true); } else { loadHome(false); }
        }).catch(function (error) {
            if (selection !== viewGeneration) { return; }
            cancelServerConnection = null;
            if (recoverSession(error)) { return; }
            if (!serverList) { openServers(errorText(error)); return; }
            if (cancelButton.parentNode) { cancelButton.parentNode.removeChild(cancelButton); }
            Array.prototype.forEach.call(serverList.querySelectorAll(".server-choice"), function (choice, index) {
                choice.disabled = !serverAvailable(servers[index]);
            });
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function openServers(warning, automatic) {
        restoreView = function () { openServers(); };
        retryView = restoreView;
        cancelServerConnection = null;
        var generation = ++viewGeneration;
        var shown = false;
        // An automatic connection draws the page only if it has to: no choice, or a failure.
        function showPage() {
            if (shown) { return; }
            shown = true;
            cancelServerConnection = null;
            currentServerId = "";
            clear(screen);
            page(translate("Choose a server"), "servers");
            if (typeof warning === "string" && warning) { screen.appendChild(element("p", "inline-error", warning)); }
            setStatus("Discovering your Plex Media Servers...");
        }
        if (automatic) { cancelServerConnection = function () { openServers(); }; } else { showPage(); }
        accountClient.getServers().then(function (result) {
            if (generation !== viewGeneration) { return; }
            servers = result;
            var automaticChoice = automatic ? automaticServer() : null;
            if (automaticChoice) { connectToServer(automaticChoice, null); return; }
            showPage();
            if (!servers.length) {
                screen.appendChild(element("p", "empty-state", translate("No Plex servers are shared with this identity.")));
            }
            var serverList = group(screen, "", "server-list");
            servers.forEach(function (server) {
                var unavailable = !serverAvailable(server);
                var relayOnly = server.connections.length && server.connections.every(function (connection) {
                    return connection.relay === true;
                });
                var serverButton = button(serverList, translate("{server} ({ownership}){availability}", { server: server.name,
                    ownership: translate(server.owned ? "owned" : "shared"),
                    availability: unavailable ? translate(" — unavailable") : relayOnly ? translate(" — relay") : "" }), function () {
                    connectToServer(server, serverList);
                }, true);
                serverButton.disabled = unavailable;
                serverButton.className += " server-choice";
            });
            var actions = group(screen, "", "page-actions");
            button(actions, "Change profile", function () {
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                openProfiles();
            });
            button(actions, "Refresh servers", openServers);
            button(actions, "Settings", function () {
                restoreView = openServers;
                visit(openSettings);
            });
            button(actions, "Sign out", signOut);
            setStatus("Owned and shared servers use their own access grants. Only secure advertised origins are tried.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            showPage();
            button(screen, "Retry discovery", openServers);
            button(screen, "Settings", function () {
                restoreView = openServers;
                visit(openSettings);
            });
            button(screen, "Sign out", signOut);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function beginAuthorization(info, keepStatus) {
        stopAuthorization();
        accountToken = "";
        var generation = authGeneration;
        clear(info);
        info.appendChild(element("p", "auth-wait", translate("Getting a sign-in code…")));
        if (!keepStatus) { setStatus(""); }
        try {
            authClient = window.PlexApi.createAuthClient();
        } catch (error) {
            info.textContent = errorText(error);
            setStatus(errorText(error), true);
            return;
        }
        authClient.startAuthorization().then(function (pin) {
            if (generation !== authGeneration) {
                return;
            }
            authPin = pin;
            if (typeof pin.expiresAt === "number" && isFinite(pin.expiresAt)) {
                authExpiryTimer = setTimeout(function () {
                    if (generation === authGeneration) { beginAuthorization(info); }
                }, Math.max(0, pin.expiresAt - Date.now()));
            }
            clear(info);
            info.appendChild(element("p", "auth-step", translate("On your phone or computer, go to")));
            info.appendChild(element("p", "auth-url", "plex.tv/link"));
            var plate = element("div", "auth-plate");
            if (pin.qr) {
                var qr = element("img", "auth-qr");
                qr.alt = translate("Scan to sign in");
                qr.width = 360;
                qr.height = 360;
                qr.onerror = function () {
                    if (plate.parentNode) { plate.parentNode.removeChild(plate); }
                };
                qr.src = pin.qr;
                plate.appendChild(qr);
                info.appendChild(plate);
            }
            info.appendChild(element("p", "auth-step", translate("and enter this code")));
            info.appendChild(element("strong", "auth-code", pin.code));
            var waiting = element("p", "auth-wait", translate("Waiting for you to sign in…"));
            info.appendChild(waiting);
            pollAuthorization(generation, waiting);
        }).catch(function () {
            if (generation !== authGeneration) {
                return;
            }
            info.textContent = translate("Could not reach Plex. Retrying in a few seconds…");
            setStatus(info.textContent, true);
            authTimer = setTimeout(function () {
                if (generation === authGeneration) { beginAuthorization(info); }
            }, 5000);
        });
    }

    function addConnectForm(message) {
        retryView = null;
        stopAuthorization();
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        currentClient = null;
        currentSection = null;
        screen.className = "screen screen-signin";
        var section = element("section", "connect-panel");
        section.appendChild(element("h2", "auth-title", translate("Sign in to Plex")));

        var authInfo = element("div", "auth-info");
        section.appendChild(authInfo);

        var actions = element("div", "auth-actions");
        var signIn = element("button", "secondary-button", translate("Get a new code"));
        signIn.type = "button";
        signIn.addEventListener("click", function () { beginAuthorization(authInfo); });
        actions.appendChild(signIn);
        var advancedToggle = element("button", "secondary-button", translate("Connect to a server directly"));
        advancedToggle.type = "button";
        actions.appendChild(advancedToggle);
        section.appendChild(actions);

        var advanced = element("div", "advanced-panel");
        advanced.hidden = true;
        var form = element("form", "connect-form");
        var serverLabel = element("label", "", translate("Server URL"));
        var serverInput = element("input", "remote-input");
        serverInput.type = "url";
        serverInput.name = "server";
        serverInput.placeholder = "https://server.example.invalid:32400";
        serverInput.autocomplete = "url";
        serverLabel.appendChild(serverInput);

        var tokenLabel = element("label", "", translate("Server access token"));
        var tokenInput = element("input", "remote-input");
        tokenInput.type = "password";
        tokenInput.name = "token";
        tokenInput.autocomplete = "off";
        tokenLabel.appendChild(tokenInput);

        var submit = element("button", "primary-button", translate("Connect"));
        submit.type = "submit";
        form.appendChild(serverLabel);
        form.appendChild(tokenLabel);
        form.appendChild(submit);
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            connect(serverInput.value, tokenInput.value);
        });
        advanced.appendChild(form);
        if (window.VemmSession) { button(advanced, "Delete saved sign-in", signOut); }
        section.appendChild(advanced);
        advancedToggle.addEventListener("click", function () {
            advanced.hidden = !advanced.hidden;
            if (!advanced.hidden) { serverInput.focus(); }
        });
        if (message) {
            section.appendChild(element("p", "inline-error", message));
        }
        screen.appendChild(section);
        beginAuthorization(authInfo, true);
        focusFirst();
    }

    function connect(serverUrl, token) {
        stopAuthorization();
        setStatus("Connecting…");
        try {
            currentServerId = "";
            resetServerCaches();
            currentClient = window.PlexApi.createClient({
                baseUrl: serverUrl,
                token: token
            });
        } catch (error) {
            addConnectForm(errorText(error));
            setStatus(errorText(error), true);
            return;
        }

        loadHome(true);
    }

    // The full metadata and start point a card's Play opens (a show plays its next episode).
    function cardTarget(item, client, resume) {
        return window.VemmItemMenu.playTarget(item, client).then(function (target) {
            return client.getMetadata(target.ratingKey);
        }).then(function (metadata) {
            return metadata ? { item: metadata, offset: resume ? metadata.viewOffset || 0 : 0 } : null;
        });
    }

    function playFromCard(item, client, resume) {
        setStatus("Loading details...");
        var generation = viewGeneration;
        cardTarget(item, client, resume).then(function (target) {
            if (!target || generation !== viewGeneration || player) { return; }
            startPlayer(target.item, client, target.offset);
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        });
    }

    // The LG card hold menu: long-press OK (or the Tools/Info key) on a card. Every write still
    // goes through the explicit confirmation screen.
    function openItemMenu(node) {
        var info = node && node.vemmCard;
        if (!info || !window.VemmItemMenu || homePending) { return false; }
        var rows = window.VemmItemMenu.rows(info.item, {
            deck: !!info.options.deck, continueAction: preferences.continueAction
        });
        if (!rows.length) { return false; }
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.appendChild(element("h2", "", info.item.title || translate("Selected item")));
        var item = info.item;
        var client = info.client;
        function close() {
            if (menu.parentNode) { menu.parentNode.removeChild(menu); }
        }
        rows.forEach(function (row) {
            button(menu, row.label, function () {
                close();
                if (row.id === "play" || row.id === "start") {
                    playFromCard(item, client, row.id === "play");
                } else if (row.id === "details") {
                    visit(function () { openDetail(item.ratingKey, client); });
                } else if (row.id === "show") {
                    visit(function () { openDetail(item.grandparentRatingKey, client); });
                } else if (row.id === "season") {
                    visit(function () { openDetail(item.parentRatingKey, client); });
                } else {
                    confirmWatchAction(item, client, row.id);
                }
            });
        });
        button(menu, "Cancel", function () { close(); node.focus(); });
        screen.appendChild(menu);
        menu.querySelector("button").focus();
        return true;
    }

    function favoriteKeys() {
        if (!currentServerId || !window.VemmFavorites) { return null; }
        try { return window.VemmFavorites.load(window.localStorage, currentServerId); }
        catch (error) { return null; }
    }

    function needsFavoritesOnboarding() {
        if (!currentServerId || !window.VemmFavorites) { return false; }
        try { return window.VemmFavorites.load(window.localStorage, currentServerId) === null; }
        catch (error) { return false; }
    }

    // LG's onboarding "Favorite libraries" step: choose which libraries Home shows for this
    // server. Shown once per server after selection; Settings reopens it as an editor. Nothing
    // is written to Plex; the choice is stored on this TV only.
    function openFavorites(firstRun) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = function () { openFavorites(firstRun); };
        retryView = restoreView;
        page(translate("Favorite libraries"), "favorites");
        setStatus("Loading libraries...");
        currentClient.getSections().then(function (sections) {
            if (generation !== viewGeneration) { return; }
            sections = sections.filter(function (section) {
                return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
            });
            if (!sections.length) {
                screen.appendChild(element("p", "empty-state", translate("No available libraries.")));
                button(screen, "Back", backView); setStatus("No available libraries."); focusFirst(); return;
            }
            var saved = favoriteKeys();
            var all = sections.map(function (section) { return String(section.key); });
            var chosen = (saved || all).filter(function (key) { return all.indexOf(key) !== -1; });
            if (!chosen.length) { chosen = all.slice(); }
            var initial = chosen.slice().sort().join(",");
            screen.appendChild(element("p", "help-text", translate(firstRun ?
                "Choose the libraries Home shows. You can change this later in Settings." :
                "Choose the libraries Home shows on this server.")));
            var done;
            function refreshDone() {
                if (!done) { return; }
                done.disabled = !firstRun && chosen.slice().sort().join(",") === initial;
            }
            var choices = group(screen, "", "selection-list");
            sections.forEach(function (section) {
                var key = String(section.key);
                var toggle = button(choices, "", function () {
                    var index = chosen.indexOf(key);
                    if (index !== -1) {
                        if (chosen.length === 1) { setStatus("Keep at least one library.", true); return; }
                        chosen.splice(index, 1);
                    } else { chosen.push(key); }
                    paint();
                    refreshDone();
                });
                function paint() {
                    toggle.textContent = (chosen.indexOf(key) !== -1 ? "[x] " : "[ ] ") + (section.title || key);
                    toggle.setAttribute("aria-pressed", chosen.indexOf(key) !== -1 ? "true" : "false");
                }
                paint();
            });
            done = button(screen, firstRun ? "Start watching" : "Done", function () {
                try {
                    window.VemmFavorites.save(window.localStorage, currentServerId, chosen);
                } catch (error) { setStatus(error.message === "Keep at least one library." ? errorText(error) :
                    "Could not save favorite libraries. Check app storage permissions.", true); return; }
                navigation.length = 0;
                restoreView = null;
                loadHome(false);
            });
            refreshDone();
            button(screen, firstRun ? "Skip for now" : "Back", function () {
                if (firstRun) { navigation.length = 0; restoreView = null; loadHome(false); }
                else { backView(); }
            });
            setStatus(firstRun ? "Nothing is saved until you choose Start watching." : "Toggle libraries, then choose Done.");
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (recoverSession(error)) { return; }
            if (firstRun) { loadHome(false); return; }
            setStatus(errorText(error), true);
            button(screen, "Back", backView);
            focusFirst();
        });
    }

    function loadHome(showConnectOnError) {
        restoreView = function () { loadHome(showConnectOnError); };
        retryView = restoreView;
        var generation = ++viewGeneration;
        cancelViewRequests();
        itemsLoading = false;
        // Home for this server is shown from memory at once and refreshed in the background.
        var pending = homePending;
        var cached = homeCache && homeCache.client === currentClient ? homeCache : null;
        if (cached) {
            renderHome(cached.sections, cached.hubs);
            generation = viewGeneration;
        } else if (!pending) { setStatus("Loading..."); }
        Promise.all([
            currentClient.getSections(),
            currentClient.getHomeHubs()
        ]).then(function (result) {
            if (generation !== viewGeneration) { return; }
            var data = JSON.stringify(result);
            if (cached && cached.data === data) { return; }
            homeCache = { client: currentClient, data: data, sections: result[0], hubs: result[1] };
            rememberHome(result[0], result[1]);
            if (!cached && !pending) { renderHome(result[0], result[1]); return; }
            // Keep the viewer's place through the re-render.
            var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
            var place = { focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop };
            var className = screen.className;
            var y = homeY;
            pendingRestore = place;
            renderHome(result[0], result[1]);
            screen.className = className;
            if (y) { moveHome(y); }
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            if (accountClient && recoverSession(error)) { return; }
            if (cached) { setStatus(errorText(error), true); return; }
            if (pending) { currentClient = null; openServers(errorText(error)); return; }
            if (showConnectOnError) {
                currentClient = null;
                addConnectForm(errorText(error));
            }
            setStatus(errorText(error), true);
            if (!document.getElementById("home-retry")) {
                button(screen, "Retry", function () { loadHome(showConnectOnError); }).id = "home-retry";
            }
            focusFirst();
        });
    }

    function renderHome(sections, hubs) {
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        resetImages();
        restoreView = function () { loadHome(false); };
        currentSection = null;
        homeSections = sections;
        screen.className = "screen screen-home";
        browseHeader(null);
        homeY = 0;
        homeFinish = null;
        // The track is built detached and attached once, so nothing is laid out until the one focus() below.
        var track = element("div", "home-track");
        var homeTitle = element("h2", "page-title home-title", translate("Home"));
        track.appendChild(homeTitle);
        var favorites = favoriteKeys();
        var browsable = sections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        var visibleHubs = hubs.filter(function (hub) {
            return hub.Metadata && hub.Metadata.length && (hub.librarySectionID === undefined ||
                sections.some(function (section) { return String(section.key) === String(hub.librarySectionID); }));
        }).filter(function (hub) {
            return !favorites || hub.librarySectionID === undefined ||
                favorites.indexOf(String(hub.librarySectionID)) !== -1;
        });
        if (window.VemmHomeRows && currentServerId) {
            visibleHubs = window.VemmHomeRows.visible(visibleHubs, window.VemmHomeRows.load(window.localStorage, homeRowsKey()));
        }
        var features = window.VemmHomeHero.pick(visibleHubs, 8);
        if (features.length) {
            var featuredIndex = 0;
            var featured = features[0];
            var hero = element("section", "home-hero");
            var art = element("img", "home-hero-art");
            art.alt = "";
            hero.appendChild(art);
            hero.appendChild(element("div", "home-hero-scrim"));
            var copy = element("div", "home-hero-copy");
            var title = element("h3", "home-hero-title");
            var meta = element("p", "home-hero-meta");
            var description = element("p", "home-hero-description");
            copy.appendChild(title);
            copy.appendChild(meta);
            copy.appendChild(description);
            var actions = element("div", "home-feature-actions");
            var primary = button(actions, "", function () {
                if (["movie", "episode", "clip"].indexOf(featured.type) !== -1) {
                    playFromCard(featured, currentClient, true);
                } else { visit(function () { openDetail(featured.ratingKey, currentClient); }); }
            }, true, "play");
            primary.className += " home-feature-primary";
            var info = button(actions, "Open details", function () {
                visit(function () { openDetail(featured.ratingKey, currentClient); });
            }, false, "info");
            info.className += " round-control";
            info.setAttribute("aria-label", translate("Open details"));
            if (features.length > 1) {
                var next = button(actions, "Next featured title", function () { stepFeature(1); }, false, "next");
                next.className += " round-control";
                next.setAttribute("aria-label", translate("Next featured title"));
            }
            copy.appendChild(actions);
            hero.appendChild(copy);
            var dots = element("div", "home-feature-dots");
            dots.setAttribute("aria-hidden", "true");
            features.forEach(function () { dots.appendChild(element("span", "feature-dot")); });
            hero.appendChild(dots);
            function updateFeature() {
                clearGraphics();
                featured = features[featuredIndex];
                title.textContent = featured.grandparentTitle || featured.title;
                meta.textContent = [translate(featured.type === "episode" || featured.type === "show" ? "TV Shows" : "Movie"),
                    featured.year, featured.contentRating].filter(Boolean).join(" · ");
                description.textContent = featured.summary || "";
                primary.textContent = translate(["movie", "episode", "clip"].indexOf(featured.type) !== -1 ?
                    featured.viewOffset ? "Continue" : "Play" : "Open details");
                var nextArt = element("img", "home-hero-art");
                nextArt.alt = "";
                hero.replaceChild(nextArt, art);
                art = nextArt;
                var loadedArt = nextArt;
                queueImage(art, currentClient, featured.art || featured.grandparentArt || featured.thumb,
                    { width: 1280, height: 720 }, 4 * 1024 * 1024, function () { presentBackdrop(loadedArt); }, true, "home");
                Array.prototype.forEach.call(dots.children, function (dot, index) {
                    dot.className = "feature-dot" + (index === featuredIndex ? " selected" : "");
                });
            }
            updateFeature();
            if (features.length > 1) {
                stepFeature = function (step) {
                    featuredIndex = (featuredIndex + step + features.length) % features.length;
                    updateFeature();
                };
            }
            track.appendChild(hero);
        }

        if (!browsable.length) {
            var sectionPanel = element("section", "content-panel");
            addSectionHeading(sectionPanel, translate("Libraries"));
            sectionPanel.appendChild(element("p", "empty-state", translate("No libraries were returned by this server.")));
            track.appendChild(sectionPanel);
        }

        var hubPanel = element("section", "content-panel home-shelves");
        hubPanel.setAttribute("aria-label", translate("Plex shelves"));
        if (!visibleHubs.length) {
            hubPanel.appendChild(element("p", "empty-state", translate("No Home shelves were returned.")));
        }
        var shelvesDrawn = 0;
        function drawShelves(upTo) {
            for (; shelvesDrawn < upTo && shelvesDrawn < visibleHubs.length; shelvesDrawn += 1) {
                drawShelf(hubPanel, visibleHubs[shelvesDrawn]);
            }
        }
        // Without a place to restore, only the first shelves are drawn now; the rest follow the first paint.
        var generation = viewGeneration;
        drawShelves(pendingRestore ? visibleHubs.length : HOME_FIRST_SHELVES);
        track.appendChild(hubPanel);
        screen.appendChild(track);
        setStatus(usingRelay ? "Connected through Plex relay (bandwidth limited)." : "");
        focusHome();
        if (shelvesDrawn < visibleHubs.length) {
            var finish = function () {
                if (homeFinish !== finish) { return; }
                homeFinish = null;
                if (generation !== viewGeneration) { return; }
                drawShelves(visibleHubs.length);
            };
            homeFinish = finish;
            afterPaint(finish);
        }
    }

    function drawShelf(panel, hub) {
        var deck = !!(window.VemmItemMenu && window.VemmItemMenu.isDeckHub(hub));
        var hubSection = element("section", "shelf");
        hubSection.appendChild(element("h3", "hub-title", hub.title || "Plex shelf"));
        var row = element("div", "shelf-row");
        hubSection.appendChild(row);
        var metadata = Array.isArray(hub.Metadata) ? hub.Metadata : [];
        metadata.slice(0, 12).forEach(function (item) {
            if (item.ratingKey) { card(row, item, currentClient, null, { deck: deck, shelf: true }); }
        });
        panel.appendChild(hubSection);
    }

    // Home draws its hero and first shelves at once and the rest after the first paint; Down finishes them first.
    var HOME_FIRST_SHELVES = 2;
    var homeFinish = null;
    function afterPaint(callback) {
        if (window.requestAnimationFrame) { window.requestAnimationFrame(function () { setTimeout(callback, 0); }); }
        else { setTimeout(callback, 0); }
    }

    function focusHome() {
        // One focus() call (each forces a style and layout pass): straight to the navigation unless a place is restored.
        var restoring = !!pendingRestore;
        var start = !restoring && screen.querySelector(".home-navigation button");
        if (start) { start.focus(); }
        else {
            focusFirst();
            if (!restoring && document.activeElement === screen.querySelector(".account-control")) {
                screen.querySelector(".home-navigation button").focus();
            }
        }
        armFeatureTimer();
    }

    // Home's frame with blank placeholders, shown while there is nothing remembered to draw.
    function renderHomeSkeleton() {
        viewGeneration += 1;
        itemsLoading = false;
        clear(screen);
        resetImages();
        currentSection = null;
        homeSections = [];
        screen.className = "screen screen-home";
        browseHeader(null);
        homeY = 0;
        var track = element("div", "home-track");
        screen.appendChild(track);
        track.appendChild(element("h2", "page-title home-title", translate("Home")));
        track.appendChild(element("section", "home-hero"));
        var shelves = element("section", "content-panel home-shelves");
        for (var i = 0; i < 3; i += 1) {
            var shelf = element("section", "shelf skeleton-shelf");
            shelf.appendChild(element("div", "skeleton-title"));
            var row = element("div", "shelf-row");
            for (var j = 0; j < 7; j += 1) { row.appendChild(element("div", "skeleton-card")); }
            shelf.appendChild(row);
            shelves.appendChild(shelf);
        }
        track.appendChild(shelves);
        focusHome();
    }

    function browseHeader(selected) {
        setDetailMode(true);
        var header = element("header", "browse-header");
        var account = button(header, "Account", function () {
            var utilities = screen.querySelector(".home-utilities");
            utilities.hidden = !utilities.hidden;
            if (!utilities.hidden) { utilities.querySelector("button").focus(); }
        }, false, "profile");
        account.className += " account-control round-control";
        account.setAttribute("aria-label", translate("Account"));
        var profile = activeProfile || linkedProfile;
        // Always the profile's own badge; with no profile (a manual server) the stylesheet draws a person icon.
        if (profile) { decorateProfile(account, profile); }
        var nav = element("nav", "home-navigation");
        nav.setAttribute("aria-label", translate("Home"));
        var home = button(nav, "Home", function () { navigation = []; loadHome(false); }, false, "home");
        if (!selected) { home.setAttribute("aria-current", "page"); }
        var favorites = favoriteKeys();
        var browsable = homeSections.filter(function (section) {
            return ["movie", "show", "artist", "photo"].indexOf(section.type) !== -1;
        });
        (window.VemmFavorites ? window.VemmFavorites.filter(browsable, favorites) : browsable).forEach(function (section) {
            var choice = button(nav, section.title || "Untitled library", function () {
                visit(function () { openSection(section); });
            }, true, "library");
            choice.className += " library-button";
            if (selected && String(selected.key) === String(section.key)) { choice.setAttribute("aria-current", "page"); }
        });
        button(nav, "Playlists", function () { visit(openPlaylists); });
        button(nav, "Search", function () { visit(openSearch); });
        header.appendChild(nav);
        screen.appendChild(header);
        var utilities = element("div", "home-utilities");
        button(utilities, "Settings", function () { visit(openSettings); }, false, "settings");
        button(utilities, "Refresh", function () {
            if (selected) { openSection(selected); } else { loadHome(false); }
        }, false, "refresh");
        button(utilities, "Live TV and DVR", function () { visit(openTelevision); }, false, "television");
        if (accountClient) { button(utilities, "Watchlist", function () { visit(function () { catalogueUi().watchlist(); }); }, false, "bookmark"); }
        if (accountClient) { button(utilities, "Discover", function () { visit(function () { catalogueUi().search(); }); }, false, "search"); }
        button(utilities, "Change profile", function () {
            accountClient = window.PlexApi.createAccountClient({ token: accountToken });
            openProfiles();
        }, false, "profile");
        button(utilities, "Change server", function () {
            currentClient = null;
            currentServerId = "";
            resetServerCaches();
            if (accountClient) { openServers(); } else { addConnectForm(""); }
        }, false, "server");
        utilities.hidden = true;
        screen.appendChild(utilities);
    }

    // Profile avatars come from plex.tv through redirects. A plain XHR (no custom headers, so no CORS preflight) follows them and
    // exposes the final URL, whose /avatars/<HEX>/ is the profile colour. The small PNG is kept as a data URL per profile, so the
    // next start shows it at once; a background load replaces it only when it changed. If the XHR fails, a plain <img> is used.
    var AVATARS_KEY = "vemm-tizen-profile-avatars";
    var AVATAR_BYTES = 64 * 1024;
    var AVATAR_PROFILES = 20;
    var avatarRefreshed = {};
    function cachedAvatars() {
        try {
            var saved = JSON.parse(window.localStorage.getItem(AVATARS_KEY));
            if (saved && typeof saved === "object" && !Array.isArray(saved)) { return saved; }
        } catch (error) { /* nothing cached */ }
        return {};
    }
    function cacheAvatar(uuid, entry) {
        if (!uuid || entry.dataUrl.length > AVATAR_BYTES) { return; }
        var saved = cachedAvatars();
        delete saved[uuid];
        saved[uuid] = entry;
        Object.keys(saved).slice(0, Math.max(0, Object.keys(saved).length - AVATAR_PROFILES)).forEach(function (old) { delete saved[old]; });
        try { window.localStorage.setItem(AVATARS_KEY, JSON.stringify(saved)); } catch (error) { /* only a convenience */ }
    }
    // done({ dataUrl, hex }) or done(null) on any failure.
    function loadAvatar(thumb, done) {
        var finished = false;
        function finish(result) { if (!finished) { finished = true; done(result); } }
        try {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", thumb);
            xhr.responseType = "blob";
            xhr.timeout = 10000;
            xhr.onerror = xhr.ontimeout = xhr.onabort = function () { finish(null); };
            xhr.onload = function () {
                var blob = xhr.response;
                if (xhr.status < 200 || xhr.status >= 300 || !blob || !blob.size || blob.size > AVATAR_BYTES || !window.FileReader) {
                    finish(null);
                    return;
                }
                var reader = new window.FileReader();
                reader.onload = function () {
                    finish(typeof reader.result === "string" ? { dataUrl: reader.result, hex: avatarHex(xhr.responseURL) || avatarHex(thumb) } : null);
                };
                reader.onerror = function () { finish(null); };
                reader.readAsDataURL(blob);
            };
            xhr.send();
        } catch (error) { finish(null); }
    }
    // The initial shows until the picture loads and again if it fails.
    function profileAvatar(parent, profile) {
        var thumb = profile && profile.thumb;
        if (typeof thumb !== "string" || thumb.indexOf("https://plex.tv/") !== 0) { return; }
        var uuid = String(profile.uuid || "");
        var cached = cachedAvatars()[uuid];
        if (!cached || stableThumb(cached.thumb) !== stableThumb(thumb) || typeof cached.dataUrl !== "string") { cached = null; }
        var image = null;
        function show(source, hex) {
            if (!image) {
                image = element("img", "profile-avatar");
                image.alt = "";
                parent.setAttribute("data-photo", "true");
                image.onload = function () {
                    parent.setAttribute("data-avatar", "true");
                    if (!parent.getAttribute("data-plex")) { plexColor(parent, image.currentSrc); }
                };
                image.onerror = function () {
                    if (image.parentNode === parent) { parent.removeChild(image); }
                    parent.removeAttribute("data-photo");
                };
                parent.appendChild(image);
            }
            if (hex) { plexHex(parent, hex); }
            if (image.getAttribute("src") !== source) { image.src = source; }
        }
        if (cached) {
            show(cached.dataUrl, cached.hex);
            if (avatarRefreshed[uuid + thumb]) { return; }
        }
        avatarRefreshed[uuid + thumb] = true;
        loadAvatar(thumb, function (loaded) {
            if (!loaded) {
                if (!cached) { show(thumb, ""); }
                return;
            }
            if (cached && loaded.dataUrl === cached.dataUrl && (loaded.hex || "") === (cached.hex || "")) { return; }
            cacheAvatar(uuid, { thumb: thumb, dataUrl: loaded.dataUrl, hex: loaded.hex });
            show(loaded.dataUrl, loaded.hex);
        });
    }

    // The title list of a library view, remembered by profile, server, section, sort and filters. Only a convenience:
    // it is drawn at once on the next visit, then replaced by what the server says.
    var LISTING_PREFIX = "vemm-tizen-listing-";
    var LISTING_INDEX = LISTING_PREFIX + "index";
    var LISTING_LIMIT = 400 * 1024;
    var LISTING_TOTAL = 2 * 1024 * 1024;
    var LISTING_COUNT = 12;
    var LISTING_ITEMS = 300;
    var LISTING_MAX = 2000;
    var LISTING_FIELDS = ["ratingKey", "type", "title", "year", "thumb", "art", "originallyAvailableAt", "rating", "ratingImage",
        "audienceRating", "audienceRatingImage", "duration", "addedAt", "lastViewedAt", "viewCount", "unviewedLeafCount", "leafCount"];
    var currentBase = 0;
    var currentTotal = 0;
    var artTimer = null;

    function listingKey(section) {
        var serverId = currentClient && currentClient.serverId || currentServerId;
        if (!serverId) { return null; }
        var profile = activeProfile || linkedProfile;
        var text = JSON.stringify(Object.keys(libraryFilters).sort().map(function (name) { return [name, libraryFilters[name]]; }));
        var hash = 5381;
        for (var i = 0; i < text.length; i += 1) { hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0; }
        return LISTING_PREFIX + String(profile && profile.uuid || "linked") + "-" + serverId + "-" + section.key + "-" + hash.toString(36);
    }

    function trimListingItem(item) {
        var out = pick(item, LISTING_FIELDS);
        if (item.Media && item.Media[0]) { out.Media = [pick(item.Media[0], ["videoResolution", "height", "bitrate"])]; }
        return out;
    }

    function listingIndex() {
        try {
            var index = JSON.parse(window.localStorage.getItem(LISTING_INDEX));
            return Array.isArray(index) ? index : [];
        } catch (error) { return []; }
    }

    // Marks key as the most recently used and drops the least recently used listings beyond the count and size budgets.
    function touchListing(key, size, index) {
        index = index.filter(function (entry) { return entry[0] !== key; });
        index.push([key, size]);
        function total() { return index.reduce(function (sum, entry) { return sum + entry[1]; }, 0); }
        while (index.length > 1 && (index.length > LISTING_COUNT || total() > LISTING_TOTAL)) {
            window.localStorage.removeItem(index.shift()[0]);
        }
        window.localStorage.setItem(LISTING_INDEX, JSON.stringify(index));
    }

    function readListing(key) {
        try {
            var saved = key && JSON.parse(window.localStorage.getItem(key));
            if (!saved || !Array.isArray(saved.items) || !saved.items.length) { return null; }
            var size = 0;
            var index = listingIndex();
            index.forEach(function (entry) { if (entry[0] === key) { size = entry[1]; } });
            touchListing(key, size, index);
            return saved;
        } catch (error) { return null; }
    }

    function writeListing(key, items, total) {
        if (!key || currentBase !== 0 || !items.length) { return; }
        try {
            var json = JSON.stringify({ total: total, items: items.slice(0, LISTING_ITEMS).map(trimListingItem) });
            if (json.length > LISTING_LIMIT) { return; }
            window.localStorage.setItem(key, json);
            touchListing(key, json.length, listingIndex());
        } catch (error) { /* only a convenience */ }
    }

    function forgetListings() {
        try {
            for (var i = window.localStorage.length - 1; i >= 0; i -= 1) {
                var key = window.localStorage.key(i);
                if (key && key.indexOf(LISTING_PREFIX) === 0) { window.localStorage.removeItem(key); }
            }
        } catch (error) { return false; }
        return true;
    }

    // Artwork is fetched ahead for rows within three screens of the viewport, nearest first, and released from rows
    // more than ten screens away.
    function syncLibraryArt() {
        artTimer = null;
        var list = document.getElementById("item-list");
        if (!list) { return; }
        var height = window.innerHeight || 720;
        var near = [];
        Array.prototype.forEach.call(list.children, function (node) {
            if (!node.vemmArt) { return; }
            var box = node.getBoundingClientRect();
            var distance = box.bottom < 0 ? -box.bottom : box.top > height ? box.top - height : 0;
            if (distance <= 3 * height) { near.push({ node: node, distance: distance }); } else if (distance > 10 * height) { hideArt(node); }
        });
        near.sort(function (a, b) { return a.distance - b.distance; });
        near.forEach(function (entry) { showArt(entry.node); });
    }

    function scheduleLibraryArt() {
        if (artTimer === null) { artTimer = window.setTimeout(syncLibraryArt, 80); }
    }

    // Cards are built off the page and inserted at once: appended, or in front for the titles above a letter jump.
    function addLibraryCards(list, items, front) {
        var sort = currentSort().key;
        var cards = document.createDocumentFragment();
        items.forEach(function (item) { card(cards, item, currentClient, currentItems, { library: true, lazy: true, sort: sort }); });
        list.insertBefore(cards, front ? list.firstChild : null);
        syncLibraryArt();
    }

    // Focus within three screens of either end of what is loaded fetches the next page there (titles above a letter
    // jump load the same way), the same distance artwork is fetched ahead, so a fast scroll does not reach the end
    // before the page arrives. Both directions together stay within LISTING_MAX titles.
    function nearEnd(event) {
        var list = event.currentTarget;
        var target = event.target;
        scheduleLibraryArt();
        if (!target.vemmCard || currentItems.length >= LISTING_MAX) { return; }
        var reach = 3 * (window.innerHeight || 720);
        var top = target.getBoundingClientRect().top;
        if (currentBase > 0 && top - list.children[0].getBoundingClientRect().top < reach) { loadPreviousPage(); return; }
        if (currentBase + currentItems.length >= currentTotal) { return; }
        var last = list.children[list.children.length - 1].getBoundingClientRect();
        if (!last.height) { return; }
        if (last.top - top < reach) { loadNextPage(); }
    }

    function pageFailed(generation) {
        return function (error) {
            if (generation !== viewGeneration) { return; }
            itemsLoading = false;
            if (accountClient && recoverSession(error)) { return; }
            setStatus(errorText(error), true);
        };
    }

    function openSection(section, saved) {
        viewGeneration += 1;
        itemsLoading = false;
        currentSection = section;
        currentItems = saved ? saved.items : [];
        sectionLandingAt = saved && saved.landing || 0;
        currentBase = saved ? saved.base !== undefined ? saved.base : saved.offset : 0;
        currentOffset = saved ? saved.offset : 0;
        currentTotal = saved && saved.total !== undefined ? saved.total : Infinity;
        libraryFilters = saved ? saved.filters : {};
        var remembered = !currentItems.length && currentBase === 0 ? readListing(listingKey(section)) : null;
        if (remembered) {
            currentItems = remembered.items;
            currentOffset = currentItems.length;
            currentTotal = remembered.total;
        }
        clear(screen);
        resetImages();
        restoreView = function () {
            openSection(section, { items: currentItems.slice(), offset: currentOffset, base: currentBase, total: currentTotal,
                filters: JSON.parse(JSON.stringify(libraryFilters)) });
        };
        retryView = function () { loadNextPage(); };
        page(section.title || "Library", "library");
        browseHeader(section);
        var toolbar = group(screen, "", "page-toolbar");
        var sortControl = button(toolbar, translate("Sort") + ": " + sortLabel(section) + " ▾", function () {
            openSortList(section, sortControl);
        }, true, "none");
        sortControl.className += " dropdown-control sort-dropdown";
        var showFilters = section.type === "movie" || section.type === "show";
        if (showFilters) {
            var watchedControl = button(toolbar, watchedLabel(section), function () { cycleWatched(section); }, true, "none");
            watchedControl.className += " watched-control";
        }
        var genreControl = button(toolbar, translate("Genre") + ": " + genreLabel() + " ▾", function () {
            openGenreList(section, genreControl);
        }, true, "none");
        genreControl.className += " dropdown-control genre-dropdown";
        if (showFilters) {
            var yearControl = button(toolbar, translate("Year") + ": " + yearLabel() + " ▾", function () {
                openYearList(section, yearControl);
            }, true, "none");
            yearControl.className += " dropdown-control year-dropdown";
        }
        button(toolbar, "Collections", function () {
            visit(function () {
                openListing("Collections", function (offset) { return currentClient.getCollections(section.key, offset); }, currentClient);
            });
        });
        if (filtersActive(section)) {
            var clearControl = button(toolbar, "Clear filters", function () {
                applyBrowse(section, libraryFilters.sort ? { sort: libraryFilters.sort } : {}, "sort-dropdown");
            }, false, "none");
            clearControl.className += " clear-filters";
        }
        var list = element("div", "item-list");
        list.id = "item-list";
        list.addEventListener("focus", nearEnd, true);
        screen.addEventListener("scroll", scheduleLibraryArt, false);
        screen.appendChild(list);
        addLibraryCards(list, currentItems);
        if (section.type === "movie" || section.type === "show") { letterBar(section); }
        var restoringFocus = !!pendingRestore;
        focusFirst();
        sectionLandingFocus = null;
        if (!restoringFocus && document.activeElement === screen.querySelector(".account-control")) {
            // Hold focus on this library's tab while titles load, then hand it to the first title.
            sectionLandingFocus = screen.querySelector('.home-navigation button[aria-current="page"]') ||
                screen.querySelector(".page-toolbar button");
            sectionLandingFocus.focus();
            if (list.querySelector("button")) { (list.children[sectionLandingAt] || list.querySelector("button")).focus(); sectionLandingFocus = null; }
        }
        scheduleLibraryArt();
        if (remembered) { refreshListing(remembered.items.length); }
        else if (!currentItems.length) { loadNextPage(); }
    }

    // Asks the server for the same range the remembered list covered, then makes the grid match it.
    function refreshListing(count) {
        var generation = viewGeneration;
        var section = currentSection;
        var want = Math.max(50, count);
        var fresh = [];
        itemsLoading = true;
        function fetchMore() {
            return currentClient.getSectionItems(section.key, fresh.length, Math.min(100, want - fresh.length),
                libraryFilters).then(function (page) {
                if (generation !== viewGeneration) { return false; }
                fresh = fresh.concat(page.items);
                currentTotal = page.totalSize;
                return page.items.length && fresh.length < want && fresh.length < page.totalSize ? fetchMore() : true;
            });
        }
        fetchMore().then(function (done) {
            if (!done || generation !== viewGeneration) { return; }
            itemsLoading = false;
            reconcileListing(fresh);
            writeListing(listingKey(section), currentItems, currentTotal);
        }).catch(pageFailed(generation));
    }

    // Replaces the grid's titles with the server's. Unchanged lists are left alone; a changed one is redrawn with focus
    // kept on the same title (or its nearest surviving neighbour) at the same place on screen.
    function reconcileListing(fresh) {
        var list = document.getElementById("item-list");
        var unchanged = JSON.stringify(fresh.map(trimListingItem)) === JSON.stringify(currentItems.map(trimListingItem));
        var old = currentItems.slice();
        currentItems.length = 0;
        Array.prototype.push.apply(currentItems, fresh);
        currentOffset = currentBase + fresh.length;
        if (unchanged) { return; }
        var focused = document.activeElement;
        var inGrid = focused && focused.vemmCard && list.contains(focused);
        var focusedAt = inGrid ? old.indexOf(focused.vemmCard.item) : -1;
        var top = inGrid ? focused.getBoundingClientRect().top : 0;
        var keys = {};
        fresh.forEach(function (item) { keys[String(item.ratingKey)] = true; });
        var target = null;
        if (focusedAt !== -1) {
            for (var i = focusedAt; i < old.length && !target; i += 1) { if (keys[String(old[i].ratingKey)]) { target = String(old[i].ratingKey); } }
            for (i = focusedAt - 1; i >= 0 && !target; i -= 1) { if (keys[String(old[i].ratingKey)]) { target = String(old[i].ratingKey); } }
        }
        clear(list);
        addLibraryCards(list, currentItems);
        if (!currentItems.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
        var next = null;
        Array.prototype.forEach.call(list.children, function (node) {
            if (target && node.vemmCard && String(node.vemmCard.item.ratingKey) === target) { next = node; }
        });
        if (inGrid) {
            (next || list.querySelector("button") || screen.querySelector(".page-toolbar button")).focus();
            if (next) { screen.scrollTop += next.getBoundingClientRect().top - top; }
        }
        scheduleLibraryArt();
    }

    function loadNextPage() {
        if (!currentClient || !currentSection || itemsLoading) {
            return;
        }
        var generation = viewGeneration;
        var section = currentSection;
        itemsLoading = true;
        if (!currentItems.length) { setStatus("Loading library items…"); }
        currentClient.getSectionItems(section.key, currentOffset, 50, libraryFilters).then(function (page) {
            if (generation !== viewGeneration) {
                return;
            }
            itemsLoading = false;
            var added = page.items;
            Array.prototype.push.apply(currentItems, added);
            currentOffset = page.offset + added.length;
            currentTotal = added.length && currentItems.length < LISTING_MAX ? page.totalSize : currentBase + currentItems.length;
            var list = document.getElementById("item-list");
            addLibraryCards(list, added);
            if (sectionLandingFocus && document.activeElement === sectionLandingFocus && list.querySelector("button")) {
                (list.children[sectionLandingAt] || list.querySelector("button")).focus();
            }
            sectionLandingFocus = null;
            if (!currentItems.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            setStatus("");
            writeListing(listingKey(section), currentItems, currentTotal);
        }).catch(pageFailed(generation));
    }

    // The page before the first loaded title (after a letter jump), put in front without moving what is on screen.
    // A jump starts on a multiple of twelve titles and so does every page before it, so the grid's three, four or
    // six columns keep their titles.
    function loadPreviousPage() {
        if (!currentClient || !currentSection || itemsLoading || currentBase <= 0) { return; }
        var generation = viewGeneration;
        var start = Math.max(0, currentBase - 48);
        itemsLoading = true;
        currentClient.getSectionItems(currentSection.key, start, currentBase - start, libraryFilters).then(function (page) {
            if (generation !== viewGeneration) { return; }
            itemsLoading = false;
            var list = document.getElementById("item-list");
            var focused = document.activeElement;
            var anchor = focused && focused.vemmCard && list.contains(focused) ? focused : list.children[0];
            var before = anchor.getBoundingClientRect().top;
            Array.prototype.unshift.apply(currentItems, page.items);
            currentBase = page.items.length ? start : 0;
            addLibraryCards(list, page.items, true);
            screen.scrollTop += anchor.getBoundingClientRect().top - before;
        }).catch(pageFailed(generation));
    }

    function openListing(title, loader, client, offset, retained, cached, navigation) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        retryView = function () { openListing(title, loader, client, offset, retained, null, navigation); };
        function addShowAction() {
            if (!navigation || !navigation.showRatingKey) { return; }
            button(screen, "Go to show", function () {
                visit(function () { openDetail(navigation.showRatingKey, client); });
            });
        }
        page(title, "listing");
        setStatus("Loading...");
        offset = offset || 0;
        retained = retained || [];
        if (navigation) { restoreView = retryView; }
        (cached ? Promise.resolve(cached) : loader(offset)).then(function (container) {
            if (generation !== viewGeneration) { return; }
            var items = retained.concat(container.Metadata || []).slice(-200);
            restoreView = function () {
                openListing(title, loader, client, offset, retained, container, navigation);
            };
            var list = element("div", "item-list");
            screen.appendChild(list);
            if (!items.length) { list.appendChild(element("p", "empty-state", translate("No available items in this view."))); }
            items.forEach(function (item) { if (item.ratingKey) { card(list, item, client, items, { library: true, open: navigation && navigation.open }); } });
            var next = offset + (container.Metadata || []).length;
            if (container.totalSize > next && next > offset) {
                button(screen, "Load more", function () {
                    openListing(title, loader, client, next, items, null, navigation);
                });
            }
            addShowAction();
            button(screen, "Back", backView);
            setStatus(translate("{count} items shown.", { count: items.length }));
            focusFirst();
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry", function () {
                openListing(title, loader, client, offset, retained, null, navigation);
            });
            addShowAction();
            button(screen, "Back", backView);
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    var LETTERS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var TITLE_SORT = "titleSort:asc";
    var DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];
    var YEAR_SPANS = [5, 10, 20];
    var CHECK = "✓ ";

    function titleSortActive() { return !libraryFilters.sort || libraryFilters.sort === TITLE_SORT; }

    function activeFilterNames() {
        return Object.keys(libraryFilters).filter(function (name) { return name !== "sort"; });
    }

    // A copy of the active sort and filters with the given changes; a null value removes that key.
    function changedFilters(change) {
        var filters = JSON.parse(JSON.stringify(libraryFilters));
        Object.keys(change).forEach(function (name) {
            if (change[name] === null) { delete filters[name]; } else { filters[name] = change[name]; }
        });
        return filters;
    }

    function currentSort() {
        var parts = String(libraryFilters.sort || TITLE_SORT).split(":");
        return { key: parts[0], dir: parts[1] || "" };
    }

    function sortOption(key, title, descKey) {
        var natural = key === "titleSort" ? "asc" : key === "random" ? "" : "desc";
        return { key: key, label: translate(title || key), natural: natural,
            asc: key + ":asc", desc: descKey || key + ":desc" };
    }

    // One entry per sort, Title first. The server accepts a bitrate sort for movies without listing it.
    function sortOptions(type, section) {
        var options = [];
        (type.Sort || []).forEach(function (sort) {
            var option = sortOption(sort.key, sort.title, sort.descKey);
            if (sort.key === "titleSort") { options.unshift(option); } else { options.push(option); }
        });
        if (section.type === "movie" && !options.some(function (option) { return option.key === "mediaBitrate"; })) {
            options.push(sortOption("mediaBitrate", "Bitrate"));
        }
        return options;
    }

    function arrowFor(option, active) {
        return active && option.natural ? (currentSort().dir === "asc" ? " ↑" : " ↓") : "";
    }

    // Choosing the active sort again flips its direction; another sort starts in its natural direction.
    function sortValue(option) {
        var active = currentSort();
        if (!option.natural) { return option.key; }
        if (active.key === option.key) { return active.dir === "asc" ? option.desc : option.asc; }
        return option.natural === "asc" ? option.asc : option.desc;
    }

    function sortLabel(section) {
        var known = libraryMenus && libraryMenus.client === currentClient && libraryMenus.key === section.key && libraryMenus.type;
        var key = currentSort().key;
        var options = sortOptions(known || { Sort: [{ key: "titleSort", title: "Title" }] }, section);
        for (var i = 0; i < options.length; i += 1) {
            if (options[i].key === key) { return options[i].label + arrowFor(options[i], true); }
        }
        return key;
    }

    function watchedName(section) { return section.type === "show" ? "unwatchedLeaves" : "unwatched"; }

    function watchedLabel(section) {
        var value = libraryFilters[watchedName(section)];
        return translate("Status") + ": " + translate(value === "1" ? "Unwatched" : value === "0" ? "Watched" : "All");
    }

    // All -> Unwatched -> Watched -> All.
    function cycleWatched(section) {
        var name = watchedName(section);
        var value = libraryFilters[name];
        var change = {};
        change[name] = value === "1" ? "0" : value === "0" ? null : "1";
        applyBrowse(section, changedFilters(change), "watched-control");
    }

    function filtersActive(section) {
        return !!(libraryFilters[watchedName(section)] !== undefined || libraryFilters.genre ||
            libraryFilters["year>>"] !== undefined || libraryFilters["year<<"] !== undefined);
    }

    function selectedGenres() {
        return libraryFilters.genre ? String(libraryFilters.genre).split(",") : [];
    }

    function genreLabel() {
        var chosen = selectedGenres();
        if (!chosen.length) { return translate("All"); }
        var first = libraryGenreTitles[chosen[0]] || chosen[0];
        return chosen.length > 1 ? first + " +" + (chosen.length - 1) : first;
    }

    function yearChoices() {
        var now = new Date().getFullYear();
        var choices = [{ label: translate("Any"), from: null, to: null }];
        YEAR_SPANS.forEach(function (years) {
            choices.push({ label: translate("Last {years} years", { years: years }), from: now - years + 1, to: null });
        });
        DECADES.forEach(function (decade) { choices.push({ label: decade + "s", from: decade, to: decade + 9 }); });
        return choices;
    }

    function yearLabel() {
        var from = libraryFilters["year>>"] === undefined ? null : Number(libraryFilters["year>>"]);
        var to = libraryFilters["year<<"] === undefined ? null : Number(libraryFilters["year<<"]);
        var match = yearChoices().filter(function (choice) { return choice.from === from && choice.to === to; })[0];
        if (match) { return match.label; }
        return from !== null && to !== null ? from + "–" + to : from !== null ? from + "+" : "–" + to;
    }

    function applyYears(section, from, to) {
        applyBrowse(section, changedFilters({ "year>>": from === null ? null : String(from),
            "year<<": to === null ? null : String(to) }), "year-dropdown");
    }

    // The server's sort and filter lists are fetched once per library and reused by the dropdowns.
    function menusFor(section) {
        if (!libraryMenus || libraryMenus.client !== currentClient || libraryMenus.key !== section.key) {
            var entry = { client: currentClient, key: section.key, type: null };
            entry.request = currentClient.getBrowseMenus(section.key, section.type === "show" ? 2 :
                section.type === "artist" ? 8 : section.type === "photo" ? 13 : 1).then(function (container) {
                var types = container.Meta && container.Meta.Type || [];
                entry.type = types.filter(function (candidate) { return candidate.active; })[0] || types[0] || {};
                return entry.type;
            });
            entry.request.catch(function () { if (libraryMenus === entry) { libraryMenus = null; } });
            libraryMenus = entry;
        }
        return libraryMenus.request;
    }

    // Reloads the grid with new sort/filters, then returns focus to the toolbar control that changed them.
    function applyBrowse(section, filters, controlClass) {
        openSection(section, { items: [], offset: 0, filters: filters });
        var control = controlClass && screen.querySelector(".page-toolbar ." + controlClass);
        if (control) { control.focus(); }
    }

    function closeDropdown(refocus) {
        var list = screen.querySelector(".dropdown-list");
        if (!list) { return false; }
        var anchor = list.vemmAnchor;
        list.parentNode.removeChild(list);
        if (anchor) {
            anchor.setAttribute("aria-expanded", "false");
            if (refocus !== false) { anchor.focus(); }
        }
        if (list.vemmOnClose) { list.vemmOnClose(); }
        return true;
    }

    // An inline list anchored under a toolbar control; Up/Down choose, OK applies, Back closes.
    // Each pick receives its button so a multi-select can update in place.
    function openDropdown(anchor, options) {
        closeDropdown(false);
        var list = element("div", "dropdown-list");
        list.setAttribute("role", "listbox");
        var chosen = null;
        options.forEach(function (option) {
            var choice = button(list, option.label, function () { option.pick(choice); }, true, "none");
            choice.setAttribute("aria-pressed", option.selected ? "true" : "false");
            if (option.selected && !chosen) { chosen = choice; }
        });
        list.vemmAnchor = anchor;
        list.style.left = anchor.offsetLeft + "px";
        anchor.parentNode.appendChild(list);
        anchor.setAttribute("aria-expanded", "true");
        (chosen || list.querySelector("button") || anchor).focus();
        return list;
    }

    function browseError(anchor, error) {
        if (document.body.contains(anchor)) { setStatus(errorText(error), true); }
    }

    function openSortList(section, anchor) {
        if (closeDropdown()) { return; }
        menusFor(section).then(function (type) {
            if (!document.body.contains(anchor)) { return; }
            var active = currentSort().key;
            openDropdown(anchor, sortOptions(type, section).map(function (option) {
                var on = option.key === active;
                return { label: option.label + arrowFor(option, on), selected: on, pick: function () {
                    applyBrowse(section, changedFilters({ sort: sortValue(option) }), "sort-dropdown");
                } };
            }));
        }).catch(function (error) { browseError(anchor, error); });
    }

    // Genres are a multi-select: OK toggles a check and closing the list applies the choice.
    function openGenreList(section, anchor) {
        if (closeDropdown()) { return; }
        menusFor(section).then(function (type) {
            var genre = (type.Filter || []).filter(function (filter) { return filter.filter === "genre" && filter.key; })[0];
            return genre ? currentClient.getFilterValues(section.key, genre.key) : {};
        }).then(function (values) {
            if (!document.body.contains(anchor)) { return; }
            var chosen = selectedGenres();
            var before = chosen.join(",");
            var options = [{ label: translate("Clear"), pick: function () {
                applyBrowse(section, changedFilters({ genre: null }), "genre-dropdown");
            } }];
            (values.Directory || []).slice(0, 200).forEach(function (value) {
                var id = String(value.key);
                var title = value.title || id;
                libraryGenreTitles[id] = title;
                options.push({ label: (chosen.indexOf(id) !== -1 ? CHECK : "") + title, selected: chosen.indexOf(id) !== -1,
                    pick: function (control) {
                        var at = chosen.indexOf(id);
                        if (at === -1) { chosen.push(id); } else { chosen.splice(at, 1); }
                        control.textContent = (at === -1 ? CHECK : "") + title;
                        control.setAttribute("aria-pressed", at === -1 ? "true" : "false");
                    } });
            });
            openDropdown(anchor, options).vemmOnClose = function () {
                if (chosen.join(",") !== before) {
                    applyBrowse(section, changedFilters({ genre: chosen.length ? chosen.join(",") : null }), "genre-dropdown");
                }
            };
        }).catch(function (error) { browseError(anchor, error); });
    }

    function openYearList(section, anchor) {
        if (closeDropdown()) { return; }
        var from = libraryFilters["year>>"];
        var to = libraryFilters["year<<"];
        var current = yearLabel();
        var options = yearChoices().map(function (choice) {
            return { label: choice.label, selected: choice.label === current, pick: function () {
                applyYears(section, choice.from, choice.to);
            } };
        });
        options.push({ label: translate("Custom range…"), pick: function () {
            openYearPicker(section, anchor, from === undefined ? 2000 : Number(from),
                to === undefined ? new Date().getFullYear() : Number(to));
        } });
        openDropdown(anchor, options);
    }

    // Two year fields: Up/Down change the focused one, Left/Right switch, OK applies.
    function openYearPicker(section, anchor, from, to) {
        var range = [from, to];
        var names = ["From", "To"];
        var list = openDropdown(anchor, names.map(function (name, index) {
            return { label: translate(name) + ": " + range[index], pick: function () {
                applyYears(section, Math.min(range[0], range[1]), Math.max(range[0], range[1]));
            } };
        }));
        var fields = Array.prototype.slice.call(list.querySelectorAll("button"));
        list.vemmPicker = function (key, active) {
            var index = fields.indexOf(active);
            if (index === -1) { return; }
            if (key === 37 || key === 39) { fields[key === 37 ? 0 : 1].focus(); return; }
            range[index] = Math.max(1900, Math.min(new Date().getFullYear(), range[index] + (key === 38 ? 1 : -1)));
            active.textContent = translate(names[index]) + ": " + range[index];
        };
        fields[0].focus();
    }

    // Letter start offsets come from one firstCharacter request per library and filter set.
    function letterOffsets(section) {
        var query = {};
        activeFilterNames().forEach(function (name) { query[name] = libraryFilters[name]; });
        var signature = section.key + "|" + JSON.stringify(query);
        if (!letterCache || letterCache.client !== currentClient || letterCache.signature !== signature) {
            var entry = { client: currentClient, signature: signature, starts: null };
            entry.request = currentClient.getLetters(section.key, query).then(function (container) {
                var offset = 0;
                var starts = {};
                (container.Directory || []).forEach(function (letter) {
                    var size = Number(letter.size) || 0;
                    starts[String(letter.title || letter.key).toUpperCase()] = { start: offset, size: size };
                    offset += size;
                });
                entry.starts = starts;
                return starts;
            });
            entry.request.catch(function () { if (letterCache === entry) { letterCache = null; } });
            letterCache = entry;
        }
        return letterCache.request;
    }

    // Offsets only match title order, so the bar is hidden under any other sort.
    function letterBar(section) {
        var bar = element("div", "letter-bar");
        bar.hidden = !titleSortActive();
        var controls = {};
        LETTERS.split("").forEach(function (letter) {
            var control = button(bar, letter, function () { jumpToLetter(section, letter); }, true, "none");
            control.disabled = true;
            control.className += " letter-empty";
            controls[letter] = control;
        });
        screen.appendChild(bar);
        if (bar.hidden) { return; }
        letterOffsets(section).then(function (starts) {
            if (!document.body.contains(bar)) { return; }
            Object.keys(starts).forEach(function (letter) {
                if (controls[letter] && starts[letter].size > 0) {
                    controls[letter].disabled = false;
                    controls[letter].className = controls[letter].className.replace(" letter-empty", "");
                }
            });
        }).catch(function () {});
    }

    // A letter is a jump, not a filter: focus moves to its first title in the full list. Within what is loaded that is
    // all; otherwise the list reloads from a row or two above that title and scrolling up loads the titles before.
    function jumpToLetter(section, letter) {
        var found = letterCache && letterCache.starts && letterCache.starts[letter];
        if (!found || !found.size) { return; }
        var list = document.getElementById("item-list");
        var at = found.start - currentBase;
        if (list && at >= 0 && at < currentItems.length && list.children[at]) { list.children[at].focus(); return; }
        var base = Math.max(0, found.start - 12);
        base -= base % 12;
        openSection(section, { items: [], offset: base, base: base, filters: libraryFilters, landing: found.start - base });
    }

    function endOfRow(card) {
        var next = card.nextElementSibling;
        if (!next) { return true; }
        var box = card.getBoundingClientRect();
        return Math.abs(next.getBoundingClientRect().top - box.top) >= box.height / 2;
    }

    // Dimmed jump-bar letters are not focus targets.
    function focusable(node) { return !node.disabled && node.className.indexOf("letter-empty") === -1; }

    function stepFocus(container, direction, active) {
        var controls = Array.prototype.filter.call(container.querySelectorAll("button"), focusable);
        var next = controls[controls.indexOf(active) + direction];
        if (next) { next.focus(); }
    }

    function enterLetterBar(bar, card) {
        var item = card.vemmCard.item;
        var index = Math.max(0, LETTERS.indexOf(String(item.titleSort || item.title || "").charAt(0).toUpperCase()));
        var controls = bar.querySelectorAll("button");
        for (var distance = 0; distance < controls.length; distance += 1) {
            var below = controls[index + distance];
            var above = controls[index - distance];
            var target = below && focusable(below) ? below : above && focusable(above) ? above : null;
            if (target) { letterReturn = card; target.focus(); return true; }
        }
        return false;
    }

    // Focus rules for the open dropdown and the jump bar; true when the key was handled.
    function browseKey(direction, key, active) {
        var list = screen.querySelector(".dropdown-list");
        if (list) {
            if (list.vemmPicker) { list.vemmPicker(key, active); }
            else if (key === 38 || key === 40) { wrapFocus(usable(list.querySelectorAll("button")), active, direction); }
            return true;
        }
        var bar = screen.querySelector(".letter-bar");
        if (!bar || bar.hidden || !active) { return false; }
        if (bar.contains(active)) {
            if (key === 37) {
                var back = letterReturn && letterReturn.parentNode ? letterReturn : screen.querySelector(".item-list .media-card");
                if (back) { back.focus(); }
            } else if (key === 38 || key === 40) { stepFocus(bar, direction, active); }
            return true;
        }
        return key === 39 && !!active.vemmCard && endOfRow(active) && enterLetterBar(bar, active);
    }

    function openSearch(savedQuery) {
        ++viewGeneration;
        retryView = null;
        clear(screen);
        resetImages();
        page(translate("Search your servers"), "search");
        var mode = "all";
        var timer = null;
        var query = "";
        var sources = [];
        var errors = [];
        var complete = true;
        var searchUi = window.VemmSearchUi;
        var recents = element("section", "search-recents");
        var results = element("div", "search-results");
        var modes = [["all", "Both"], ["movies", "Movies"], ["tv", "TV"]];
        var keyboard = searchUi.keyboard({
            element: element, translate: translate, label: "Search movies and television",
            hint: "Type a title, actor or genre",
            extras: modes.map(function (choice) {
                return { label: translate(choice[1]), action: function () { mode = choice[0]; markModes(); draw(); } };
            }),
            onChange: function (value) {
                renderRecents();
                if (timer !== null) { clearTimeout(timer); }
                timer = setTimeout(function () { timer = null; if (screen.contains(keyboard.node)) { search(); } }, searchUi.DEBOUNCE);
            }
        });
        var panel = element("div", "search-panel");
        searchUi.link(keyboard, panel);
        function markModes() {
            keyboard.extras.forEach(function (control, index) {
                control.setAttribute("aria-pressed", modes[index][0] === mode ? "true" : "false");
            });
        }
        retryView = function () { openSearch(keyboard.value()); };
        screen.appendChild(keyboard.node);
        keyboard.attach(panel);
        function recentProfile() {
            var profile = activeProfile || linkedProfile;
            return profile && profile.uuid ? String(profile.uuid) : "default";
        }
        function renderRecents() {
            clear(recents);
            var terms = window.VemmRecents && !keyboard.value().trim() ?
                window.VemmRecents.load(window.localStorage, recentProfile()) : [];
            recents.hidden = !terms.length;
            if (!terms.length) { return; }
            recents.appendChild(element("h3", "", translate("RECENT SEARCHES")));
            terms.forEach(function (term) {
                button(recents, term, function () { keyboard.set(term); renderRecents(); search(); }, true, "search");
            });
            button(recents, "Clear recent searches", function () {
                window.VemmRecents.clear(window.localStorage, recentProfile());
                renderRecents();
                keyboard.focus();
            });
        }
        function shelf(title, items, drawCard) {
            if (!items.length) { return; }
            var section = element("section", "shelf");
            section.appendChild(element("h3", "", title));
            var row = element("div", "shelf-row");
            section.appendChild(row);
            items.forEach(function (entry) { drawCard(row, entry); });
            results.appendChild(section);
        }
        function draw() {
            if (!sources.length && !errors.length) { return 0; }
            clear(results);
            resetImages();
            var arranged = searchUi.arrange(sources, mode, query);
            var shown = 0;
            function take(list) {
                var kept = list.slice(0, Math.max(0, Math.min(50, 200 - shown)));
                shown += kept.length;
                return kept;
            }
            function cards(row, entry) { card(row, entry.item, entry.client); }
            shelf(translate("Movies and shows"), take(arranged.titles), cards);
            if (arranged.people.length) {
                var people = element("section", "people-results");
                people.appendChild(element("h3", "", translate("Cast and crew")));
                var row = element("div", "detail-cast-row");
                take(arranged.people.slice(0, 5)).forEach(function (entry) {
                    var node = button(row, entry.person.tag || "Person", function () {
                        visit(function () { openPerson(entry.person, entry.client); });
                    }, true);
                    node.className = "detail-person";
                    var face = element("img", "detail-person-photo");
                    face.alt = "";
                    node.appendChild(face);
                    queueImage(face, entry.client, entry.person.thumb, { width: 200, height: 200 });
                });
                people.appendChild(row);
                results.appendChild(people);
            }
            var studios = arranged.tags.filter(function (entry) { return entry.kind === "studio"; });
            if (studios.length) {
                var section = element("section", "people-results");
                section.appendChild(element("h3", "", translate("Studios")));
                take(studios).forEach(function (entry) {
                    button(section, entry.tag.tag, function () { keyboard.set(entry.tag.tag); renderRecents(); search(); }, true);
                });
                results.appendChild(section);
            }
            shelf(translate("Episodes"), take(arranged.episodes), cards);
            shelf(translate("More results"), take(arranged.related), cards);
            errors.forEach(function (message) { results.appendChild(element("p", "inline-error", message)); });
            if (!shown && !errors.length && complete) { results.appendChild(element("p", "empty-state", translate("No matching media found."))); }
            return shown;
        }
        function search() {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            query = keyboard.value().trim();
            sources = [];
            errors = [];
            complete = false;
            var searchGeneration = ++viewGeneration;
            cancelViewRequests();
            clear(results);
            resetImages();
            if (query.length < 2) {
                results.appendChild(element("p", "empty-state search-hint", translate(query ?
                    "Keep typing to search." : "Type a title, actor or genre to search.")));
                setStatus("");
                return;
            }
            if (window.VemmRecents) { window.VemmRecents.remember(window.localStorage, recentProfile(), query); }
            recents.hidden = true;
            restoreView = function () { openSearch(query); };
            retryView = restoreView;
            setStatus("Searching reachable Plex servers...");
            var targets = servers.length ? servers.slice() : [null];
            var index = 0;
            var active = 0;
            var finished = 0;
            var failures = 0;
            function pump() {
                while (active < 2 && index < targets.length) {
                    (function (server) {
                        active += 1;
                        (server ? window.PlexApi.selectServer(server, { onClient: function (client) {
                            if (searchGeneration !== viewGeneration) { return false; }
                            viewClients.push(client);
                            return true;
                        } }).then(function (selected) { return selected.client; }) :
                            Promise.resolve(currentClient)).then(function (client) {
                            if (searchGeneration !== viewGeneration) { return; }
                            return client.search(query).then(function (container) {
                                if (searchGeneration !== viewGeneration) { return; }
                                sources.push({ container: container, client: client, server: servers.length > 1 ? server : null });
                            });
                        }).catch(function (error) {
                            failures += 1;
                            errors.push(errorText(error));
                        }).then(function () {
                            active -= 1;
                            finished += 1;
                            if (searchGeneration !== viewGeneration) { return; }
                            complete = finished === targets.length;
                            var shown = draw();
                            if (complete) {
                                setStatus(failures ? "Some servers could not be searched. Retry or change server." :
                                    shown >= 200 ? "Showing 200 results. Refine your search for more." :
                                        shown ? "" : "No matching media found.", failures > 0);
                            } else { pump(); }
                        });
                    }(targets[index++]));
                }
            }
            pump();
        }
        markModes();
        panel.appendChild(recents);
        panel.appendChild(results);
        button(screen, "Back", backView);
        results.appendChild(element("p", "empty-state search-hint", translate("Type a title, actor or genre to search.")));
        restoreView = function () { openSearch(keyboard.value()); };
        renderRecents();
        setStatus("");
        var restoring = !!pendingRestore;
        focusFirst();
        if (!restoring) { keyboard.focus(); }
        if (typeof savedQuery === "string" && savedQuery) { keyboard.set(savedQuery); renderRecents(); search(); }
    }

    function openDetail(id, client, playlist) {
        retryView = function () { openDetail(id, client, playlist); };
        restoreView = retryView;
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        button(screen, "Back", backView);
        setStatus("Loading details...");
        focusLoading();
        (playlist ? client.getPlaylist(id) : client.getMetadata(id)).then(function (item) {
            if (generation !== viewGeneration) { return; }
            if (!item) { throw new Error("This item is no longer on the server."); }
            renderDetail(item, client);
        }).catch(function (error) {
            if (generation !== viewGeneration) { return; }
            button(screen, "Retry details", function () { openDetail(id, client, playlist); });
            setStatus(errorText(error), true);
            focusFirst();
        });
    }

    function durationLabel(ms) {
        var minutes = Math.max(1, Math.round(ms / 60000));
        return minutes < 60 ? translate("{minutes} min", { minutes: minutes }) :
            translate("{hours} hr {minutes} min", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
    }

    function detailBadges(item) {
        var media = item.Media && item.Media[0];
        var badges = [];
        if (media) {
            var resolution = String(media.videoResolution || "").toLowerCase();
            if (resolution === "4k") { badges.push("4K"); }
            else if (/^\d+$/.test(resolution)) { badges.push(resolution + "p"); }
            else if (resolution === "sd") { badges.push("SD"); }
            if (media.videoDynamicRange && media.videoDynamicRange !== "SDR") { badges.push(media.videoDynamicRange); }
            var channels = Number(media.audioChannels);
            if (channels >= 6) { badges.push(channels === 8 ? "7.1" : "5.1"); }
            var streams = media.Part && media.Part[0] && media.Part[0].Stream || [];
            if (streams.some(function (stream) { return stream.streamType === 3; })) { badges.push("CC"); }
        }
        return badges;
    }

    function detailAction(parent, label, icon, action, literal) {
        var node = button(parent, label, action, literal);
        node.className = "detail-pill" + (icon ? " detail-pill-" + icon : "");
        return node;
    }

    function renderDetail(item, client) {
        viewGeneration += 1;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openDetail(item.ratingKey, client, item.type === "playlist"); };
        setDetailMode(true);
        screen.className = "screen screen-detail";
        var playable = ["movie", "episode", "clip", "track"].indexOf(item.type) !== -1;
        var backdropPath = item.art || item.grandparentArt || item.parentArt ||
            (item.type === "episode" || item.type === "clip" ? item.thumb : "");
        if (backdropPath) {
            var backdrop = element("img", "detail-backdrop");
            backdrop.alt = "";
            screen.appendChild(backdrop);
            queueImage(backdrop, client, backdropPath, { width: 1280, height: 720 }, 4 * 1024 * 1024, function () {
                backdrop.className = "detail-backdrop detail-backdrop-ready";
                presentBackdrop(backdrop);
            }, true);
        }
        screen.appendChild(element("div", "detail-scrim"));

        var hero = element("section", "detail-hero");
        var main = element("div", "detail-main");
        hero.appendChild(main);
        if (["artist", "album", "track", "photoalbum", "collection", "playlist"].indexOf(item.type) !== -1) {
            hero.className += " detail-hero-with-cover";
            var cover = element("img", "detail-cover");
            cover.alt = "";
            cover.src = placeholderArt();
            hero.appendChild(cover);
            queueImage(cover, client, item.thumb || item.composite, { width: 480, height: 480 });
        }
        if (item.type === "episode" && item.grandparentTitle) {
            main.appendChild(element("p", "detail-eyebrow", item.grandparentTitle +
                (item.parentIndex !== undefined && item.index !== undefined ? "  ·  S" + item.parentIndex + " E" + item.index : "")));
        } else if ((item.type === "season" || item.type === "album") && item.parentTitle) {
            main.appendChild(element("p", "detail-eyebrow", item.parentTitle));
        }
        main.appendChild(element("h2", "detail-title", item.title || "Details"));

        var identity = element("p", "detail-identity");
        var genres = (item.Genre || []).slice(0, 3).map(function (genre) { return genre.tag; }).filter(Boolean);
        if (genres.length) { identity.appendChild(element("span", "detail-genres", genres.join("  ·  "))); }
        detailBadges(item).forEach(function (badge) { identity.appendChild(element("span", "detail-badge", badge)); });
        if (identity.children && identity.children.length || identity.childNodes && identity.childNodes.length) { main.appendChild(identity); }

        var synopsis = element("p", "synopsis detail-synopsis", item.summary || translate("No synopsis is available."));
        main.appendChild(synopsis);
        if (item.summary) {
            var expand = button(main, "Read more", function () {
                var expanded = synopsis.className.indexOf(" expanded") === -1;
                synopsis.className = "synopsis detail-synopsis" + (expanded ? " expanded" : "");
                expand.textContent = translate(expanded ? "Read less" : "Read more");
                expand.setAttribute("aria-expanded", String(expanded));
                revealControl(expand);
            });
            expand.className = "detail-expand";
            expand.setAttribute("aria-expanded", "false");
        }

        var year = item.year || (item.originallyAvailableAt ? String(item.originallyAvailableAt).slice(0, 4) : "");
        var remaining = item.viewOffset && item.duration ? Math.max(1, Math.round((item.duration - item.viewOffset) / 60000)) : 0;
        main.appendChild(element("p", "detail-meta", [year, item.contentRating,
            item.type === "playlist" ? translate("{count} items", { count: item.leafCount || 0 }) : "",
            item.duration ? durationLabel(item.duration) : "",
            remaining ? translate("{minutes} min left", { minutes: remaining }) : item.viewCount ? translate("Watched") : "",
            item.duration && (item.type === "movie" || item.type === "episode") ?
                endsAtLabel(item.duration - (item.viewOffset || 0)) : ""
        ].filter(Boolean).join("  ·  ")));
        var scores = window.PlexApi.ratingBadges(item, preferences.ratingSources);
        if (scores.length) {
            var scoreRow = element("p", "detail-ratings");
            scores.forEach(function (score) {
                var fresh = score.source === "rt_critic" && score.fresh !== null ? translate(score.fresh ? "Fresh" : "Rotten") : "";
                var badge = element("span", "detail-rating");
                badge.className += " rating-" + score.source + (score.source === "rt_critic" && score.fresh !== null ?
                    (score.fresh ? " rating-fresh" : " rating-rotten") : "");
                badge.setAttribute("role", "img");
                badge.setAttribute("aria-label", ratingName(score.source) + " " + score.text + (fresh ? " " + fresh : ""));
                badge.appendChild(element("span", "rating-logo"));
                badge.appendChild(element("span", "rating-score", score.text));
                scoreRow.appendChild(badge);
            });
            main.appendChild(scoreRow);
        }
        if (item.viewOffset && item.duration) {
            var track = element("div", "detail-progress");
            var fill = element("div", "detail-progress-fill");
            if (fill.style) { fill.style.width = Math.min(100, Math.round(item.viewOffset * 100 / item.duration)) + "%"; }
            track.appendChild(fill);
            main.appendChild(track);
            main.appendChild(element("p", "detail-progress-time", timeLabel(item.viewOffset) + " / " + timeLabel(item.duration)));
        }

        var actions = element("div", "detail-actions");
        main.appendChild(actions);
        var more = element("div", "detail-more detail-overflow");
        more.hidden = true;
        var fileInfoRows = window.VemmFileInfo ? window.VemmFileInfo.rows(item) : [];
        var fileInfo = null;
        if (fileInfoRows.length) {
            fileInfo = element("section", "file-info-panel");
            fileInfo.hidden = true;
            fileInfo.setAttribute("role", "dialog");
            fileInfo.setAttribute("aria-modal", "true");
            fileInfo.setAttribute("aria-label", translate("File information"));
            fileInfo.appendChild(element("h2", "", translate("File information")));
            // One collapsed section per version/part and kind of track; Enter opens it, Up and Down walk the headings.
            var sections = [];
            fileInfoRows.forEach(function (row) {
                var key = row.version + "/" + row.part + "/" + row.trackType;
                var section = sections.filter(function (entry) { return entry.key === key; })[0];
                if (!section) {
                    var title = translate(row.trackType === "Subtitle" ? "Subtitles" : row.trackType || "General");
                    if (fileInfoRows[fileInfoRows.length - 1].version > 1) { title = translate("Version {number}", { number: row.version }) + " / " + title; }
                    if (row.part) { title += " / " + translate("Part {number}", { number: row.part }); }
                    section = { key: key, title: title, rows: [] };
                    sections.push(section);
                }
                section.rows.push(row);
            });
            // The panel scrolls; keep the focused heading or button inside it.
            var revealInPanel = function (node) {
                var box = fileInfo.getBoundingClientRect();
                var at = node.getBoundingClientRect();
                if (at.top < box.top + 8) { fileInfo.scrollTop -= box.top + 8 - at.top; }
                else if (at.bottom > box.bottom - 8) { fileInfo.scrollTop += at.bottom - box.bottom + 8; }
            };
            sections.forEach(function (section) {
                var body = element("div", "file-info-body");
                body.hidden = true;
                var lastTrack = null;
                section.rows.forEach(function (row) {
                    if (row.track > 1 && row.track !== lastTrack) {
                        body.appendChild(element("p", "file-info-track", translate(row.trackType) + " " + row.track));
                    }
                    lastTrack = row.track;
                    var fact = element("p", "file-info-row");
                    fact.appendChild(element("span", "file-info-label", translate(row.label) + ": "));
                    fact.appendChild(element("span", "file-info-value", row.value));
                    body.appendChild(fact);
                });
                var heading = button(fileInfo, section.title, function () {
                    body.hidden = !body.hidden;
                    heading.setAttribute("aria-expanded", String(!body.hidden));
                    revealInPanel(heading);
                }, true);
                heading.className += " file-info-heading";
                heading.setAttribute("aria-expanded", "false");
                fileInfo.appendChild(body);
            });
            button(fileInfo, "Close menu", function () {
                fileInfo.hidden = true;
                moreButton.focus();
            });
            var panelButtons = Array.prototype.slice.call(fileInfo.querySelectorAll("button"));
            panelButtons.forEach(function (node) {
                node.addEventListener("focus", function () { revealInPanel(node); });
            });
            // Up/Down page through an expanded section taller than the panel before moving to the next heading.
            fileInfo.addEventListener("keydown", function (event) {
                var down = event.keyCode === 40;
                var at = panelButtons.indexOf(document.activeElement);
                if ((!down && event.keyCode !== 38) || at < 0) { return; }
                var heading = panelButtons[down ? at : at - 1];
                var target = panelButtons[at + (down ? 1 : -1)];
                if (!target || !heading || heading.getAttribute("aria-expanded") !== "true") { return; }
                var box = fileInfo.getBoundingClientRect();
                var rect = target.getBoundingClientRect();
                if (down ? rect.bottom <= box.bottom - 8 : rect.top >= box.top + 8) { return; }
                event.preventDefault();
                event.stopPropagation();
                fileInfo.scrollTop += (down ? 1 : -1) * Math.round(fileInfo.clientHeight * 0.6);
            });
            detailAction(more, "File information", "info", function () {
                fileInfo.hidden = false;
                more.hidden = true;
                moreButton.setAttribute("aria-expanded", "false");
                fileInfo.querySelector(".file-info-heading").focus();
            });
        }
        var onDeck = item.OnDeck && item.OnDeck.Metadata;
        if (Array.isArray(onDeck)) { onDeck = onDeck[0]; }
        if (item.type === "show" && onDeck && onDeck.type === "episode" && onDeck.ratingKey) {
            var nextEpisode = onDeck;
            var nextPlay = detailAction(actions, nextEpisode.viewOffset ? "Resume" : "Play next episode", "play", function () {
                playFromCard(nextEpisode, client, true);
            });
            nextPlay.className = "detail-pill detail-primary detail-pill-play";
            preloadOnFocus(nextPlay, client, function () { return cardTarget(nextEpisode, client, true); });
            if (nextEpisode.viewOffset) {
                preloadOnFocus(detailAction(actions, "Play from beginning", "restart", function () { playFromCard(nextEpisode, client, false); }),
                    client, function () { return cardTarget(nextEpisode, client, false); });
            }
        }
        if (playable) {
            var primary = detailAction(actions, item.viewOffset ? "Resume" : "Play", "play", function () {
                startPlayer(item, client, item.viewOffset || 0);
            });
            primary.className = "detail-pill detail-primary detail-pill-play";
            var video = item.type !== "track";
            if (video) { preloadOnFocus(primary, client, function () { return Promise.resolve({ item: item, offset: item.viewOffset || 0 }); }); }
            if (item.viewOffset) {
                var restart = detailAction(actions, "Play from beginning", "restart", function () { startPlayer(item, client, 0); });
                if (video) { preloadOnFocus(restart, client, function () { return Promise.resolve({ item: item, offset: 0 }); }); }
            }
            if ((item.Media || []).length > 1) {
                item.Media.forEach(function (media, index) {
                    detailAction(more, translate("Version {number}", { number: index + 1 }) + "  ·  " +
                        [media.videoResolution ? String(media.videoResolution).toUpperCase() : "", media.videoCodec || ""].filter(Boolean).join(" "),
                    "", function () { startPlayer(item, client, 0, index); }, true);
                });
            }
        }
        if (item.type === "album") {
            detailAction(actions, "Play album", "play", function () { startAlbum(item, client, false); }).className =
                "detail-pill detail-primary detail-pill-play";
            detailAction(actions, "Shuffle album", "shuffle", function () { startAlbum(item, client, true); });
        }
        if (item.type === "playlist") {
            var listKind = window.VemmPlaylists.kind(item);
            if (listKind === "video" || listKind === "audio") {
                detailAction(actions, "Play", "play", function () { startPlaylist(item, client, false); }).className =
                    "detail-pill detail-primary detail-pill-play";
                detailAction(actions, "Shuffle", "shuffle", function () { startPlaylist(item, client, true); });
            }
            var listed = detailAction(actions, "Items", "list", function () { visit(function () { openPlaylistItems(item, client); }); });
            if (listKind !== "video" && listKind !== "audio") { listed.className = "detail-pill detail-primary detail-pill-list"; }
        }
        if (item.type === "photo") {
            detailAction(actions, "View photo", "play", function () { visit(function () { openPhotos([item], 0, client); }); }).className =
                "detail-pill detail-primary detail-pill-play";
        }
        if (["show", "season", "collection", "artist", "album", "photoalbum"].indexOf(item.type) !== -1) {
            var childLabel = item.type === "show" ? "Seasons" : item.type === "season" ? "Episodes" :
                item.type === "artist" ? "Albums" : item.type === "album" ? "Tracks" :
                    item.type === "photoalbum" ? "Photos" : "Collection items";
            var children = detailAction(actions, childLabel, "list", function () {
                visit(function () {
                    openListing(item.title, function (offset) {
                        return item.type === "collection" ? client.getCollectionItems(item.ratingKey, offset) :
                            client.getChildren(item.ratingKey, offset);
                    }, client);
                });
            });
            if (item.type !== "album" && !(item.type === "show" && nextEpisode)) {
                children.className = "detail-pill detail-primary detail-pill-list";
            }
        }
        if (["movie", "episode", "show", "season"].indexOf(item.type) !== -1) {
            // LG parity: the toggle that applies is a direct hero action; its opposite stays in More.
            var leafCount = Number(item.leafCount) || 0;
            var fullyWatched = item.type === "show" || item.type === "season" ?
                leafCount > 0 && Number(item.viewedLeafCount) >= leafCount : Number(item.viewCount) > 0 && !item.viewOffset;
            detailAction(fullyWatched ? more : actions, "Mark watched", "watched", function () { confirmWatchAction(item, client, "watched"); });
            detailAction(fullyWatched ? actions : more, "Mark unwatched", "unwatched", function () { confirmWatchAction(item, client, "unwatched"); });
        }
        var trailer = window.VemmItemMenu && window.VemmItemMenu.trailerFor(item);
        if (trailer) {
            detailAction(more, "Play trailer", "play", function () { playFromCard(trailer, client, false); });
        }
        var plexGuid = /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(item.guid || "") ? item.guid :
            (item.Guid || []).filter(function (guid) { return /^plex:\/\/(?:movie|show)\/[0-9a-f]{24}$/i.test(guid.id || ""); })[0];
        if (plexGuid && accountClient) {
            var guid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            detailAction(more, "Add to Watchlist", "add", function () {
                var linked = accountClient;
                confirmServiceWrite("Add to Watchlist", function () { return linked.setWatchlist(guid, true); },
                    function () { openDetail(item.ratingKey, client); });
            });
        }
        if (["movie", "episode"].indexOf(item.type) !== -1) {
            detailAction(more, "Remove from Continue Watching", "", function () { confirmWatchAction(item, client, "remove"); });
        }
        if (plexGuid && currentServerId && client === currentClient && servers.length > 1 && (item.type === "movie" || item.type === "show")) {
            var copyGuid = typeof plexGuid === "string" ? plexGuid : plexGuid.id;
            detailAction(more, "Other servers", "", function () {
                visit(function () {
                    findCatalogueItem({ type: item.type, guid: copyGuid, title: item.title }, {
                        exclude: currentServerId, title: "Other servers", labelled: true
                    });
                });
            });
        }
        if (item.type !== "playlist") { detailAction(more, "Related titles", "", function () {
            visit(function () {
                openListing("Related titles", function () {
                    return client.getRelated(item.ratingKey).then(function (container) {
                        var items = [];
                        (container.Hub || []).forEach(function (hub) { items = items.concat(hub.Metadata || []); });
                        return { Metadata: items.slice(0, 200) };
                    });
                }, client);
            });
        }); }
        var moreButton = detailAction(actions, "More", "more", function () {
            more.hidden = !more.hidden;
            moreButton.setAttribute("aria-expanded", String(!more.hidden));
            if (!more.hidden) { more.querySelector("button").focus(); }
        });
        moreButton.className += " round-control";
        moreButton.setAttribute("aria-label", translate("More"));
        moreButton.setAttribute("aria-expanded", "false");
        if (item.type === "playlist") { actions.removeChild(moreButton); }
        main.appendChild(more);

        var directors = (item.Director || []).slice(0, 2).map(function (person) { return person.tag; }).filter(Boolean);
        var stars = (item.Role || []).slice(0, 3).map(function (person) { return person.tag; }).filter(Boolean);
        if (directors.length || stars.length) {
            var people = element("div", "detail-people");
            [["Directed by", directors], ["Starring", stars]].forEach(function (row) {
                if (!row[1].length) { return; }
                var line = element("p", "detail-people-line");
                line.appendChild(element("span", "detail-people-label", translate(row[0]) + " "));
                line.appendChild(element("span", "", row[1].join(", ")));
                people.appendChild(line);
            });
            hero.appendChild(people);
        }
        screen.appendChild(hero);
        if (fileInfo) { screen.appendChild(fileInfo); }

        var credits = (item.Role || []).concat(item.Director || [], item.Writer || []).slice(0, 60);
        if (credits.length) {
            var cast = element("section", "detail-section");
            cast.appendChild(element("h3", "detail-section-title", translate("Cast & Crew")));
            var row = element("div", "detail-cast-row");
            credits.forEach(function (person) {
                var node = button(row, person.tag || "Cast", function () {
                    visit(function () { openPerson(person, client); });
                }, true);
                node.className = "detail-person";
                var face = element("img", "detail-person-photo");
                face.alt = "";
                node.appendChild(face);
                var role = person.role || (item.Director || []).indexOf(person) !== -1 && translate("Director") ||
                    (item.Writer || []).indexOf(person) !== -1 && translate("Writer") || "";
                if (role) { node.appendChild(element("span", "detail-person-role", role)); }
                queueImage(face, client, person.thumb, { width: 200, height: 200 });
            });
            cast.appendChild(row);
            screen.appendChild(cast);
        }
        var extras = item.Extras && item.Extras.Metadata || [];
        if (extras.length) {
            var shelf = element("section", "shelf detail-section");
            shelf.appendChild(element("h3", "detail-section-title", translate("Extras and trailers")));
            var extrasRow = element("div", "shelf-row");
            shelf.appendChild(extrasRow);
            extras.slice(0, 20).forEach(function (extra) { card(extrasRow, extra, client); });
            screen.appendChild(shelf);
        }
        setStatus("Choose Play or Resume to start playback. Browsing does not update watch history.");
        var restoringFocus = !!pendingRestore;
        focusFirst();
        if (playable && !restoringFocus) { primary.focus(); }
    }

    function confirmWatchAction(item, client, action) {
        visit(function () {
            var generation = ++viewGeneration;
            clear(screen);
            var label = action === "remove" ? "Remove from Continue Watching" :
                action === "watched" ? "Mark watched" : "Mark unwatched";
            page(label, "confirmation");
            screen.appendChild(element("p", "synopsis", item.title || "Selected item"));
            screen.appendChild(element("p", "help-text", action === "remove" ?
                "Hide this item from Continue Watching without clearing its resume position." :
                action === "unwatched" ? "This clears watched status and the saved resume position on Plex." :
                    "This changes watched status on Plex."));
            if (item.type === "show" || item.type === "season") {
                screen.appendChild(element("p", "help-text", translate("This changes every episode in this show or season.")));
            }
            var pending = false;
            var confirm = button(screen, translate(action === "remove" ? "Confirm remove from continue watching" :
                action === "unwatched" ? "Confirm mark unwatched" : "Confirm mark watched"), function () {
                if (pending || generation !== viewGeneration) { return; }
                pending = true;
                confirm.disabled = true;
                cancel.textContent = translate("Back to details");
                setStatus("Saving the explicit change to Plex...");
                Promise.resolve().then(function () {
                    return action === "remove" ? client.removeContinueWatching(item.ratingKey) :
                        client.setWatched(item.ratingKey, action === "watched");
                }).then(function () {
                    if (generation !== viewGeneration) { return; }
                    setStatus("Plex accepted the change. Refreshing details...");
                    return client.getMetadata(item.ratingKey).then(function (updated) {
                        if (generation !== viewGeneration) { return; }
                        navigation.pop();
                        renderDetail(updated, client);
                        setStatus("Plex accepted the change; details were refreshed.");
                    }).catch(function () {
                        if (generation === viewGeneration) {
                            setStatus("Plex accepted the change, but details could not be refreshed. Go back and retry loading details.", true);
                        }
                    });
                }, function (error) {
                    if (generation !== viewGeneration) { return; }
                    pending = false;
                    confirm.disabled = false;
                    cancel.textContent = translate("Cancel");
                    setStatus(translate("{message} {warning}", { message: translate("Plex did not confirm the change. Check the server state before retrying."), warning: errorText(error) }), true);
                });
            });
            var cancel = button(screen, "Cancel", backView);
            restoreView = function () { renderDetail(item, client); };
            setStatus("Nothing changes until you confirm. This affects the selected Plex profile.");
            focusFirst();
        });
    }

    function timeLabel(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        var minutes = Math.floor(seconds / 60);
        var rest = ("0" + seconds % 60).slice(-2);
        return minutes >= 60 ? Math.floor(minutes / 60) + ":" + ("0" + minutes % 60).slice(-2) + ":" + rest : minutes + ":" + rest;
    }

    function playerRemaining(position, duration) {
        return "-" + chapterTimeLabel(Math.max(0, duration - position));
    }

    function chapterTimeLabel(ms) {
        var seconds = Math.max(0, Math.floor(ms / 1000));
        return ("0" + Math.floor(seconds / 60)).slice(-2) + ":" + ("0" + seconds % 60).slice(-2);
    }

    function currentPlayerPosition() {
        if (!player) { return playerPosition; }
        var snapshot = player.snapshot();
        return snapshot.position || playerPosition || 0;
    }

    function closePlayerPanel() {
        var panel = document.getElementById("player-info") || document.getElementById("chapter-strip");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
        playerPanel = "";
    }

    function closeUpNext() {
        upNextGeneration += 1;
        var panel = document.getElementById("up-next-panel");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
    }

    // Where a scrub or seek is headed, so the timeline shows it instead of the old playhead.
    function pendingPlayhead() {
        if (scrubOwner === player && scrubTarget !== null) { return scrubTarget; }
        if (seekOwner === player && queuedSeek !== null) { return queuedSeek; }
        if (seekOwner === player && seekInFlight !== null) { return seekInFlight; }
        return null;
    }

    // The TV's screensaver stays off while the picture plays and is back at its default whenever it does not.
    function keepScreenAwake(awake) {
        if (window.VemmScreensaver) { window.VemmScreensaver.keepAwake(awake); }
    }

    // "Ends at 10:42 PM" for something with remaining ms left, by the TV's clock; "" when unknown.
    function endsAtLabel(remaining) {
        return window.VemmEndsAt && remaining > 0 ?
            translate("Ends at {time}", { time: window.VemmEndsAt.time(remaining, preferences.language) }) : "";
    }

    function showPreview(position, duration) {
        var progress = document.getElementById("playback-progress");
        if (previewThumbs && progress && duration > 0) { previewThumbs.show(position, position / duration, progress); }
    }

    function hidePreview() {
        if (previewThumbs) { previewThumbs.hide(); }
    }

    function closePreview() {
        if (previewThumbs) { previewThumbs.close(); previewThumbs = null; }
    }

    // Draws the clocks and the timeline at position. The bar and its scrubber move by transform
    // only, so a time update is a compositor move with no layout.
    function showPlayhead(position, duration) {
        var elapsed = document.querySelector && document.querySelector(".playback-elapsed");
        var remaining = document.querySelector && document.querySelector(".playback-remaining");
        var progress = document.getElementById("playback-progress");
        if (elapsed) { elapsed.textContent = timeLabel(position); }
        if (remaining) { remaining.textContent = playerRemaining(position, duration); }
        var ends = document.querySelector && document.querySelector(".playback-ends");
        if (ends) { ends.textContent = endsAtLabel(duration - position); }
        if (!progress || !(duration > 0)) { return; }
        progress.setAttribute("aria-valuemax", String(duration));
        progress.setAttribute("aria-valuenow", String(Math.round(position)));
        progress.setAttribute("aria-valuetext", timeLabel(position) + " / " + timeLabel(duration));
        var share = Math.min(1, Math.max(0, position / duration));
        var fill = progress.querySelector(".playback-progress-fill");
        var knob = progress.querySelector(".playback-knob-track");
        if (fill) { fill.style.transform = "scaleX(" + share + ")"; }
        if (knob) { knob.style.transform = "translateX(" + share * 100 + "%)"; }
    }

    function updatePlayerClocks(position, duration) {
        playerPosition = Math.max(0, position || 0);
        playerDuration = Math.max(0, duration || playerDuration || 0);
        var pending = pendingPlayhead();
        showPlayhead(pending !== null ? pending : playerPosition, playerDuration);
        var panelPosition = document.querySelector && document.querySelector(".player-info-position");
        if (panelPosition) {
            panelPosition.textContent = translate("Playing") + ": " + timeLabel(playerPosition) +
                " / " + timeLabel(playerDuration);
        }
        var statsPosition = document.querySelector && document.querySelector(".playback-stats-position");
        if (statsPosition) {
            statsPosition.textContent = translate("Position") + ": " + timeLabel(playerPosition) +
                " / " + timeLabel(playerDuration);
        }
    }

    function trackBadge(stream) {
        if (!stream) { return ""; }
        var labels = [];
        if (stream.streamType === 3 && (stream.hearingImpaired || stream.key === "sdh")) { labels.push("SDH"); }
        else if (stream.streamType === 3 && (stream.key === "cc" || stream.closedCaptions)) { labels.push("CC"); }
        if (stream.streamType === 2 && (stream.audioDescription === true ||
                stream.audioDescription === 1 || stream.audioDescription === "1" ||
                /audio description/i.test(stream.displayTitle || ""))) { labels.push("AD"); }
        if (stream.forced === true || stream.forced === 1 || stream.forced === "1") { labels.push(translate("Forced")); }
        return labels.join(" / ");
    }

    function openPlayerPanel(name) {
        if (!player) { return; }
        cancelHudTimer();
        var menu = document.getElementById("player-menu");
        if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
        closePlayerPanel();
        playerPanel = name;
        var panel = element("section", "player-overlay-panel " + (name === "chapters" ? "chapter-strip" : "player-info"));
        panel.id = name === "chapters" ? "chapter-strip" : "player-info";
        panel.setAttribute("aria-label", translate(name === "chapters" ? "Chapters" : "Info"));
        if (name === "chapters") {
            var chapters = playerItem.Chapter || [];
            var position = currentPlayerPosition();
            var selected = -1;
            var focusCard = null;
            chapters.forEach(function (chapter, index) {
                var start = Number(chapter.startTimeOffset) || 0;
                var next = chapters[index + 1];
                if (position >= start && (!next || position < (Number(next.startTimeOffset) || 0))) { selected = index; }
            });
            chapters.forEach(function (chapter, index) {
                var card = button(panel, "", function () {
                    seekToPlayer(Number(chapter.startTimeOffset) || 0);
                    closePlayerPanel();
                    showHud();
                }, false, "none");
                card.className += " chapter-card" + (index === selected ? " chapter-card-current" : "");
                if (index === selected) { focusCard = card; }
                card.setAttribute("aria-label", (chapter.tag || translate("Chapter {number}", { number: index + 1 })) +
                    ", " + chapterTimeLabel(Number(chapter.startTimeOffset) || 0));
                if (chapter.thumb) {
                    var image = element("img", "chapter-card-art");
                    image.alt = "";
                    image.src = placeholderArt();
                    image.setAttribute("data-artwork-source", chapter.thumb);
                    card.appendChild(image);
                    queueImage(image, playerClient, chapter.thumb, { width: 480, height: 270 });
                }
                card.appendChild(element("span", "chapter-card-title",
                    chapter.tag || translate("Chapter {number}", { number: index + 1 })));
                card.appendChild(element("span", "chapter-card-time", chapterTimeLabel(Number(chapter.startTimeOffset) || 0)));
            });
            if (!focusCard && panel.querySelector("button")) { focusCard = panel.querySelector("button"); }
            if (!chapters.length) { panel.appendChild(element("p", "", translate("No chapters available."))); }
        } else {
            var artwork = element("img", "info-artwork");
            artwork.alt = "";
            artwork.src = placeholderArt();
            panel.appendChild(artwork);
            if (playerItem.thumb || playerItem.grandparentThumb || playerItem.art) {
                queueImage(artwork, playerClient, playerItem.thumb || playerItem.grandparentThumb || playerItem.art,
                    { width: 480, height: 270 });
            }
            var details = element("div", "player-info-details");
            details.appendChild(element("h2", "", playerItem.title || "Untitled"));
            var context = playerItem.grandparentTitle ?
                playerItem.grandparentTitle + (playerItem.parentTitle ? " / " + playerItem.parentTitle : "") +
                    (playerItem.index ? " / " + translate("Episode {number}", { number: playerItem.index }) : "") : "";
            if (context) { details.appendChild(element("p", "player-info-context", context)); }
            if (playerItem.summary) { details.appendChild(element("p", "player-info-summary", playerItem.summary)); }
            var facts = element("div", "player-info-facts");
            facts.appendChild(element("span", "player-info-position", translate("Playing") + ": " +
                timeLabel(currentPlayerPosition()) + " / " + timeLabel(Number(playerItem.duration) || playerDuration)));
            if (playerItem.year) { facts.appendChild(element("span", "", String(playerItem.year))); }
            if (playerItem.contentRating) { facts.appendChild(element("span", "", playerItem.contentRating)); }
            if (playerItem.rating) { facts.appendChild(element("span", "", translate("Rating") + ": " + playerItem.rating)); }
            var current = player.snapshot();
            var media = (playerItem.Media || [])[playerSettings.mediaIndex] || (playerItem.Media || [])[0] || {};
            var streams = media.Part && media.Part[0] && media.Part[0].Stream || [];
            var selection = player.selection();
            var selectedAudio = streams.filter(function (stream) {
                return stream.streamType === 2 && String(stream.id) === String(selection.audioId);
            })[0];
            facts.appendChild(element("span", "", translate("Video") + ": " +
                (current.videoCodec || media.videoCodec || translate("Unknown"))));
            facts.appendChild(element("span", "", translate("Audio") + ": " +
                (current.audioCodec || selectedAudio && selectedAudio.codec || media.audioCodec || translate("Unknown"))));
            facts.appendChild(element("span", "", translate("Playback") + ": " + modeName(player.quality().mode)));
            streams.forEach(function (stream) {
                var badge = trackBadge(stream);
                if (badge) { facts.appendChild(element("span", "player-info-badge", badge)); }
            });
            details.appendChild(facts);
            var actions = element("div", "player-info-actions");
            button(actions, "Close", closePlayerPanel);
            panel.appendChild(details);
            panel.appendChild(actions);
            focusCard = panel.querySelector("button");
        }
        screen.appendChild(panel);
        if (focusCard) { focusCard.focus(); }
        showHud();
    }

    function updateSubtitleTimingLabel() {
        var label = document.querySelector && document.querySelector(".subtitle-timing-value");
        if (!label) { return; }
        var delay = preferences.subtitleDelayMs || 0;
        label.textContent = (delay > 0 ? "+" : "") + (delay / 1000).toFixed(1) + " s";
    }

    function subtitleTimingRange() {
        return playerSettings && playerSettings.subtitleSidecar ? [-60000, 60000] : [0, 60000];
    }

    function storeSubtitleDelay(delay) {
        var range = subtitleTimingRange();
        var next = Math.max(range[0], Math.min(range[1], delay));
        var previous = preferences.subtitleDelayMs;
        preferences.subtitleDelayMs = next;
        if (!savePreferences()) {
            preferences.subtitleDelayMs = previous;
            updateSubtitleTimingLabel();
            return false;
        }
        updateSubtitleTimingLabel();
        var text = document.getElementById("subtitle-text");
        if (text && externalCues) {
            text.textContent = window.VemmSubtitles.at(externalCues, currentPlayerPosition() - next);
        }
        setStatus(translate("Subtitle delay: {value}", {
            value: (next > 0 ? "+" : "") + (next / 1000).toFixed(1) + " s"
        }));
        return true;
    }

    function openSubtitleTiming() {
        if (!player) { return; }
        var range = subtitleTimingRange();
        var bounded = Math.max(range[0], Math.min(range[1], preferences.subtitleDelayMs));
        if (bounded !== preferences.subtitleDelayMs && !storeSubtitleDelay(bounded)) { return; }
        cancelHudTimer();
        var menu = document.getElementById("player-menu");
        if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
        var old = document.getElementById("subtitle-timing");
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        subtitleTiming = true;
        subtitleTimingRepeats = 0;
        subtitleTimingDirection = 0;
        subtitleTimingDetentUntil = 0;
        var panel = element("section", "subtitle-timing");
        panel.id = "subtitle-timing";
        panel.setAttribute("role", "group");
        panel.appendChild(element("h2", "", translate("Subtitle timing")));
        panel.appendChild(element("p", "subtitle-timing-value", ""));
        panel.appendChild(element("p", "help-text", translate(
            "Use LEFT and RIGHT to adjust. OK or Back closes this control.")));
        button(panel, "Close", closeSubtitleTiming);
        screen.appendChild(panel);
        updateSubtitleTimingLabel();
        panel.querySelector("button").focus();
        showHud();
    }

    function closeSubtitleTiming() {
        subtitleTiming = false;
        subtitleTimingRepeats = 0;
        subtitleTimingDirection = 0;
        subtitleTimingDetentUntil = 0;
        var panel = document.getElementById("subtitle-timing");
        if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
        showHud();
    }

    function adjustSubtitleTiming(direction, repeat) {
        if (!subtitleTiming || !externalCues) { return; }
        var now = Date.now();
        if (!repeat) {
            subtitleTimingRepeats = 0;
            subtitleTimingDirection = direction;
            subtitleTimingDetentUntil = 0;
        } else {
            if (direction !== subtitleTimingDirection) {
                subtitleTimingRepeats = 0;
                subtitleTimingDirection = direction;
            }
            if (now < subtitleTimingDetentUntil) { return; }
            subtitleTimingDetentUntil = 0;
            subtitleTimingRepeats += 1;
        }
        var step = repeat && subtitleTimingRepeats >= 8 ? 500 : 100;
        var current = preferences.subtitleDelayMs;
        var next = current + direction * step;
        if (repeat && current !== 0 && (next === 0 || (next < 0) !== (current < 0))) {
            next = 0;
            subtitleTimingDetentUntil = now + 600;
        }
        storeSubtitleDelay(next);
    }

    // The TV memory, storage and Vemm use. done gets null when the helper is not loaded.
    function readDeviceStats(done) {
        if (!window.VemmDeviceStats) { done(null); return; }
        window.VemmDeviceStats.read({ tizen: window.tizen, performance: window.performance, navigator: window.navigator }, done);
    }

    // The readout lines worth showing; a reading that is not available is left out.
    function deviceStatsLines(done) {
        readDeviceStats(function (stats) { done(stats ? window.VemmDeviceStats.lines(stats, translate) : []); });
    }

    function stopStatsTimer() {
        if (statsTimer !== null) { clearInterval(statsTimer); statsTimer = null; }
    }

    // The buffer in use and the connection speed it was sized from.
    function bufferStats() {
        var buffer = player.buffer && player.buffer();
        var speed = playerSettings && playerSettings.mbps;
        var lines = [];
        if (buffer) {
            lines.push(translate("Buffer") + ": " + translate("{play} s to start or seek, {resume} s after a stall",
                { play: buffer.fallback ? 1 : buffer.play, resume: buffer.resume }) +
                (buffer.fallback ? " (" + translate("the TV refused {seconds} s", { seconds: buffer.play }) + ")" : ""));
        }
        if (speed) { lines.push(translate("Connection") + ": " + translate("{mbps} Mbps", { mbps: Math.round(speed * 10) / 10 })); }
        return lines;
    }

    function togglePlayerStats() {
        if (!player) { return; }
        var old = document.getElementById("playback-stats");
        if (old) {
            stopStatsTimer();
            old.parentNode.removeChild(old);
            playerStatsVisible = false;
            showHud();
            return;
        }
        playerStatsVisible = true;
        var stats = element("aside", "playback-stats");
        stats.id = "playback-stats";
        stats.setAttribute("aria-label", translate("Stats for nerds"));
        stats.appendChild(element("h2", "", translate("Stats for nerds")));
        var snapshot = player.snapshot();
        var quality = player.quality();
        var decision = quality.explanation || {};
        var developer = devMode();
        [
            translate("Playback") + ": " + modeName(quality.mode)
        ].concat(developer ? [
            translate("Reason") + ": " + reasonName(decision.reason),
            translate("Fallback") + ": " + fallbackName(decision.fallback),
            translate("Capability evidence") + ": " + capabilityName(decision.capability)
        ] : [], [
            translate("Position") + ": " + timeLabel(snapshot.position) + " / " + timeLabel(snapshot.duration),
            translate("Video") + ": " + qualityLabel(quality.mode === "direct" ? quality.source : quality.stream),
            translate("Quality") + ": " + qualityChoiceName(quality.limit, quality.source || {},
                qualityTop(quality.source, quality.mode === "direct")),
            translate("State") + ": " + translate(snapshot.state)
        ], developer ? bufferStats() : []).forEach(function (line) {
            stats.appendChild(element("p", line.indexOf(translate("Position") + ": ") === 0 ? "playback-stats-position" : "", line));
        });
        // Refreshed every few seconds for as long as the panel is open.
        var device = element("div", "playback-stats-device");
        stats.appendChild(device);
        function refreshDevice() {
            deviceStatsLines(function (lines) {
                clear(device);
                lines.forEach(function (line) { device.appendChild(element("p", "", line)); });
            });
        }
        if (developer) { refreshDevice(); }
        stopStatsTimer();
        if (developer) { statsTimer = setInterval(function () {
            if (document.getElementById("playback-stats")) { refreshDevice(); } else { stopStatsTimer(); }
        }, 2500); }
        button(stats, "Close", function () {
            stopStatsTimer();
            if (stats.parentNode) { stats.parentNode.removeChild(stats); }
            playerStatsVisible = false;
            showHud();
        });
        screen.appendChild(stats);
        stats.querySelector("button").focus();
        showHud();
    }

    function showUpNext(watchCredits) {
        var listQueue = activePlaylist();
        if (!player || !listQueue && (playerItem.type !== "episode" || !playerClient.nextEpisode)) { return null; }
        closeUpNext();
        var generation = upNextGeneration;
        var panel = element("section", "up-next-card");
        panel.id = "up-next-panel";
        panel.setAttribute("aria-label", translate("Up Next"));
        panel.appendChild(element("h2", "", translate("Up Next")));
        var countdown = element("p", "up-next-countdown", translate("Next episode starts in {seconds}s", { seconds: 10 }));
        panel.appendChild(countdown);
        var watch = button(panel, "Watch Credits", function () {
            closeUpNext();
            if (typeof watchCredits === "function") { watchCredits(); }
        });
        var card = element("div", "up-next-pending", translate("Loading next episode..."));
        panel.appendChild(card);
        screen.appendChild(panel);
        (listQueue ? Promise.resolve(queueSuccessor(listQueue)) : playerClient.nextEpisode(playerItem)).then(function (next) {
            if (generation !== upNextGeneration || !panel.parentNode || !next) { return; }
            clear(card);
            card.className = "up-next-pending";
            var image = element("img", "up-next-artwork");
            image.alt = "";
            image.src = placeholderArt();
            if (next.thumb || next.art) { queueImage(image, playerClient, next.thumb || next.art, { width: 480, height: 270 }); }
            card.appendChild(image);
            card.appendChild(element("span", "", next.title || translate("Next Episode")));
            button(panel, "Next Episode", function () {
                closeUpNext();
                finishEpisode(true, next);
            });
        }).catch(function (error) {
            if (generation === upNextGeneration) {
                card.textContent = translate("The next episode could not be loaded.") + " " + errorText(error);
            }
        });
        watch.focus();
        return countdown;
    }

    function openPerson(person, client, careerStart) {
        var generation = ++viewGeneration;
        clear(screen);
        viewClients.push(client);
        resetImages();
        restoreView = function () { openPerson(person, client, careerStart); };
        retryView = restoreView;
        page(person.tag || "Person", "person");
        var portrait = element("img", "person-portrait");
        portrait.alt = "";
        portrait.src = placeholderArt();
        screen.appendChild(portrait);
        queueImage(portrait, client, person.thumb, { width: 360, height: 360 });
        if (person.role) { screen.appendChild(element("p", "detail-meta", person.role)); }
        button(screen, "Titles in this server", function () {
            visit(function () {
                openListing(person.tag || "Person", function (offset) {
                    return client.getPerson(null, person.id, offset);
                }, client);
            });
        });
        button(screen, "Back", backView);
        setStatus(accountClient && person.tagKey ? "Loading..." : "Person biography and catalogue credits require a linked Plex account.");
        if (accountClient && person.tagKey) {
            accountClient.personProfile(person.tagKey).then(function (container) {
                if (generation !== viewGeneration) { return; }
                var profile = (container.Metadata || [])[0] || {};
                screen.appendChild(element("p", "synopsis", profile.summary || "No biography supplied by Plex."));
                if (profile.bornAt) {
                    screen.appendChild(element("p", "detail-meta", profile.bornAt + (profile.birthPlace ? " / " + profile.birthPlace : "")));
                }
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); focusFirst(); }
            });
            var localIndex = client.personLibraryIndex(person.id).catch(function () { return null; });
            Promise.all([accountClient.personCredits(person.tagKey), localIndex]).then(function (results) {
                var groups = results[0];
                var local = results[1];
                if (generation !== viewGeneration) { return; }
                var allCredits = [];
                var held = 0;
                groups.forEach(function (group) {
                    (group.Credit || []).forEach(function (credit) {
                        if (credit.Metadata) { allCredits.push({ group: group.title, credit: credit }); }
                    });
                });
                var career = element("section", "career-pages");
                screen.appendChild(career);
                function renderCareer(start) {
                    careerStart = start;
                    clear(career);
                    held = 0;
                    var credits;
                    var groupName;
                    allCredits.slice(start, start + 50).forEach(function (entry) {
                        var credit = entry.credit;
                        var title = credit.Metadata;
                        if (!credits || groupName !== entry.group) {
                            groupName = entry.group;
                            credits = element("section", "credit-list");
                            credits.appendChild(element("h3", "group-title", groupName || "Credits"));
                            career.appendChild(credits);
                        }
                        var label = (title.title || "Untitled") + (title.year ? " / " + title.year : "") +
                            (credit.role ? " / " + credit.role : "");
                        var ratingKey = local && window.PlexApi.matchCredit(local.index, title.ratingKey);
                        if (ratingKey) {
                            held += 1;
                            titleTile(credits, { title: label + " / " + translate("In this library"), thumb: title.thumb }, function () {
                                visit(function () { openDetail(ratingKey, client); });
                            }, client);
                        } else {
                            titleTile(credits, { title: label + " / " + translate("Search libraries"), thumb: title.thumb }, function () {
                                visit(function () { openSearch(title.title); });
                            }, client);
                        }
                    });
                    if (start > 0) {
                        button(career, "Previous page", function () { renderCareer(start - 50); }).focus();
                    }
                    if (start + 50 < allCredits.length) {
                        var nextPage = button(career, "Next page", function () { renderCareer(start + 50); });
                        if (start === 0 && document.activeElement && !screen.contains(document.activeElement)) { nextPage.focus(); }
                    }
                    setStatus(local ? translate("{count} credits are in this library.", { count: held }) +
                        (local.complete ? "" : " " + translate("Local title lookup reached its safety limit.")) :
                        translate("This server's titles could not be checked. Search libraries to find an available version."));
                }
                renderCareer(careerStart || 0);
                focusFirst();
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); focusFirst(); }
            });
        }
        focusFirst();
    }

    var RECONNECT_MS = 120000;
    var RECONNECT_REOPENS = 3;
    var STALL_MS = 6000;

    function showReconnecting(on) {
        var note = document.getElementById("reconnecting-note");
        if (!on) {
            if (note && note.parentNode) { note.parentNode.removeChild(note); }
            return;
        }
        if (note) { return; }
        // Reports failing are part of this, not news of their own.
        if (progressNoted) { progressNoted = false; setStatus(""); }
        note = element("p", "reconnecting-note", translate("Reconnecting..."));
        note.id = "reconnecting-note";
        note.setAttribute("role", "status");
        screen.appendChild(note);
    }

    // A start that failed without a word from Plex (no HTTP status) and not for a reason AVPlay names as the file's
    // own (unsupported, invalid): the connection again, so worth waiting for.
    function connectionFailure(error) {
        if (!error || error.status || error.code === "cancelled") { return false; }
        if (/^avplay-/.test(String(error.code || "")) && error.code !== "avplay-prepare-timeout") {
            return error.reason === "PLAYER_ERROR_CONNECTION_FAILED";
        }
        return true;
    }

    function endStallWatch() {
        if (stall.timer !== null) { clearTimeout(stall.timer); stall.timer = null; }
        if (stall.wait) { stall.wait.cancel(); stall.wait = null; showReconnecting(false); }
    }

    function cancelReconnect() {
        endStallWatch();
        if (reconnect) { reconnect.cancel(); reconnect = null; }
        showReconnecting(false);
    }

    // AVPlay waiting for over 6 s while the server does not answer reads as Reconnecting instead of a bare
    // percent. AVPlay gives up on its own after about half a minute, which reconnectPlayer then handles.
    function watchStall(buffering, owner) {
        if (!buffering) { endStallWatch(); return; }
        if (stall.timer !== null || stall.wait || reconnect) { return; }
        stall.timer = setTimeout(function () {
            stall.timer = null;
            if (player !== owner || playerClosing || !hudBuffering) { return; }
            var client = playerClient;
            stall.wait = window.VemmReconnect.create({
                limit: Infinity,
                probe: function () { return client.identity(); },
                onWait: function () { showReconnecting(true); },
                onUp: function () { stall.wait = null; showReconnecting(false); },
                onGiveUp: function () { /* never: the limit is endless */ }
            });
            stall.wait.start();
        }, STALL_MS);
    }

    // AVPlay lost the connection mid-playback. Calm state with a spinner while the server is asked again (1, 2, 4,
    // then every 8 s); once it answers, the title opens again where it stopped, as a Retry would. After about two
    // minutes, or three reopens that never played on (a bad file), the usual problem panel takes over.
    function reconnectPlayer(detail, pause) {
        var owner = player;
        if (!owner || playerClosing) { return; }
        cancelReconnect();
        if (reconnectOpens >= RECONNECT_REOPENS) { showPlayerError({ message: detail }); return; }
        if (!reconnectOpens) { reconnectSince = Date.now(); }
        var client = playerClient;
        setBufferRing(true);
        showReconnecting(true);
        showHud();
        reconnect = window.VemmReconnect.create({
            limit: Math.max(0, RECONNECT_MS - (Date.now() - reconnectSince)),
            probe: function () { return client.identity(); },
            onUp: function () {
                reconnect = null;
                if (player !== owner || playerClosing) { return; }
                reconnectOpens += 1;
                reconnectResume = true;
                recoverPlayer(false);
                // Closing the lost stream asks the server and may take a moment: the spinner stays up meanwhile.
                setBufferRing(true);
                showReconnecting(true);
            },
            onGiveUp: function () {
                reconnect = null;
                if (player !== owner || playerClosing) { return; }
                showReconnecting(false);
                showPlayerError(new Error(translate("Plex could not be reached. Check the network and retry.")));
            }
        });
        reconnect.start(pause);
    }

    function recoverPlayer(restart) {
        if (!player || playerClosing || !playerSettings) { return; }
        var failedPlayer = player;
        var item = playerItem;
        var client = playerClient;
        var settings = playerSettings;
        var snapshot = failedPlayer.snapshot();
        var position = restart ? 0 : (snapshot.position || playerPosition || settings.offset || 0);
        var tracks = {
            audioId: settings.audioId,
            subtitleId: settings.subtitleId,
            paused: wantsPause(),
            subtitleSidecar: settings.subtitleSidecar
        };
        if (settings.overlaySubtitle && externalCues) { tracks.cues = externalCues; }
        stopPlayer(function () { startPlayer(item, client, position, settings.mediaIndex, tracks); });
    }

    function showPlayerError(error) {
        dropStill();
        cancelReconnect();
        keepScreenAwake(false);
        var message = errorText(error) || translate("Playback failed. Stop and retry.");
        setStatus(message, true);
        setBufferRing(null);
        if (!player) { return; }
        cancelHudTimer();
        closePlayerPanel();
        var old = document.getElementById("playback-error");
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        var panel = element("section", "playback-error");
        panel.id = "playback-error";
        panel.setAttribute("role", "alertdialog");
        panel.appendChild(element("h2", "", translate("Playback problem")));
        panel.appendChild(element("p", "help-text", message));
        button(panel, "Retry playback", function () {
            recoverPlayer(false);
        });
        button(panel, "Restart", function () {
            recoverPlayer(true);
        });
        button(panel, "Stop playback", stopPlayer);
        button(panel, "Back", function () {
            if (panel.parentNode) { panel.parentNode.removeChild(panel); }
            showHud();
        });
        screen.appendChild(panel);
        panel.querySelector("button").focus();
        showHud();
    }

    function serviceView(title, restore, kind) {
        var generation = ++viewGeneration;
        clear(screen);
        resetImages();
        restoreView = restore;
        retryView = restore;
        page(translate(title), kind || "service");
        var toolbar = group(screen, "", "page-toolbar");
        button(toolbar, "Back", backView);
        setStatus("Loading...");
        focusLoading();
        return generation;
    }

    function openTelevision() {
        window.VemmTelevisionUi.create({
            client: function () { return currentClient; }, preferences: function () { return preferences; },
            screen: screen, view: serviceView, generation: function () { return viewGeneration; },
            element: element, button: button, translate: translate, visit: visit, back: backView,
            status: setStatus, focus: focusFirst, confirm: confirmServiceWrite,
            group: group, tile: titleTile
        }).open();
    }

    function catalogueUi() {
        return window.VemmCatalogueUi.create({
            account: function () { return accountClient; }, screen: screen, view: serviceView,
            generation: function () { return viewGeneration; }, element: element, button: button,
            translate: translate, visit: visit, status: setStatus, focus: focusFirst, confirm: confirmServiceWrite,
            find: findCatalogueItem, group: group, tile: titleTile,
            artwork: function () { return currentClient; }, restoring: function () { return !!pendingRestore; }
        });
    }

    // Exact plex:// GUID matches across reachable servers. "Other servers" (the LG alternate
    // sources panel) excludes the server you are on and labels each copy with its server and
    // resolution; OK opens that server's own detail page rather than swapping the playing copy,
    // because a resume position belongs to one copy.
    function findCatalogueItem(item, options) {
        options = options || {};
        var generation = serviceView(options.title || "Find in my libraries", function () { findCatalogueItem(item, options); });
        var targets = servers.length ? servers.filter(function (server) { return server.id !== options.exclude; }) : [null];
        if (!targets.length) { setStatus("No other servers are available to this profile."); return; }
        var index = 0, active = 0, finished = 0, shown = 0, failed = 0;
        function pump() {
            while (active < 2 && index < targets.length) {
                (function (server) {
                    active += 1;
                    (server ? window.PlexApi.selectServer(server, { onClient: function (client) {
                        if (generation !== viewGeneration) { return false; }
                        viewClients.push(client); return true;
                    } }).then(function (selected) { return selected.client; }) : Promise.resolve(currentClient))
                        .then(function (client) {
                            if (generation !== viewGeneration) { return; }
                            return client.getSections().then(function (sections) {
                                var matches = sections.filter(function (section) { return section.type === item.type; });
                                var chain = Promise.resolve();
                                matches.forEach(function (section) {
                                    chain = chain.then(function () {
                                        if (generation !== viewGeneration) { return; }
                                        return client.findGuid(section.key, item.guid).then(function (items) {
                                            if (generation !== viewGeneration) { return; }
                                            items.slice(0, 200 - shown).forEach(function (match) {
                                                if (options.labelled) {
                                                    var media = (match.Media || [])[0] || {};
                                                    screen.appendChild(element("p", "card-meta", [server ? server.name : "",
                                                        section.title, media.videoResolution ? media.videoResolution + (/^[0-9]+$/.test(media.videoResolution) ? "p" : "") : ""]
                                                        .filter(Boolean).join(" / ")));
                                                }
                                                card(screen, match, client); shown += 1;
                                            });
                                        });
                                    });
                                });
                                return chain;
                            });
                        }).catch(function (error) {
                            if (generation !== viewGeneration) { return; }
                            failed += 1;
                            screen.appendChild(element("p", "inline-error", errorText(error)));
                        }).then(function () {
                            active -= 1; finished += 1;
                            if (generation !== viewGeneration) { return; }
                            if (finished === targets.length) {
                                if (failed) { button(screen, "Retry", retryView); }
                                setStatus(failed ? "Some libraries could not be checked. Availability is incomplete." :
                                    shown ? (options.labelled ? "Other copies of this title. Each copy keeps its own resume position." :
                                        "Exact Plex GUID matches in your libraries.") : "This title is not available in the checked libraries.");
                                focusFirst();
                            } else { pump(); }
                        });
                }(targets[index++]));
            }
        }
        pump();
    }

    function confirmServiceWrite(title, write, refresh) {
        visit(function () {
            var generation = serviceView(title, refresh, "confirmation");
            screen.appendChild(element("p", "help-text", translate("This changes your Plex account or server. Nothing changes until you confirm.")));
            var pending = false;
            var confirm = button(screen, "Confirm", function () {
                if (pending || generation !== viewGeneration) { return; }
                pending = true; confirm.disabled = true;
                setStatus("Saving...");
                Promise.resolve().then(write).then(function () {
                    if (generation !== viewGeneration) { return; }
                    setStatus("Plex accepted the change.");
                    button(screen, "Refresh", refresh);
                }).catch(function (error) {
                    if (generation !== viewGeneration) { return; }
                    setStatus(translate("The change was not confirmed. Check Plex before retrying.") + " " + errorText(error), true);
                });
            });
            button(screen, "Cancel", backView);
            setStatus("Review the change before confirming.");
            focusFirst();
        });
    }

    function openPhotos(items, index, client) {
        viewGeneration += 1;
        clear(screen);
        viewClients.push(client);
        resetImages();
        screen.className = "screen screen-photos";
        restoreView = function () { openPhotos(items, index, client); };
        try {
            if (!window.URL || !window.URL.createObjectURL) { throw new Error("Photo display is unavailable in this runtime."); }
            var viewer = window.VemmPhotos.create({
                items: items, index: index, client: client, parent: screen, element: element,
                button: button, status: setStatus, translate: translate, urls: window.URL, back: backView
            });
            viewCleanup = viewer.close;
        } catch (error) { setStatus(errorText(error), true); button(screen, "Back", backView); }
        focusFirst();
    }

    // The play queue of the playlist being played, if any.
    function activePlaylist() {
        var queue = playerSettings && playerSettings.playQueue;
        return queue && queue.playlist ? queue : null;
    }

    function openPlaylists() {
        openListing("Playlists", function (offset) { return currentClient.getPlaylists(offset); }, currentClient);
    }

    // Choosing an item of a video playlist plays the playlist from that item.
    function openPlaylistItems(playlist, client) {
        var video = window.VemmPlaylists.kind(playlist) === "video";
        openListing(playlist.title, function (offset) { return client.getPlaylistItems(playlist.ratingKey, offset); }, client, 0, null, null,
            { open: video ? function (entry) { startPlaylist(playlist, client, false, entry); } : null });
    }

    function startPlaylist(playlist, client, shuffle, first) {
        if (playlistLoading || player || playerClosing) { return; }
        if (window.VemmPlaylists.kind(playlist) === "audio") { startAlbum(playlist, client, shuffle); return; }
        playlistLoading = true;
        var generation = viewGeneration;
        setStatus(translate("Loading playlist..."));
        // A manually entered server has no remembered id; the server states its own.
        (currentServerId ? Promise.resolve(currentServerId) : client.identity().then(function (identity) {
            return identity.machineIdentifier;
        })).then(function (machineId) {
            return client.createPlaylistPlayQueue(machineId, playlist.ratingKey, shuffle, first && first.ratingKey);
        }).then(function (queue) {
            var at = window.VemmPlaylists.selectedIndex(queue);
            if (at < 0) { throw new Error("This playlist has no available items."); }
            queue.playlist = String(playlist.ratingKey);
            return client.getMetadata(queue.items[at].ratingKey).then(function (metadata) {
                if (generation === viewGeneration && !player) {
                    playlistQueue = queue;
                    startPlayer(metadata, client, metadata.viewOffset || 0);
                }
            });
        }).catch(function (error) {
            if (generation === viewGeneration) { setStatus(errorText(error), true); }
        }).then(function () { playlistLoading = false; });
    }

    function startAlbum(item, client, shuffle) {
        if (musicLoading || player || playerClosing) { return; }
        musicLoading = true;
        var generation = viewGeneration;
        setStatus(translate("Loading music queue..."));
        client.getTracks(item.ratingKey, item.type === "playlist").then(function (tracks) {
            if (generation !== viewGeneration || player) { return; }
            musicQueue = window.VemmQueue.create(tracks);
            queueShuffle = shuffle;
            queueRepeat = "off";
            musicQueue.shuffle(shuffle);
            return client.getMetadata(musicQueue.current().ratingKey).then(function (track) {
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
            });
        }).catch(function (error) {
            if (generation === viewGeneration) { musicQueue = null; showPlayerError(error); }
        }).then(function () { musicLoading = false; });
    }

    function skipMusic(delta, automatic) {
        if (!player || !musicQueue || playerClosing || musicLoading) { return; }
        musicLoading = true;
        var client = playerClient;
        var previous = playerItem;
        stopPlayer(function () {
            var next = delta < 0 ? musicQueue.previous() : musicQueue.next(automatic);
            if (!next) {
                musicQueue = null; musicLoading = false;
                renderDetail(previous, client);
                return;
            }
            renderDetail(next, client);
            var generation = viewGeneration;
            client.getMetadata(next.ratingKey).then(function (track) {
                if (generation === viewGeneration && !player) { startPlayer(track, client, 0); }
            }).catch(function (error) {
                if (generation === viewGeneration) { musicQueue = null; showPlayerError(error); }
            }).then(function () { musicLoading = false; });
        }).then(function () { if (player) { musicLoading = false; } });
    }

    function cancelHudTimer() {
        if (hudTimer !== null) { clearTimeout(hudTimer); hudTimer = null; }
    }

    function showHud() {
        cancelHudTimer();
        // The end time moves while paused or stalled, so it is recomputed whenever the HUD shows.
        if (player && !playerClosing) { updatePlayerClocks(playerPosition, playerDuration); }
        var hud = screen.querySelector(".player-hud");
        var shell = document.querySelector(".app-shell");
        if (hud) { hud.hidden = false; }
        if (shell) { shell.classList.remove("hud-hidden"); }
        if (!player || playerClosing || hudBuffering ||
                player.snapshot().state !== "playing" ||
                document.getElementById("player-menu") || document.getElementById("player-info") ||
                document.getElementById("chapter-strip") || document.getElementById("playback-stats") ||
                document.getElementById("subtitle-timing") || document.getElementById("up-next-panel") ||
                document.getElementById("playback-error") || status.className.indexOf("status-error") !== -1) { return; }
        var owner = player;
        hudTimer = setTimeout(function () {
            hudTimer = null;
            if (player !== owner || playerClosing || hudBuffering ||
                    owner.snapshot().state !== "playing" ||
                    document.getElementById("player-menu") || document.getElementById("player-info") ||
                    document.getElementById("chapter-strip") || document.getElementById("playback-stats") ||
                    document.getElementById("subtitle-timing") || document.getElementById("up-next-panel") ||
                    document.getElementById("playback-error")) { return; }
            hideHud();
        }, 5000);
    }

    // Centered buffering ring over the video, independent of the HUD: true spins, a number is AVPlay's fill
    // percent, null removes it. Any wait (start, seek, stall) only spins for its first 3 s; the percent shows
    // after that, so quick waits never flash one.
    function setBufferRing(percent) {
        var ring = document.getElementById("buffering-ring");
        if (percent === null) {
            if (ringTimer !== null) { clearTimeout(ringTimer); ringTimer = null; }
            if (ring && ring.parentNode) { ring.parentNode.removeChild(ring); }
            return;
        }
        ringValue = percent;
        if (!ring) {
            ringPatient = false;
            if (ringTimer !== null) { clearTimeout(ringTimer); }
            ringTimer = setTimeout(function () {
                ringTimer = null;
                ringPatient = true;
                if (document.getElementById("buffering-ring")) { setBufferRing(ringValue); }
            }, 3000);
        }
        var spinning = percent === true || !ringPatient;
        var value = spinning ? 25 : Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        if (!ring) {
            ring = element("div", "buffering-ring");
            ring.id = "buffering-ring";
            ring.setAttribute("role", "progressbar");
            ring.innerHTML = '<svg viewBox="0 0 120 120"><circle class="buffering-track" cx="60" cy="60" r="54"/>' +
                '<circle class="buffering-arc" cx="60" cy="60" r="54"/></svg><span class="buffering-percent"></span>';
            screen.appendChild(ring);
        }
        ring.className = "buffering-ring" + (spinning ? " buffering-spinner" : "");
        ring.setAttribute("aria-label", spinning ? translate("Loading...") : translate("Buffering {percent}%", { percent: value }));
        ring.querySelector(".buffering-arc").style.strokeDashoffset = String(339.292 * (1 - value / 100));
        ring.querySelector(".buffering-percent").textContent = spinning ? "" : value + "%";
    }

    function hideHud() {
        cancelHudTimer();
        var hud = screen.querySelector(".player-hud");
        var shell = document.querySelector(".app-shell");
        if (hud) {
            if (hud.contains(document.activeElement)) {
                hudFocus = document.activeElement;
                hudFocus.blur();
            }
            hud.hidden = true;
        }
        if (shell) { shell.classList.add("hud-hidden"); }
    }

    function closePlayerMenu() {
        var menu = document.getElementById("player-menu");
        if (menu) { menu.parentNode.removeChild(menu); }
        showHud();
        var more = screen.querySelector(".playback-controls .menu-icon-more");
        if (more) { more.focus(); }
    }

    // The track menus are independent of More: closing one returns to its own HUD button.
    function closeTrackMenu(type) {
        var menu = document.getElementById("player-menu");
        if (menu && menu.parentNode) { menu.parentNode.removeChild(menu); }
        showHud();
        var opener = screen.querySelector(".playback-controls .menu-icon-" + (type === "audio" ? "audio" : "subtitles"));
        if (opener) { opener.focus(); }
    }

    // Samsung's Return key policy: Back on the app's home page shows an exit confirmation, and the
    // app terminates only on an explicit choice (developer.samsung.com, "Terminating Applications").
    // Stay is focused so a repeated press never quits; Back dismisses like Stay.
    function confirmExit() {
        confirmDialog("Exit app?", "Stay", "Exit", function () {
            try { window.tizen.application.getCurrentApplication().exit(); }
            catch (error) { setStatus("The app could not close itself. Hold Back on the remote to exit.", true); }
        });
    }
    // The safe choice is focused first and Back dismisses like it, so a repeated press never confirms.
    function confirmDialog(question, safe, danger, action) {
        var returnFocus = document.activeElement;
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var dialog = element("section", "player-menu exit-prompt");
        dialog.id = "player-menu";
        dialog.setAttribute("role", "alertdialog");
        dialog.setAttribute("aria-modal", "true");
        var title = element("h2", "", translate(question));
        title.id = "exit-prompt-title";
        dialog.setAttribute("aria-labelledby", title.id);
        dialog.appendChild(title);
        function dismiss() {
            if (dialog.parentNode) { dialog.parentNode.removeChild(dialog); }
            if (returnFocus && returnFocus.focus && screen.contains(returnFocus)) { returnFocus.focus(); }
            else { focusFirst(); }
        }
        dialog.plexDismiss = dismiss;
        var stay = button(dialog, safe, dismiss, false, "none");
        button(dialog, danger, action, false, "none");
        screen.appendChild(dialog);
        stay.focus();
    }

    // [lines, Mbps] per converted rung.
    var QUALITY_NAMES = { "2160": ["2160", "40"], "1440": ["1440", "25"], "1080h": ["1080", "20"],
        "1080_16": ["1080", "16"], "1080_12": ["1080", "12"], "1080_10": ["1080", "10"], "1080": ["1080", "8"],
        "720": ["720", "4"], "720l": ["720", "2"], "480": ["480", "0.7"] };
    var SUBTITLE_COLORS = ["white", "grey_85", "grey_70", "grey_55", "grey_40", "grey_28", "yellow"];
    function colorName(value) {
        return { white: "White", grey_85: "Silver", grey_70: "Light gray", grey_55: "Gray",
            grey_40: "Dark gray", grey_28: "Charcoal", yellow: "Yellow" }[value] || value;
    }
    function backgroundName(value) { return value === "on" ? "On" : "Off"; }
    function qualityLadder() {
        return (window.VemmPreferences && window.VemmPreferences.qualities) ||
            ["original", "2160", "1440", "1080h", "1080_16", "1080_12", "1080_10", "1080", "720", "720l", "480"];
    }
    // Panel height in lines, or 0 when this TV is not known (a browser, an unknown UA).
    function panelHeight() {
        var profile = window.VemmCapabilities && window.VemmCapabilities.detect({ userAgent: navigator.userAgent,
            productinfo: window.webapis && window.webapis.productinfo, avinfo: window.webapis && window.webapis.avinfo });
        return profile ? profile.maxHeight : 0;
    }
    // Quality options under resolution headings: Original, 4K, 1440p, 1080p, 720p, 480p, highest Mbps
    // first. FHD panels do not get 1440p or 4K; the saved choice stays listed so it can be seen.
    // keep stays listed; source (a Media) hides rungs above its height or, when known, its kbps bitrate.
    // With a source, a preset shows only up to the file's own size and below its top bitrate (qualityTop):
    // the 1080p 20/16/12/10 Mbps presets are gone for an 8.1 Mbps episode.
    function qualityGroups(keep, source, top) {
        var height = panelHeight();
        function mbps(quality) { return quality === "original" ? Infinity : Number(QUALITY_NAMES[quality][1]); }
        var groups = [];
        qualityLadder().filter(function (quality) {
            if (quality === "original" || quality === keep) { return true; }
            if (source && (Number(QUALITY_NAMES[quality][0]) > sourceLines(source) ||
                    qualityKbps(quality) >= top)) {
                return false;
            }
            return !height || height >= Number(QUALITY_NAMES[quality][0]);
        }).sort(function (a, b) { return mbps(b) - mbps(a); }).forEach(function (quality) {
            var lines = quality === "original" ? "" : QUALITY_NAMES[quality][0];
            var last = groups[groups.length - 1];
            if (!last || last.lines !== lines) {
                last = { lines: lines, qualities: [], title: quality === "original" ? translate("Original") :
                    lines === "2160" ? translate("4K") : translate("{height}p", { height: lines }) };
                groups.push(last);
            }
            last.qualities.push(quality);
        });
        return groups;
    }
    function serverName() {
        var named = servers.filter(function (server) { return server.id === currentServerId; })[0];
        return named ? named.name : translate("this server");
    }
    function speedReason(error) {
        return translate(error && error.code === "no-media" ? "This server has no playable media to test." :
            error && error.status ? "HTTP {status} from the server" :
            error && error.code === "timeout" ? "Timed out" :
            error && error.code === "no-data" ? "The server sent no data." :
            "The connection failed (network error)", { status: error && error.status });
    }
    // Downloads from the connected server, the path video takes, and offers the quality that fits.
    function openSpeedTest() {
        retryView = null;
        visit(function renderSpeedTest() {
            viewGeneration += 1;
            var generation = viewGeneration;
            clear(screen);
            page(translate("Connection speed"), "settings");
            var panel = element("section", "speed-panel");
            var phase = element("p", "speed-phase");
            var reading = element("p", "speed-reading");
            var progress = element("p", "help-text speed-progress");
            var bar = element("div", "speed-bar");
            var fill = element("div", "speed-fill");
            bar.appendChild(fill);
            [phase, reading, progress, bar].forEach(function (node) { panel.appendChild(node); });
            screen.appendChild(panel);
            var menu = element("section", "settings-menu");
            screen.appendChild(menu);
            var runs = 0;
            var cancel = null;
            viewCleanup = function () { runs += 1; if (cancel) { cancel(); } };
            function showProgress(mbps, bytes, seconds) {
                var elapsed = Math.min(8, seconds);
                reading.textContent = translate("{mbps} Mbps", { mbps: Math.round(mbps * 10) / 10 });
                progress.textContent = translate("{seconds} of {total} seconds", { seconds: Math.floor(elapsed), total: 8 });
                fill.style.width = Math.round(Math.max(elapsed / 8, bytes / 33554432) * 100) + "%";
            }
            function run() {
                var token = ++runs;
                function current() { return token === runs && generation === viewGeneration; }
                function failure(finding, error) {
                    if (!current()) { return; }
                    cancel = null;
                    phase.textContent = finding ?
                        translate("Couldn't find a file to test with: {reason}", { reason: speedReason(error) }) :
                        translate("Couldn't measure speed: {reason}", { reason: speedReason(error) });
                    phase.className = "speed-phase inline-error";
                    reading.textContent = "";
                    progress.textContent = "";
                    fill.style.width = "0%";
                    clear(menu);
                    button(menu, "Test again", run, false, "refresh").focus();
                    button(menu, "Back", backView);
                }
                phase.className = "speed-phase";
                phase.textContent = translate("Finding a file to test with…");
                reading.textContent = "";
                progress.textContent = "";
                fill.style.width = "0%";
                clear(menu);
                button(menu, "Back", backView).focus();
                window.VemmPlayback.sampleUrl(currentClient).then(function (url) {
                    if (!current()) { return; }
                    phase.textContent = translate("Measuring speed to {server}…", { server: serverName() });
                    var measuring = window.VemmPlayback.measureSpeed({ url: url, onProgress: function (mbps, bytes, seconds) {
                        if (current()) { showProgress(mbps, bytes, seconds); }
                    } });
                    cancel = measuring.cancel;
                    measuring.then(function (result) {
                        if (!current()) { return; }
                        cancel = null;
                        window.VemmPlayback.recordSpeed(window.localStorage, speedKey(), result.mbps);
                        var quality = window.VemmPlayback.recommend(result.mbps, panelHeight() || undefined);
                        showProgress(result.mbps, result.bytes, 8);
                        phase.textContent = translate("{mbps} Mbps to {server}. Recommended: {quality}", {
                            mbps: Math.round(result.mbps * 10) / 10, server: serverName(), quality: qualityName(quality) });
                        progress.textContent = "";
                        clear(menu);
                        button(menu, translate("Use {quality}", { quality: qualityName(quality) }), function () {
                            preferences.quality = quality;
                            if (savePreferences()) { backView(); }
                        }, true, "settings").focus();
                        button(menu, "Test again", run, false, "refresh");
                        button(menu, "Back", backView);
                    }, function (error) { failure(false, error); });
                }, function (error) { failure(true, error); });
            }
            restoreView = renderSpeedTest;
            setStatus("");
            run();
        });
    }
    // The ladder size a file belongs to, by its frame (a 1920x800 film is 1080p).
    function sourceLines(media) {
        var width = Number(media.width) || 0;
        var height = Number(media.height) || 0;
        return width > 2560 || height > 1440 ? 2160 : width > 1920 || height > 1080 ? 1440 :
            width > 1280 || height > 720 ? 1080 : width > 854 || height > 480 ? 720 : 480;
    }
    // The top quality of a file in kbps: its own bitrate when it plays directly, else what a conversion of
    // it asks for (VemmPlayback.ceiling); Infinity when unknown.
    function qualityTop(media, direct) {
        return direct ? Number(media && media.bitrate) || Infinity : window.VemmPlayback.ceiling(media || {});
    }
    // A saved quality at or above a file's top asks for the same as "original".
    function qualityFor(quality, top) {
        return quality === "original" || !QUALITY_NAMES[quality] || qualityKbps(quality) >= top ? "original" : quality;
    }
    // The label of a quality for this file, saying what is asked for: the top choice is the file's own size at
    // its top bitrate, e.g. "1080p – 8.1 Mbps".
    function qualityChoiceName(quality, media, top) {
        if (qualityFor(quality, top) !== "original") { return qualityName(quality); }
        if (!isFinite(top)) { return qualityName("original"); }
        return translate("{height}p – {mbps} Mbps", { height: sourceLines(media), mbps: Math.round(top / 100) / 10 });
    }
    function qualityName(quality) {
        var rung = QUALITY_NAMES[quality];
        if (quality === "original" || !rung) { return translate("Original quality"); }
        return translate("{height}p · {mbps} Mbps (converts)", { height: rung[0], mbps: rung[1] });
    }
    // Results are kept per Plex server id; a manually entered server shares one "manual" slot.
    function speedKey() { return currentServerId || "manual"; }
    function recentSpeed() {
        try { return window.VemmPlayback.recentSpeed(window.localStorage, speedKey()); } catch (error) { return null; }
    }
    // A yellow warning on options whose bitrate (kbps) is above 80% of the recent average speed.
    function markSlow(row) {
        var mark = element("span", "quality-warning");
        mark.setAttribute("role", "img");
        mark.setAttribute("aria-label", translate("May buffer on your connection"));
        row.appendChild(mark);
    }
    function qualityKbps(quality) { return Number(QUALITY_NAMES[quality][1]) * 1000; }
    function reasonName(reason) {
        return translate({
            supported: "media matches this TV capability profile",
            profile: "this TV's formats are not known", "video-codec": "video format not supported by this TV",
            container: "file type not supported for this format", "audio-codec": "audio format not supported by this TV",
            "audio-container": "audio format not supported in this file type", resolution: "resolution too high for this TV",
            quality: "quality limit chosen", bitrate: "bitrate too high for this TV", "bit-depth": "colour depth not supported",
            "frame-rate": "frame rate above 60 fps", level: "H.264 level too high for this TV",
            hdr: "HDR not supported by this panel", "dolby-vision": "Dolby Vision not supported",
            subtitle: "subtitles are burned in", multipart: "the file is split into parts", settings: "Direct play is off in Settings", "server": "the server declined the original file",
            "decoder": "this TV could not decode the original"
        }[reason] || "converted by the server");
    }
    function fallbackName(fallback) {
        return translate({
            "server-transcode-if-refused": "Server transcode if Plex or AVPlay refuses the original",
            "stop-if-refused": "Stop with an error if the original is refused",
            none: "No additional fallback planned"
        }[fallback] || "No additional fallback planned");
    }
    function capabilityName(capability) {
        if (!capability || capability.status === "unknown") {
            return translate("No device capability evidence");
        }
        return capability.measured ?
            translate("Observed on this exact registered TV") :
            translate("Published Samsung specifications, not measured on this TV");
    }
    function modeName(mode) {
        return translate(mode === "direct" ? "Direct Play" : mode === "directstream" ? "Direct Stream" : "Transcode");
    }
    function qualityLabel(media) {
        if (!media) { return translate("Not reported by server"); }
        return [media.height ? media.height + "p" : media.videoResolution || "",
            media.videoCodec || media.audioCodec || "",
            media.bitrate ? (Number(media.bitrate) / 1000).toFixed(1) + " Mbps" : ""].filter(Boolean).join(" · ") ||
            translate("Not reported by server");
    }

    function applySubtitleAppearance(node, always) {
        if (!node) { return; }
        node.className = "subtitle-text";
        if (!externalCues && !always) { return; }
        node.className += " subtitle-size-" + preferences.subtitleSize +
            " subtitle-position-" + preferences.subtitlePosition +
            " subtitle-color-" + preferences.subtitleColor +
            " subtitle-background-" + preferences.subtitleBackground;
    }

    function refreshSubtitleAppearance() {
        applySubtitleAppearance(document.getElementById("subtitle-text"));
    }

    // Settings preview: the player's subtitle element and styling, in the same layer. Off until checked, never saved.
    var subtitlePreview = false;
    function removeSubtitlePreview() {
        var layer = document.getElementById("subtitle-preview-layer");
        if (layer && layer.parentNode) { layer.parentNode.removeChild(layer); }
    }
    function syncSubtitlePreview() {
        removeSubtitlePreview();
        if (!subtitlePreview || !screen.parentNode) { return; }
        // A full-screen layer, like the player's, so the position classes mean what they mean in playback, with the
        // controls hidden as while watching (Low then sits near the bottom, not above the controls).
        var layer = element("div", "subtitle-preview-layer hud-hidden");
        layer.id = "subtitle-preview-layer";
        var node = element("p", "subtitle-text", translate("This is how subtitles will look.") + "\n" +
            translate("Second line for longer dialogue."));
        node.id = "subtitle-preview";
        applySubtitleAppearance(node, true);
        layer.appendChild(node);
        screen.parentNode.appendChild(layer);
    }

    // swatch(value), if given, names the colour sample each choice shows (its data-color).
    function preferenceChoice(parent, title, preferenceKey, values, labelForValue, swatch) {
        var options = values.map(function (value) {
            return { value: value, label: labelForValue(value) };
        });
        var selected = options.filter(function (option) { return option.value === preferences[preferenceKey]; })[0];
        button(parent, translate("{setting}: {value}", {
            setting: translate(title), value: selected ? translate(selected.label) : ""
        }), function () {
            settingsChoices(title, options.map(function (option) {
                return { value: option.value, label: translate(option.label), swatch: swatch && swatch(option.value) };
            }), preferences[preferenceKey], function (value) {
                preferences[preferenceKey] = value;
                if (savePreferences()) { backView(); }
            }, preferenceKey.indexOf("subtitle") === 0 ? syncSubtitlePreview : preferenceKey === "minBuffer" ? bufferWarning : undefined);
        }, false, "settings");
    }

    function ratingName(source) {
        return { rt_critic: translate("Rotten Tomatoes critics"), rt_audience: translate("Rotten Tomatoes audience"),
            imdb: "IMDb", tmdb: "TMDB" }[source];
    }

    // The viewer's choice of rating sources for the details page; each pick flips in place.
    function openRatingSourceChoices() {
        settingsChoices("Ratings shown", function () {
            return window.VemmPreferences.ratingSources.map(function (source) {
                return { value: source, label: ratingName(source), literal: true };
            });
        }, function () { return null; }, function (source) {
            var previous = preferences.ratingSources;
            var on = previous.indexOf(source) === -1;
            preferences.ratingSources = window.VemmPreferences.ratingSources.filter(function (candidate) {
                return candidate === source ? on : previous.indexOf(candidate) !== -1;
            });
            if (!savePreferences()) { preferences.ratingSources = previous; return; }
            Array.prototype.forEach.call(screen.querySelectorAll("button"), function (row) {
                if (row.textContent === ratingName(source)) { row.setAttribute("aria-pressed", String(on)); }
            });
        }, function (menu) {
            Array.prototype.forEach.call(menu.querySelectorAll("button"), function (row, index) {
                var source = window.VemmPreferences.ratingSources[index];
                if (source) { row.setAttribute("aria-pressed", String(preferences.ratingSources.indexOf(source) !== -1)); }
            });
        });
    }

    // Only the owner of the current server may change a library's ratings source.
    function isServerOwner() {
        var server = servers.filter(function (candidate) { return candidate.id === currentServerId; })[0];
        var profile = activeProfile || linkedProfile;
        return !!(server && server.owned === true && !(profile && profile.admin === false));
    }

    var librarySourceCache = null;
    // Movie and show libraries whose prefs offer a ratings-source setting; empty when the server has none.
    function librarySourceEntries(client) {
        if (!librarySourceCache || librarySourceCache.client !== client) {
            var cache = { client: client };
            cache.promise = client.getSections().then(function (sections) {
                return Promise.all(sections.filter(function (section) {
                    return section.type === "movie" || section.type === "show";
                }).map(function (section) {
                    return client.getSectionPrefs(section.key).then(function (settings) {
                        var pref = window.PlexApi.ratingPref(settings);
                        return pref ? { key: String(section.key), title: section.title, pref: pref } : null;
                    }).catch(function () { return null; });
                }));
            }).then(function (entries) { return entries.filter(Boolean); }).catch(function () { return []; });
            librarySourceCache = cache;
        }
        return librarySourceCache.promise;
    }

    function openLibrarySourceChoices(client, entries) {
        function optionLabel(entry) {
            var current = entry.pref.options.filter(function (option) { return option.value === entry.pref.value; })[0];
            return entry.title + ": " + (current ? current.label : entry.pref.value);
        }
        settingsChoices("Library ratings source", function () {
            return entries.map(function (entry) { return { value: entry.key, label: optionLabel(entry), literal: true }; });
        }, null, function (key) {
            var entry = entries.filter(function (candidate) { return candidate.key === key; })[0];
            settingsChoices(entry.title, entry.pref.options.map(function (option) {
                return { value: option.value, label: option.label, literal: true };
            }), function () { return entry.pref.value; }, function (value) {
                setStatus("Saving...");
                client.setSectionPref(entry.key, entry.pref.id, value).then(function () {
                    entry.pref.value = value;
                    backView();
                    setStatus("Saved. Plex must refresh this library's metadata before existing items change.");
                }).catch(function (error) { setStatus(errorText(error), true); });
            }, function (menu, notes) {
                notes.appendChild(element("p", "help-text", translate(
                    "Plex must refresh this library's metadata before existing items change.")));
            });
        });
    }

    function libraryRatingSourceEntry(parent, client) {
        librarySourceEntries(client).then(function (entries) {
            if (!entries.length || !parent.parentNode || client !== currentClient) { return; }
            button(parent, "Library ratings source", function () { openLibrarySourceChoices(client, entries); }, false, "settings");
        });
    }

    // The minimum buffer, shortest first; 1 s is the default.
    function bufferChoices() {
        return window.VemmPreferences && window.VemmPreferences.bufferSizes || [0.5, 1, 2, 4, 8, 15];
    }
    function bufferName(seconds) {
        return translate("{seconds} s", { seconds: seconds });
    }
    // One line when the minimum buffer is longer than the 1 s default.
    function bufferWarning(menu, notes) {
        if (preferences.minBuffer <= 1) { return; }
        notes.appendChild(element("p", "help-text", translate("Every start and seek waits this long.")));
    }

    // A submenu of More: Back returns to More, on the entry that opened it.
    function playerSubmenu(title, from) {
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.plexDismiss = function () { openPlaybackOptions(from); };
        menu.appendChild(element("h2", "", translate(title)));
        return menu;
    }

    // The choice applies to the next AVPlay open, so restart the stream where it is.
    function openBufferChoices() {
        if (!player) { return; }
        var menu = playerSubmenu("Minimum buffer", "buffer");
        bufferWarning(null, menu);
        bufferChoices().forEach(function (seconds) {
            var chosen = preferences.minBuffer === seconds;
            button(menu, bufferName(seconds), function () {
                if (chosen) { openPlaybackOptions("buffer"); return; }
                preferences.minBuffer = seconds;
                if (savePreferences()) { recoverPlayer(false); }
            }, true).setAttribute("aria-pressed", String(chosen));
        });
        screen.appendChild(menu);
        (menu.querySelector('[aria-pressed="true"]') || menu.querySelector("button")).focus();
    }

    var SKIP_MODES = ["button", "auto", "off"];
    var SKIP_MODE_NAMES = { button: "Show Skip button", auto: "Skip automatically", off: "Off" };
    // The playing title's own intro/credits choice on this TV, or null to follow Settings.
    function skipOverride(item, type) {
        try { return window.VemmSkipMarkers.override(window.localStorage, currentServerId, item, type); }
        catch (error) { return null; }
    }

    // Intro and credits handling for this show or movie only, kept on this TV.
    function openSkipChoices(focusChoice) {
        if (!player) { return; }
        var menu = playerSubmenu("Intro and credits", "skip");
        menu.appendChild(element("p", "help-text", translate("For {title} on this TV.", {
            title: playerItem.type === "episode" && playerItem.grandparentTitle || playerItem.title || "" })));
        var focus = null;
        ["intro", "credits"].forEach(function (type) {
            var list = group(menu, translate(type === "intro" ? "Intros" : "Credits"), "menu-group");
            var saved = skipOverride(playerItem, type);
            var setting = preferences[type === "intro" ? "skipIntro" : "skipCredits"];
            [null].concat(SKIP_MODES).forEach(function (mode) {
                var label = mode ? translate(SKIP_MODE_NAMES[mode]) :
                    translate("Default ({mode})", { mode: translate(SKIP_MODE_NAMES[setting]) });
                var row = button(list, label, function () {
                    try { window.VemmSkipMarkers.setOverride(window.localStorage, currentServerId, playerItem, type, mode); }
                    catch (error) { setStatus("Could not save preferences. Check app storage permissions.", true); return; }
                    if (playerSkipRefresh) { playerSkipRefresh(); }
                    openSkipChoices(type + ":" + mode);
                }, true);
                row.setAttribute("aria-pressed", String(saved === mode));
                if (focusChoice === type + ":" + mode) { focus = row; }
            });
        });
        screen.appendChild(menu);
        (focus || menu.querySelectorAll("button")[0]).focus();
    }

    // More: Back closes it. from ("quality", "buffer", "skip") refocuses the entry a submenu came from.
    function openPlaybackOptions(from) {
        if (!player) { return; }
        cancelScrub();
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu");
        menu.id = "player-menu";
        menu.plexDismiss = closePlayerMenu;
        menu.appendChild(element("h2", "", translate("Playback options")));
        var entries = {};
        entries.quality = button(menu, "Quality and version", openQuality);
        entries.buffer = button(menu, translate("{setting}: {value}", { setting: translate("Minimum buffer"),
            value: bufferName(preferences.minBuffer) }), openBufferChoices, true);
        if ((playerItem.Marker || []).some(function (marker) { return marker.type === "intro" || marker.type === "credits"; })) {
            entries.skip = button(menu, "Intro and credits", function () { openSkipChoices(); });
        }
        if (externalCues) { button(menu, "Subtitle timing", openSubtitleTiming); }
        if (playerItem.type === "track") {
            button(menu, "Previous track", function () { skipMusic(-1, false); });
            button(menu, "Next track", function () { skipMusic(1, false); });
            button(menu, "Shuffle / On or off", function () {
                queueShuffle = musicQueue.shuffle(!queueShuffle);
                setStatus(translate(queueShuffle ? "Shuffle on." : "Shuffle off."));
            });
            button(menu, "Repeat / Off, one, all", function () {
                queueRepeat = queueRepeat === "off" ? "one" : queueRepeat === "one" ? "all" : "off";
                musicQueue.repeat(queueRepeat);
                setStatus(translate("Repeat") + ": " + translate(queueRepeat));
            });
        }
        button(menu, "Stop and return to details", stopPlayer);
        button(menu, "Stats for nerds", function () {
            closePlayerMenu();
            togglePlayerStats();
        });
        screen.appendChild(menu);
        (typeof from === "string" && entries[from] || menu.querySelector("button")).focus();
    }

    // What a start asks for; a background start (preloadOnFocus) is used only when this matches exactly.
    function playbackSettings(offset, mediaIndex, trackOptions) {
        return {
            offset: offset || 0, mediaIndex: mediaIndex || 0, quality: preferences.quality,
            audioId: trackOptions ? trackOptions.audioId : undefined,
            subtitleId: trackOptions ? trackOptions.subtitleId : undefined,
            overlaySubtitle: !!(trackOptions && trackOptions.cues),
            subtitleSidecar: !!(trackOptions && trackOptions.subtitleSidecar),
            paused: !!(trackOptions && trackOptions.paused),
            profile: directPlayProfile(), directPlay: preferences.directPlay,
            minBuffer: preferences.minBuffer, mbps: (recentSpeed() || {}).mbps
        };
    }
    function preloadKey(item, settings) { return item.ratingKey + " " + JSON.stringify(settings); }

    // One start's AVPlay adapter and Plex session. Their events go to relay.adapter / relay.session,
    // which startPlayer sets when it shows the stream (a background start has none until then).
    function playbackPipeline(item, client, settings) {
        var relay = { adapter: null, session: null };
        var adapter = window.VemmAvplay.create({
            avplay: window.webapis && window.webapis.avplay,
            onEvent: function (event) { if (relay.adapter) { relay.adapter(event); } }
        });
        var session = window.VemmPlayback.create({
            adapter: adapter, client: client, item: item, settings: settings,
            onEvent: function (event) { if (relay.session) { relay.session(event); } }
        });
        return { key: preloadKey(item, settings), settings: settings, session: session, relay: relay };
    }

    // A Play control that keeps focus for 0.6 s starts its stream in the background (js/preload.js): the
    // decision and the AVPlay prepare at the resume point, so pressing it only shows the picture. Nothing
    // is written to Plex before the press; moving away, another start or leaving the page discards it and
    // its server conversion. load() gives { item, offset } (full metadata), or null for no preload.
    function preloadOnFocus(node, client, load) {
        node.addEventListener("focus", function () {
            preload.arm(function () {
                var loading = !player && !playerClosing && !document.hidden && window.webapis && window.webapis.avplay && load();
                return loading && loading.then(function (target) {
                    if (!target || player || playerClosing || rememberedTracks(target.item, 0)) { return null; }
                    var pipeline = playbackPipeline(target.item, client, playbackSettings(target.offset, 0));
                    pipeline.ready = pipeline.session.prepare();
                    pipeline.discard = function () { pipeline.session.stop().catch(function () { /* nothing to report */ }); };
                    return pipeline;
                });
            });
        });
        node.addEventListener("blur", function () { preload.cancel(); });
    }

    // Until a start's picture moves, the page Play was pressed on stays on screen under the spinner instead of the
    // TV's black: its nodes move into a still copy of the shell, behind the player's (css .player-still), with no
    // ids left to answer the player's lookups. True when there was such a page.
    function holdPage() {
        var shell = document.querySelector(".app-shell");
        if (!shell || !shell.classList.contains("detail-mode")) { return false; }
        var still = element("div", "detail-mode player-still");
        var page = element("main", screen.className);
        var scroll = screen.scrollTop;
        while (screen.firstChild) { page.appendChild(screen.firstChild); }
        Array.prototype.forEach.call(page.querySelectorAll("[id]"), function (node) { node.removeAttribute("id"); });
        still.appendChild(page);
        document.body.appendChild(still);
        page.scrollTop = scroll;
        return true;
    }

    function dropStill() {
        var still = document.querySelector(".player-still");
        if (still) { still.parentNode.removeChild(still); }
        document.body.classList.remove("holding-page");
    }

    function startPlayer(item, client, offset, mediaIndex, trackOptions) {
        var listQueue = playlistQueue;
        playlistQueue = null;
        if (player || playerClosing) { return; }
        var reopened = reconnectResume;
        reconnectResume = false;
        if (!reopened) { reconnectOpens = 0; }
        reconnectFrom = reopened ? offset : null;
        if (!trackOptions || trackOptions.audioId === undefined && trackOptions.subtitleId === undefined) {
            // Another episode of a show whose tracks the viewer picked before.
            var remembered = rememberedTracks(item, mediaIndex);
            if (remembered) {
                var own = trackOptions || {};
                trackOptions = { audioId: remembered.audioId, subtitleId: remembered.subtitleId, cues: own.cues, paused: own.paused };
            }
        }
        var settings = playbackSettings(offset, mediaIndex, trackOptions);
        // The background start of exactly this, if there is one; any other is discarded here.
        var pipeline = preload.take(preloadKey(item, settings));
        if (item.type === "track" && (!musicQueue || musicQueue.current().ratingKey !== item.ratingKey)) {
            musicQueue = window.VemmQueue.create([item]);
            queueShuffle = false; queueRepeat = "off";
        } else if (item.type !== "track") { musicQueue = null; }
        viewGeneration += 1;
        var held = holdPage();
        resetImages();
        clear(screen);
        setStatus("");
        hudBuffering = false;
        playerStarting = true;
        pauseWanted = trackOptions && trackOptions.paused ? true : null;
        // A spinner, not a percent, until the picture moves: AVPlay reports one fill while it
        // prepares and another after the resume seek, so a percent jumped and then stalled.
        setBufferRing(true);
        // A reopen after a drop keeps saying so until the picture moves.
        if (reopened) { showReconnecting(true); }
        hudFocus = null;
        scrubReturnFocus = null;
        playerPanel = "";
        playerStatsVisible = false;
        subtitleTiming = false;
        playerItem = item;
        playerClient = client;
        playerPosition = offset || 0;
        playerDuration = item.duration || 0;
        playerSettings = pipeline ? pipeline.settings : settings;
        if (listQueue) {
            playerSettings.playQueue = listQueue;
            if (window.VemmPlaylists.needsMore(listQueue)) {
                client.getPlayQueueItems(listQueue.id, listQueue.itemId).then(function (items) {
                    listQueue.items = items;
                }).catch(function () { /* the next item is looked up again when this one ends */ });
            }
        }
        externalCues = trackOptions && trackOptions.cues || null;
        closePreview();
        var previewMedia = item.Media && item.Media[playerSettings.mediaIndex || 0];
        var previewPart = previewMedia && previewMedia.Part && previewMedia.Part[0];
        if (previewPart && previewPart.id && (item.type === "movie" || item.type === "episode") &&
                client.previewIndex && window.VemmPreviewThumbs) {
            previewThumbs = window.VemmPreviewThumbs.create({ load: function () { return client.previewIndex(previewPart.id); } });
        }
        document.body.className = held ? "playing holding-page" : "playing";
        var hud = element("section", "player-hud");
        hud.appendChild(element("h2", "", item.title || "Playing"));
        var context = [item.grandparentTitle, item.parentTitle].filter(Boolean).join(" / ");
        if (item.index) { context += (context ? " / " : "") + translate("Episode {number}", { number: item.index }); }
        if (context) { hud.appendChild(element("p", "playback-context", context)); }
        var time = element("div", "playback-time");
        var elapsed = element("span", "playback-elapsed", timeLabel(playerPosition));
        elapsed.id = "playback-time";
        time.appendChild(elapsed);
        if (item.type === "movie" || item.type === "episode") {
            time.appendChild(element("span", "playback-ends", endsAtLabel(playerDuration - playerPosition)));
        }
        time.appendChild(element("span", "playback-remaining", playerRemaining(playerPosition, playerDuration)));
        hud.appendChild(time);
        var progress = element("div", "playback-progress");
        progress.id = "playback-progress";
        progress.setAttribute("role", "slider");
        progress.setAttribute("tabindex", "0");
        progress.setAttribute("aria-label", translate("Playback position"));
        progress.setAttribute("aria-valuemin", "0");
        progress.setAttribute("aria-valuemax", String(item.duration || 1));
        progress.setAttribute("aria-valuenow", String(offset || 0));
        progress.setAttribute("aria-valuetext", timeLabel(offset || 0) + " / " + timeLabel(item.duration || 0));
        progress.appendChild(element("div", "playback-progress-fill"));
        // The scrubber: a full-width layer moved by translateX, with the circle on its left edge.
        var knobTrack = element("div", "playback-knob-track");
        knobTrack.appendChild(element("span", "playback-knob"));
        progress.appendChild(knobTrack);
        hud.appendChild(progress);
        var subtitle = element("p", "subtitle-text");
        subtitle.id = "subtitle-text";
        applySubtitleAppearance(subtitle);
        screen.appendChild(subtitle);
        var controls = element("div", "playback-controls");
        var leftGroup = element("div", "playback-group playback-left");
        var centerGroup = element("div", "playback-group playback-center");
        var rightGroup = element("div", "playback-group playback-right");
        controls.appendChild(leftGroup);
        controls.appendChild(centerGroup);
        controls.appendChild(rightGroup);
        button(leftGroup, "Subtitles", function () { openTracks("subtitle"); }, false, "subtitles");
        button(leftGroup, "Audio", function () { openTracks("audio"); }, false, "audio");
        var rewind = button(centerGroup, translate("Back {seconds} seconds", { seconds: preferences.skipInterval }),
            function () { seekPlayer(-preferences.skipInterval * 1000); }, false, "rewind");
        rewind.setAttribute("data-seconds", String(preferences.skipInterval));
        var pauseControl = button(centerGroup, "Pause / Play", togglePlayer, false, pauseWanted ? "play" : "pause");
        pauseControl.setAttribute("aria-label", translate("Pause / Play"));
        var forward = button(centerGroup, translate("Forward {seconds} seconds", { seconds: preferences.skipInterval }),
            function () { seekPlayer(preferences.skipInterval * 1000); }, false, "forward");
        forward.setAttribute("data-seconds", String(preferences.skipInterval));
        if (item.Chapter && item.Chapter.length) {
            button(centerGroup, "Chapters", function () { openPlayerPanel("chapters"); }, false, "none").className += " player-tab";
        }
        button(rightGroup, "More", openPlaybackOptions, false, "more");
        button(rightGroup, "Info", function () { openPlayerPanel("info"); }, false, "none").className += " player-tab";
        hud.appendChild(controls);
        var skip = { skipped: {}, key: null, control: null };
        function updateSkip(position) {
            var marker = window.VemmSkipMarkers.markerAt(item.Marker, position, skip.skipped);
            var next = window.VemmSkipMarkers.prompt(marker);
            var mode = next ? window.VemmSkipMarkers.mode(next.type, preferences, skipOverride(item, next.type)) : "";
            if (next && mode !== "button") {
                // Off passes the marker by; Auto skips it once, as pressing its button would.
                skip.skipped[next.key] = true;
                if (mode === "auto" && player === ownPlayer && !playerClosing) {
                    if (next.action === "finish") { finishEpisode(); return; }
                    seekToPlayer(next.target);
                    showHud();
                    position = next.target;
                }
                updateSkip(position);
                return;
            }
            var nextKey = next ? next.key : null;
            if (nextKey === skip.key) { return; }
            var hadFocus = skip.control && document.activeElement === skip.control;
            if (skip.control) {
                if (hudFocus === skip.control) { hudFocus = null; }
                skip.control.parentNode.removeChild(skip.control);
                skip.control = null;
            }
            skip.key = nextKey;
            if (!next) {
                if (hadFocus) { pauseControl.focus(); }
                return;
            }
            // Raised once as the segment starts, with focus on the button, so one OK skips.
            var control = button(rightGroup, next.label, function () {
                if (!player || player !== ownPlayer || playerClosing) { return; }
                skip.skipped[next.key] = true;
                updateSkip(next.action === "seek" ? next.target : position);
                if (next.action === "finish") { finishEpisode(); }
                else { seekToPlayer(next.target); }
            }, false, "none");
            rightGroup.insertBefore(control, rightGroup.firstChild);
            control.className += " skip-marker";
            skip.control = control;
            // LG's Up Next: on the final credits marker of an episode, a 10 second countdown
            // that finishes the episode and starts its successor unless the viewer acts.
            if (next.action === "finish" && (activePlaylist() ? queueSuccessor(activePlaylist()) : item.type === "episode") &&
                    preferences.nextEpisode === "countdown" &&
                    !document.hidden) {
                var remaining = 10;
                var tick = null;
                var countdown = showUpNext(function () {
                    if (tick !== null) { clearInterval(tick); tick = null; }
                    skip.skipped[next.key] = true;
                    updateSkip(position);
                    pauseControl.focus();
                });
                var label = function () {
                    control.textContent = translate("Up Next in {seconds}s / Skip Credits", { seconds: remaining });
                    if (countdown) {
                        countdown.textContent = translate("Next episode starts in {seconds}s", { seconds: remaining });
                    }
                };
                label();
                tick = setInterval(function () {
                    if (!player || player !== ownPlayer || playerClosing || skip.control !== control) {
                        clearInterval(tick); return;
                    }
                    remaining -= 1;
                    if (remaining > 0) { label(); return; }
                    clearInterval(tick);
                    closeUpNext();
                    skip.skipped[next.key] = true;
                    finishEpisode(true);
                }, 1000);
            }
            if (!document.getElementById("player-menu")) {
                showHud();
                control.focus();
            }
        }
        screen.appendChild(hud);
        showPlayhead(playerPosition, playerDuration);
        playerSkipRefresh = function () {
            skip.skipped = {};
            skip.key = "refresh";
            updateSkip(currentPlayerPosition());
        };
        // Start-up lasts until the picture moves; the spinner (and the page Play was pressed on) stays up all through
        // it, also once the buffer is full: a 2018 TV's clock started up to 0.25 s after that.
        var startup = { started: false, done: false, position: null };
        function endStartup() {
            if (startup.done) { return; }
            startup.done = true;
            playerStarting = false;
            showReconnecting(false);
            if (previewThumbs) { previewThumbs.load(); }
            dropStill();
            if (!hudBuffering) { setBufferRing(null); }
            applyWantedPause();
        }
        var ownPlayer;
        try {
            pipeline = pipeline || playbackPipeline(item, client, playerSettings);
            pipeline.relay.adapter = function (event) {
                if (!player || player !== ownPlayer || playerClosing) { return; }
                if (event.type === "time") {
                    // A jump onto a timed-out seek's target means it landed after all.
                    if (stalledSeek !== null && seekOwner === ownPlayer &&
                            Math.abs(event.position - playerPosition) > 2000 &&
                            Math.abs(event.position - stalledSeek) < 2000) {
                        stalledSeek = null;
                        var stalled = document.getElementById("playback-error");
                        if (stalled && stalled.parentNode) {
                            var refocus = stalled.contains(document.activeElement);
                            stalled.parentNode.removeChild(stalled);
                            if (refocus) { pauseControl.focus(); }
                        }
                        showHud();
                    }
                    updatePlayerClocks(event.position, event.duration || item.duration);
                    if (reconnectFrom !== null && event.position > reconnectFrom + 10000) {
                        reconnectOpens = 0;
                        reconnectFrom = null;
                    }
                    if (startup.started && event.position !== startup.position) { endStartup(); }
                    updateSkip(event.position);
                    if (externalCues) {
                        var externalSubtitle = document.getElementById("subtitle-text");
                        if (externalSubtitle) {
                            externalSubtitle.textContent = window.VemmSubtitles.at(externalCues,
                                event.position - preferences.subtitleDelayMs);
                        }
                    }
                } else if (event.type === "subtitle") {
                    if (externalCues) { return; }
                    var text = document.getElementById("subtitle-text");
                    if (text) {
                        text.textContent = window.VemmSubtitles.clean(event.detail.text);
                        if (subtitleTimer !== null) { clearTimeout(subtitleTimer); }
                        subtitleTimer = setTimeout(function () { text.textContent = ""; }, event.detail.duration || 3000);
                    }
                } else if (event.type === "buffering") {
                    hudBuffering = !!event.detail;
                    watchStall(hudBuffering, ownPlayer);
                    if (startup.done) {
                        setBufferRing(event.detail ? 0 : seekOwner === ownPlayer && seekInFlight !== null ? true : null);
                    }
                    showHud();
                } else if (event.type === "buffer-progress") {
                    // The percent shows once AVPlay fills toward playing: after start, or for a seek or stall.
                    if (hudBuffering && (startup.done || startup.started)) {
                        setBufferRing(event.detail);
                    }
                } else if (event.type === "state") {
                    keepScreenAwake(event.state === "playing");
                    showPaused(pauseWanted !== null ? pauseWanted : event.state === "paused");
                    showHud();
                } else if (event.type === "resume-failed") {
                    setStatus("Couldn't return to where you left off. Playing from the start.");
                    showHud();
                } else if (event.type === "error") {
                    if (event.reason === "PLAYER_ERROR_CONNECTION_FAILED") { reconnectPlayer(event.detail); }
                    else { showPlayerError({ message: event.detail }); }
                } else if (event.type === "ended") {
                    finishEpisode();
                }
            };
            pipeline.relay.session = function (event) {
                if (event.type === "direct-fallback" && player === ownPlayer) {
                    setStatus("This TV could not play the original file. Asking Plex to convert it...");
                }
                if (event.type === "progress-error" || event.type === "cleanup-error") {
                    // While the server is out of reach every report fails: that is the reconnecting note's news.
                    if (player === ownPlayer && !reconnect && !stall.wait) {
                        setStatus(errorText(event), true);
                        progressNoted = progressNoted || event.type === "progress-error";
                    }
                }
                if (event.type === "progress-restored" && progressNoted) {
                    progressNoted = false;
                    if (player === ownPlayer) { setStatus(""); }
                }
            };
            ownPlayer = pipeline.session;
            if ((item.type === "movie" || item.type === "episode") && !listQueue && currentServerId &&
                    client === currentClient && client.createVideoPlayQueue) {
                var queueSettings = playerSettings;
                client.createVideoPlayQueue(currentServerId, item.ratingKey).then(function (queue) {
                    if (playerSettings === queueSettings) { queueSettings.playQueue = queue; }
                }).catch(function () { /* the queue is optional; playback and progress continue without it */ });
            }
            player = ownPlayer;
            player.start().then(function () {
                if (player === ownPlayer) {
                    setStatus("");
                    startup.started = true;
                    startup.position = ownPlayer.snapshot().position;
                    if (ownPlayer.snapshot().state === "paused") { endStartup(); }
                    showHud();
                }
            }).catch(function (error) {
                if (player !== ownPlayer) { return; }
                // A reopen after a drop that fails without an answer from Plex is the connection again: wait on.
                // It does not count as a try that played, and the next one waits a little.
                if (reopened && connectionFailure(error)) {
                    reconnectOpens = Math.max(0, reconnectOpens - 1);
                    reconnectPlayer(errorText(error), 3000);
                } else { showPlayerError(error); }
            });
        } catch (error) {
            document.body.className = "";
            player = null;
            showHud();
            externalCues = null;
            renderDetail(item, client);
            showPlayerError(error);
        }
        rewind.focus();
    }

    function playerWaiting() { return playerStarting || seekOwner === player && seekInFlight !== null; }

    // Paused, or (while the picture is not moving yet) asked to be.
    function wantsPause() { return pauseWanted !== null ? pauseWanted : player.snapshot().state === "paused"; }

    function showPaused(paused) {
        var control = screen.querySelector(".playback-center .menu-icon-pause, .playback-center .menu-icon-play");
        if (control) { control.className = control.className.replace(/menu-icon-(pause|play)/, paused ? "menu-icon-play" : "menu-icon-pause"); }
    }

    // Once the picture moves, does what Pause / Play asked for while it could not.
    function applyWantedPause() {
        var wanted = pauseWanted;
        pauseWanted = null;
        if (!player || wanted === null) { return; }
        var state = player.snapshot().state;
        if ((state === "playing" || state === "paused") && wanted !== (state === "paused")) { togglePlayer(); }
        else { showPaused(state === "paused"); }
    }

    function togglePlayer() {
        if (!player || reconnect) { return; }
        if (playerWaiting()) {
            pauseWanted = !wantsPause();
            showPaused(pauseWanted);
            showHud();
            return;
        }
        try {
            var action = player.snapshot().state === "playing" ? player.pause() : player.play();
            action.then(showHud).catch(showPlayerError);
        } catch (error) { showPlayerError(error); }
    }

    // Where the playhead is headed: a queued or landing seek, else the live position.
    function seekBase() {
        if (seekOwner === player && queuedSeek !== null) { return queuedSeek; }
        if (seekOwner === player && seekInFlight !== null) { return seekInFlight; }
        return player.snapshot().position;
    }

    // Forward/Back and the media keys: each press moves the timeline at once and the seek is sent 0.4 s
    // after the last one (commitScrub), so +10 +10 +10 is one 30 s seek. AVPlay cannot cancel a running
    // seek, and each seek waits for the minimum buffer, so every extra one used to cost a full seek.
    function seekPlayer(delta) {
        if (!player || reconnect) { return; }
        moveScrub(delta);
    }

    // AVPlay refuses a seek while another is landing. A press in that window is queued and runs
    // when the first lands, so two quick +10 s presses end 20 s ahead instead of raising
    // "Playback problem". A seek that never lands still fails through the adapter's seek timeout.
    function seekToPlayer(target) {
        if (!player || playerClosing) { return; }
        // Before the first frame (or after the end) there is nothing to seek in yet.
        if (["playing", "paused"].indexOf(player.snapshot().state) === -1) { return; }
        var duration = playerDuration || playerItem.duration || 0;
        if (seekOwner === player && seekInFlight !== null) {
            queuedSeek = target;
            showPlayhead(target, duration);
            return;
        }
        var selectedPlayer = player;
        seekOwner = player; seekInFlight = target; queuedSeek = null; stalledSeek = null;
        // The new spot and a spinner show at once; the adapter seeks after they are painted.
        showPlayhead(target, duration);
        if (!hudBuffering) { setBufferRing(true); }
        player.seek(target).then(function (position) {
            if (player !== selectedPlayer || playerClosing) { return; }
            seekInFlight = null;
            if (queuedSeek !== null) {
                var next = queuedSeek;
                queuedSeek = null;
                seekToPlayer(next);
                return;
            }
            if (!hudBuffering) { setBufferRing(null); }
            hidePreview();
            // The clock shows where the seek landed: AVPlay snaps to a keyframe.
            updatePlayerClocks(position, playerDuration);
            applyWantedPause();
            showHud();
        }).catch(function (error) {
            if (player !== selectedPlayer || playerClosing) { return; }
            seekInFlight = null; queuedSeek = null;
            hidePreview();
            applyWantedPause();
            if (!hudBuffering) { setBufferRing(null); }
            // A timed-out seek can still land later; the time handler then closes this problem.
            if (error && error.code === "avplay-seek-timeout") { stalledSeek = target; }
            showPlayerError(error);
        });
    }

    function cancelScrub() {
        if (scrubTimer !== null) { clearTimeout(scrubTimer); scrubTimer = null; }
        scrubTarget = null; scrubRepeats = 0; scrubOwner = null;
    }

    function commitScrub() {
        var target = scrubTarget;
        var owner = scrubOwner;
        cancelScrub();
        if (target !== null && player === owner && !playerClosing) { seekToPlayer(target); }
        else { hidePreview(); }
    }

    // Moves the pending seek target (starting from where the playhead is headed) and restarts the 0.4 s wait.
    function moveScrub(delta) {
        var snapshot = player.snapshot();
        if (["playing", "paused"].indexOf(snapshot.state) === -1 || playerClosing) { return false; }
        if (scrubOwner !== player || scrubTarget === null) {
            cancelScrub(); scrubOwner = player; scrubTarget = seekBase();
        }
        var duration = snapshot.duration || playerItem.duration || 0;
        scrubTarget = Math.max(0, Math.min(duration, scrubTarget + delta));
        showPlayhead(scrubTarget, duration || 1);
        showPreview(scrubTarget, duration);
        if (scrubTimer !== null) { clearTimeout(scrubTimer); }
        scrubTimer = setTimeout(commitScrub, 400);
        return true;
    }

    // Left/Right on the timeline: the step grows while a direction is held.
    function scrubPlayer(direction) {
        if (scrubOwner !== player || scrubTarget === null) { scrubRepeats = 0; }
        var step = preferences.skipInterval * 1000 * Math.min(4, 1 + Math.floor(scrubRepeats / 3));
        if (moveScrub(direction * step)) { scrubRepeats += 1; }
    }

    function stopPlayer(after) {
        if (!player || playerClosing) { return Promise.resolve(); }
        playerClosing = true;
        playerStarting = false;
        pauseWanted = null;
        cancelReconnect();
        cancelScrub();
        closePreview();
        keepScreenAwake(false);
        subtitleSearchGeneration += 1;
        cancelHudTimer();
        setBufferRing(null);
        closePlayerPanel();
        closeUpNext();
        stopStatsTimer();
        var stats = document.getElementById("playback-stats");
        if (stats && stats.parentNode) { stats.parentNode.removeChild(stats); }
        var timing = document.getElementById("subtitle-timing");
        if (timing && timing.parentNode) { timing.parentNode.removeChild(timing); }
        var failure = document.getElementById("playback-error");
        if (failure && failure.parentNode) { failure.parentNode.removeChild(failure); }
        playerStatsVisible = false;
        subtitleTiming = false;
        if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
        if (subtitleTimer !== null) { clearTimeout(subtitleTimer); subtitleTimer = null; }
        var closing = player;
        var item = playerItem;
        var client = playerClient;
        var safeToLeave = true;
        playerSkipRefresh = null;
        return closing.stop().then(function (metadata) { item = metadata || item; }, function (error) {
            showPlayerError(error);
            safeToLeave = closing.snapshot().state === "idle";
        }).then(function () {
            dropStill();
            if (!safeToLeave) { playerClosing = false; showHud(); return; }
            player = null;
            showHud();
            playerClosing = false;
            document.body.className = "";
            if (typeof after === "function") { after(); }
            else { renderDetail(item, client); }
            if (typeof after !== "function") { musicQueue = null; }
        });
    }

    // Restart playback at the current position with an explicit track choice. `cues` keeps an
    // app-rendered text overlay; only "Subtitles off" may send subtitleStreamID=0, because moving
    // the PMS selection off a downloaded subtitle deletes it (docs/pms-api.md section 8).
    // The audio/subtitle language a viewer picked is kept for the show on this TV (js/track-memory.js) and chosen
    // again in its other episodes that have it; a movie keeps what Plex remembers for its file.
    function trackMemoryShow(item) {
        return item && item.type === "episode" && item.grandparentRatingKey ? String(item.grandparentRatingKey) : "";
    }
    function mediaStreams(item, mediaIndex) {
        var media = (item.Media || [])[mediaIndex || 0];
        return media && media.Part && media.Part[0] && media.Part[0].Stream || [];
    }
    function rememberedTracks(item, mediaIndex) {
        var show = trackMemoryShow(item);
        if (!show || !window.VemmTrackMemory) { return null; }
        return window.VemmTrackMemory.choose(window.VemmTrackMemory.recall(window.localStorage, show), mediaStreams(item, mediaIndex));
    }
    function rememberTracks(item, mediaIndex, change) {
        var show = trackMemoryShow(item);
        if (show && window.VemmTrackMemory) {
            window.VemmTrackMemory.remember(window.localStorage, show, mediaStreams(item, mediaIndex), change);
        }
    }

    function reloadTracks(audioId, subtitleId, cues, subtitleSidecar) {
        if (!player) { return; }
        var item = playerItem;
        var client = playerClient;
        var position = player.snapshot().position;
        var version = playerSettings.mediaIndex;
        var now = player.selection();
        rememberTracks(item, version, {
            audioId: audioId !== undefined && String(audioId) !== String(now.audioId) ? audioId : undefined,
            subtitleId: subtitleId !== undefined && String(subtitleId) !== String(now.subtitleId) ? subtitleId : undefined
        });
        var options = { audioId: audioId, subtitleId: subtitleId, paused: wantsPause(),
            subtitleSidecar: cues ? (subtitleSidecar === undefined ?
                playerSettings.subtitleSidecar : !!subtitleSidecar) : false };
        if (cues) { options.cues = cues; }
        stopPlayer(function () { startPlayer(item, client, position, version, options); });
    }

    function useTextOverlay(stream, audioId) {
        var selectedPlayer = player;
        var generation = ++subtitleSearchGeneration;
        setStatus("Loading text subtitles...");
        playerClient.subtitleText(stream.id, stream.codec).then(function (text) {
            if (player !== selectedPlayer || playerClosing || generation !== subtitleSearchGeneration) { return; }
            reloadTracks(audioId, stream.id, window.VemmSubtitles.parse(text), stream.index === undefined ||
                stream.index === null);
        }).catch(function (error) {
            if (player === selectedPlayer && !playerClosing && generation === subtitleSearchGeneration) { showPlayerError(error); }
        });
    }

    function subtitleSearchLanguages(first) {
        var seen = [];
        function add(tag) {
            var code = window.VemmSubtitleSearch.twoLetter(tag);
            if (code && seen.indexOf(code) === -1) { seen.push(code); }
        }
        add(first);
        (player.part().Stream || []).forEach(function (stream) { add(stream.languageCode || stream.languageTag); });
        add(preferences.language);
        add("en");
        return seen;
    }

    // Read-only search; picking a result is the only server write and needs an explicit OK.
    function openSubtitleSearch(language) {
        if (!player) { return; }
        cancelHudTimer();
        var search = window.VemmSubtitleSearch;
        var generation = ++subtitleSearchGeneration;
        var selectedPlayer = player;
        var ratingKey = playerItem.ratingKey;
        var audioId = player.selection().audioId;
        var old = document.getElementById("player-menu");
        if (old) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu player-menu-left");
        menu.id = "player-menu";
        menu.plexDismiss = function () { openTracks("subtitle"); };
        menu.appendChild(element("h2", "", translate("Search for subtitles")));
        var languages = subtitleSearchLanguages(language);
        var languageButton = button(menu, translate("Language: {language}", { language: language }), function () {
            openSubtitleSearch(languages[(languages.indexOf(language) + 1) % languages.length]);
        }, true, "settings");
        var results = group(menu, translate("Results"), "track-group");
        var note = element("p", "help-text", translate("Searching for subtitles..."));
        note.setAttribute("aria-live", "polite");
        results.appendChild(note);
        screen.appendChild(menu);
        languageButton.focus();
        function current() { return player === selectedPlayer && generation === subtitleSearchGeneration; }
        function retry() { openSubtitleSearch(language); }
        playerClient.searchSubtitles(ratingKey, language).then(function (container) {
            if (!current()) { return; }
            var hits = search.hitsOf(container);
            if (!hits.length) {
                note.textContent = translate("No subtitles found for this language.");
                return;
            }
            note.textContent = translate("Choosing a result adds it to this item on your Plex server.");
            hits.forEach(function (hit) {
                var label = [hit.title || hit.language || translate("Subtitle"), hit.provider,
                    hit.hearingImpaired ? "SDH" : "", hit.forced ? translate("Forced") : ""]
                    .filter(Boolean).join(" / ");
                var choice = button(results, label, function () { downloadSubtitle(hit); }, true);
                choice.setAttribute("aria-label", label + ", " + translate("score {score}", { score: hit.score }));
            });
        }).catch(function (error) {
            if (!current()) { return; }
            var verdict = search.failure(error);
            note.textContent = translate(verdict === "denied" ? "This Plex account cannot search for subtitles on this server." :
                verdict === "missing" ? "This item is no longer on the server." :
                verdict === "bad-language" ? "Plex cannot search subtitles in this language." :
                "The subtitle search failed. Check the connection and try again.");
            if (verdict === "transport") { button(results, "Retry", retry).focus(); }
        });
        function downloadSubtitle(hit) {
            if (!current()) { return; }
            generation = ++subtitleSearchGeneration;
            Array.prototype.forEach.call(results.querySelectorAll("button"), function (node) { node.disabled = true; });
            note.textContent = translate("Adding the subtitle to your Plex server...");
            search.download(playerClient, ratingKey, hit, { alive: current }).then(function (stream) {
                if (!current()) { return; }
                if (!stream) {
                    note.textContent = translate("Plex accepted the subtitle but has not finished adding it. Open Audio and subtitles again shortly.");
                    return;
                }
                if (["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    useTextOverlay(stream, audioId);
                } else {
                    reloadTracks(audioId, stream.id);
                }
            }).catch(function (error) {
                if (!current()) { return; }
                var verdict = search.failure(error);
                note.textContent = translate(verdict === "denied" ? "This Plex account cannot add subtitles on this server." :
                    verdict === "missing" ? "This item is no longer on the server." :
                    "Adding the subtitle failed. Search again and pick a fresh result.");
                Array.prototype.forEach.call(results.querySelectorAll("button"), function (node) { node.disabled = false; });
                if (verdict === "transport") { button(results, "Search again", retry).focus(); }
            });
        }
    }

    // Marks a track-menu row: opens a sub-list (hasSub, shows the › indicator) and/or sits inside one (inside, indented).
    function subList(control, inside, nested) {
        if (!nested) { control.className += " menu-has-sub"; }
        if (inside || nested) { control.className += " menu-sub-item"; }
        return control;
    }

    function openTracks(type, language) {
        if (!player) { return; }
        type = type || "subtitle";
        cancelHudTimer();
        var old = document.getElementById("player-menu");
        if (old && old.parentNode) { old.parentNode.removeChild(old); }
        var menu = element("section", "player-menu player-menu-left");
        menu.id = "player-menu";
        // Back from a language's tracks returns to the languages; from the languages it closes.
        menu.plexDismiss = function () { if (language) { openTracks(type); } else { closeTrackMenu(type); } };
        menu.appendChild(element("h2", "", translate(type === "audio" ? "Audio" : "Subtitles")));
        var current = player.selection();
        var reload = reloadTracks;
        var streams = (player.part().Stream || []).filter(function (stream) {
            return stream.streamType === (type === "audio" ? 2 : 3);
        });
        var languageNames = [];
        streams.forEach(function (stream) {
            var name = stream.language || stream.languageTag || stream.languageCode || translate("Other languages");
            if (languageNames.indexOf(name) === -1) { languageNames.push(name); }
        });
        var preferred = languageNames.filter(function (name) {
            var stream = streams.filter(function (entry) {
                return (entry.language || entry.languageTag || entry.languageCode) === name;
            })[0];
            var code = stream && (stream.languageCode || stream.languageTag || "");
            return code.toLowerCase().slice(0, 2) === preferences.language.slice(0, 2);
        })[0];
        if (language === "__other_languages") {
            var otherOptions = languageNames.filter(function (name) { return name !== preferred; });
            otherOptions.forEach(function (name) {
                subList(button(menu, name, function () { openTracks(type, name); }, false, "language"), true);
            });
        } else if (!language) {
            if (preferred) {
                subList(button(menu, preferred, function () { openTracks(type, preferred); }, false, "language"));
            } else {
                languageNames.forEach(function (name) {
                    subList(button(menu, name, function () { openTracks(type, name); }, false, "language"));
                });
            }
        } else {
            var matching = streams.filter(function (stream) {
                return (stream.language || stream.languageTag || stream.languageCode || translate("Other languages")) === language;
            });
            matching.forEach(function (stream) {
                var label = stream.displayTitle || stream.language || stream.codec || String(stream.id);
                var choice = button(menu, label, function () {
                    if (type === "audio") { reload(stream.id, current.subtitleId, externalCues); }
                    else { reload(current.audioId, stream.id); }
                });
                subList(choice, false, true);
                choice.setAttribute("aria-pressed", String(type === "audio" ?
                    String(current.audioId) === String(stream.id) :
                    !externalCues && String(current.subtitleId) === String(stream.id)));
                if (type === "subtitle" && ["srt", "subrip", "webvtt"].indexOf(stream.codec) !== -1) {
                    subList(button(menu, translate("Text overlay / {track}", { track: label }), function () {
                        useTextOverlay(stream, current.audioId);
                    }), false, true);
                }
            });
        }
        if (type === "subtitle") {
            if (playerItem.type === "movie" || playerItem.type === "episode") {
                button(menu, "Search for subtitles", function () {
                    openSubtitleSearch(window.VemmSubtitleSearch.defaultLanguage(player.part(), preferences.language));
                });
            }
            if (externalCues) { button(menu, "Subtitle timing", openSubtitleTiming); }
            var appearance = group(menu, translate("Text overlay appearance"), "track-group");
            appearance.appendChild(element("p", "help-text", translate("These settings apply only to the app-rendered SRT/WebVTT text overlay, not device-native or burned subtitles.")));
            function cycleAppearance(title, preferenceKey, values, labelForValue) {
                button(appearance, translate("{setting}: {value}", {
                    setting: translate(title), value: translate(labelForValue(preferences[preferenceKey]))
                }), function () {
                    var index = values.indexOf(preferences[preferenceKey]);
                    preferences[preferenceKey] = values[(index + 1) % values.length];
                    if (savePreferences()) {
                        refreshSubtitleAppearance();
                        openTracks("subtitle");
                    }
                }, false, "settings");
            }
            cycleAppearance("Text size", "subtitleSize", ["small", "medium", "large", "extra_large"],
                function (value) { return { small: "Small", medium: "Medium", large: "Large", extra_large: "Extra large" }[value]; });
            cycleAppearance("Text position", "subtitlePosition", ["low", "middle", "high"], function (value) { return value; });
            cycleAppearance("Text color", "subtitleColor", SUBTITLE_COLORS, colorName);
            cycleAppearance("Text background", "subtitleBackground", ["off", "on"], backgroundName);
        }
        button(menu, "Subtitles off", function () { reload(current.audioId, 0); })
            .setAttribute("aria-pressed", String(!current.subtitleId && !externalCues));
        var other = languageNames.filter(function (name) { return name !== preferred; });
        if (!language && preferred && other.length) {
            subList(button(menu, "Other languages", function () { openTracks(type, "__other_languages"); }, false, "language"));
        }
        var rememberedShow = trackMemoryShow(playerItem);
        if (rememberedShow && window.VemmTrackMemory && window.VemmTrackMemory.recall(window.localStorage, rememberedShow)) {
            button(menu, "Reset to default tracks", function () {
                window.VemmTrackMemory.forget(window.localStorage, rememberedShow);
                setStatus("Other episodes of this show use the default tracks.");
                openTracks(type, language);
            });
        }
        if (!language && type === "subtitle" && !streams.length) {
            menu.appendChild(element("p", "help-text", translate("No subtitle tracks are available.")));
        }
        var nativeTracks = element("div", "native-tracks");
        nativeTracks.hidden = true;
        try {
            player.tracks().forEach(function (track) {
                if (track.type !== "AUDIO" && track.type !== "TEXT") { return; }
                subList(button(nativeTracks, translate("Samsung {type} track {number}", { type: translate(track.type), number: track.index }), function () {
                    try {
                        player.selectTrack(track.type, track.index);
                        if (track.type === "TEXT") { player.subtitles(true); }
                        setStatus("Samsung track selected. Verify the output on this model.");
                    } catch (error) { showPlayerError(error); }
                }), false, true);
            });
        } catch (error) { menu.appendChild(element("p", "inline-error", errorText(error))); }
        if (nativeTracks.querySelectorAll("button").length) {
            subList(button(menu, "Device tracks", function () {
                nativeTracks.hidden = !nativeTracks.hidden;
            }, false, "settings"));
            menu.appendChild(nativeTracks);
        }
        screen.appendChild(menu);
        var control = menu.querySelectorAll("button")[0];
        if (control) { control.focus(); }
    }

    function openQuality() {
        if (!player) { return; }
        var menu = playerSubmenu("Quality and media version", "quality");
        menu.appendChild(element("p", "help-text", translate("Original source") + ": " + qualityLabel(player.quality().source)));
        function change(quality, version) {
            if (quality === chosen && version === playerSettings.mediaIndex) { openPlaybackOptions("quality"); return; }
            var item = playerItem;
            var client = playerClient;
            var position = player.snapshot().position;
            var tracks = { audioId: playerSettings.audioId, subtitleId: playerSettings.subtitleId, cues: externalCues,
                paused: wantsPause() };
            preferences.quality = quality;
            stopPlayer(function () { startPlayer(item, client, position, version, tracks); });
        }
        var current = player.quality();
        var originalDirect = window.VemmPlayback && window.VemmPlayback.plan(playerItem, {
            mediaIndex: playerSettings.mediaIndex, quality: "original", profile: playerSettings.profile,
            directPlay: preferences.directPlay,
            overlaySubtitle: playerSettings.overlaySubtitle, audioId: playerSettings.audioId,
            subtitleId: playerSettings.subtitleId }).direct;
        menu.appendChild(element("p", "help-text", translate("Now playing") + ": " + modeName(current.mode) + " · " +
            qualityLabel(current.mode === "direct" ? current.source : current.stream)));
        if (preferences.directPlay === "force") {
            menu.appendChild(element("p", "help-text",
                translate("Direct play is set to Force in Settings, so the original file is always used.")));
        }
        var speed = recentSpeed();
        var source = (playerItem.Media || [])[playerSettings.mediaIndex] || {};
        // A saved quality at or above what this file needs asks for the same as its top choice.
        var top = qualityTop(source, originalDirect);
        var chosen = qualityFor(playerSettings.quality, top);
        qualityGroups(chosen, source, top).forEach(function (resolution) {
            if (preferences.directPlay === "force" && resolution.lines) { return; }
            var list = group(menu, resolution.title, "menu-group");
            resolution.qualities.forEach(function (quality) {
                var row = button(list, qualityChoiceName(quality, source, top),
                    function () { change(quality, playerSettings.mediaIndex); }, true);
                if (window.VemmPlayback.warns(quality === "original" ? (isFinite(top) ? top : 0) : qualityKbps(quality), speed)) {
                    markSlow(row);
                }
                row.setAttribute("aria-pressed", String(chosen === quality));
            });
        });
        (playerItem.Media || []).forEach(function (media, version) {
            if (playerItem.Media.length < 2) { return; }
            button(menu, translate("Version {number} / {quality}", { number: version + 1, quality: qualityLabel(media) }) +
                    (Number(media.proxyType) === 42 ? " · " + translate("Optimized version") : ""),
                function () { change(preferences.quality, version); })
                .setAttribute("aria-pressed", String(playerSettings.mediaIndex === version));
        });
        screen.appendChild(menu);
        (menu.querySelector('[aria-pressed="true"]') || menu.querySelector("button")).focus();
    }

    function finishEpisode(startNow, suppliedSuccessor) {
        if (playerItem.type === "track" && musicQueue) { skipMusic(1, true); return; }
        var item = playerItem;
        var client = playerClient;
        var queue = playerSettings && playerSettings.playQueue;
        function nextQueue(next) { return queue && queue.playlist ? window.VemmPlaylists.advance(queue, next) : null; }
        stopPlayer(function () {
            renderDetail(item, client);
            var generation = viewGeneration;
            var successor = suppliedSuccessor || queueSuccessor(queue);
            (successor || queue && queue.playlist ? Promise.resolve(successor) : client.nextEpisode(item)).then(function (next) {
                if (!next || player || playerItem !== item || generation !== viewGeneration) { return; }
                button(screen, translate("Up Next: {title}", { title: next.title }), function () {
                    if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
                    openDetail(next.ratingKey, client);
                });
                if (startNow === true && !document.hidden) {
                    client.getMetadata(next.ratingKey).then(function (metadata) {
                        if (generation === viewGeneration && !player) { playlistQueue = nextQueue(next); startPlayer(metadata, client, 0); }
                    }).catch(showPlayerError);
                } else if (preferences.nextEpisode !== "off" && !document.hidden) {
                    setStatus("Next episode starts in 10 seconds. Back cancels.");
                    nextTimer = setTimeout(function () {
                        nextTimer = null;
                        client.getMetadata(next.ratingKey).then(function (metadata) {
                            if (generation === viewGeneration && !player) { playlistQueue = nextQueue(next); startPlayer(metadata, client, 0); }
                        }).catch(showPlayerError);
                    }, 10000);
                }
            }).catch(showPlayerError);
        });
    }

    // The server's continuous play queue knows the next item (including across seasons);
    // Plex's next-episode lookup is the fallback when no queue was created.
    function queueSuccessor(queue) {
        if (!queue || !queue.items) { return null; }
        if (queue.playlist) { return window.VemmPlaylists.successor(queue); }
        for (var index = 0; index < queue.items.length - 1; index += 1) {
            if (String(queue.items[index].playQueueItemID) === String(queue.itemId)) {
                var next = queue.items[index + 1];
                return next && next.ratingKey && next.type === "episode" ? next : null;
            }
        }
        return null;
    }

    // values and current may be functions, so the page can be rebuilt after the speed changes.
    // extra(menu, notes) adds controls after the options and info text below the card.
    function settingsChoices(title, values, current, choose, extra) {
        retryView = null;
        visit(function renderChoices() {
            viewGeneration += 1;
            clear(screen);
            page(translate(title), "settings");
            var menu = element("section", "settings-menu");
            screen.appendChild(menu);
            var notes = element("div", "settings-notes");
            var holder = menu;
            var heading;
            var selected = typeof current === "function" ? current() : current;
            (typeof values === "function" ? values() : values).forEach(function (value) {
                // A value may carry a group heading; each group is one column under its title.
                if (value.group !== undefined && value.group !== heading) {
                    heading = value.group;
                    holder = group(menu, heading, "settings-group");
                }
                var row = button(holder, value.label, function () { choose(value.value); }, value.literal);
                row.setAttribute("aria-pressed", String(selected === value.value));
                if (value.warn) { markSlow(row); }
                if (value.swatch) {
                    row.className += " swatch-choice";
                    row.setAttribute("data-color", value.swatch);
                }
            });
            if (extra) { extra(menu, notes); }
            button(menu, "Back", backView);
            screen.appendChild(notes);
            restoreView = renderChoices;
            setStatus("");
            focusFirst();
        });
    }

    // The artwork storage limit, library artwork and used-space readout; shown while saving artwork is on.
    function artworkOptions(parent, notes) {
        var megabyte = 1024 * 1024;
        function size(bytes) { return Math.round(bytes / megabyte * 10) / 10 + " MB"; }
        button(parent, translate("Artwork storage limit: {size} MB", { size: preferences.artworkLimitMb }), function () {
            readDeviceStats(function (stats) {
                var choices = window.VemmPreferences.artworkLimitChoices(stats ? stats.quota : null, preferences.artworkLimitMb);
                settingsChoices("Artwork storage limit", choices.map(function (mb) {
                    return { value: mb, label: mb + " MB", literal: true };
                }), preferences.artworkLimitMb, function (mb) {
                    var previous = preferences.artworkLimitMb;
                    preferences.artworkLimitMb = mb;
                    if (!savePreferences()) { preferences.artworkLimitMb = previous; return; }
                    if (artworkStore) {
                        artworkStore.setLimit(mb * megabyte);
                        artworkStore.trim();
                    }
                    backView();
                });
            });
        }, true, "settings");
        var library = button(parent, translate("Save library artwork too: {state}", {
            state: translate(preferences.saveLibraryArtwork ? "On" : "Off")
        }), function () {
            var previous = preferences.saveLibraryArtwork;
            preferences.saveLibraryArtwork = !previous;
            if (!savePreferences()) { preferences.saveLibraryArtwork = previous; return; }
            if (!preferences.saveLibraryArtwork && artworkStore) { artworkStore.removeCategory("library"); }
            openSettings(settingsSection);
        }, true, "settings");
        library.setAttribute("aria-pressed", String(preferences.saveLibraryArtwork));
        var preload = button(parent, translate("Load saved artwork at startup: {state}", {
            state: translate(preferences.preloadArtwork ? "On" : "Off")
        }), function () {
            var previous = preferences.preloadArtwork;
            preferences.preloadArtwork = !previous;
            if (!savePreferences()) { preferences.preloadArtwork = previous; return; }
            if (preferences.preloadArtwork) { preloadArtwork(); } else { dropSavedArtwork(); }
            openSettings(settingsSection);
        }, true, "settings");
        preload.setAttribute("aria-pressed", String(preferences.preloadArtwork));
        var used = element("p", "help-text");
        notes.appendChild(used);
        if (artworkStore) {
            artworkStore.usage().then(function (usage) {
                if (!usage) { return; }
                used.textContent = translate("Saved artwork: {total} of {limit} MB (Home {home} · Library {library})", {
                    total: size(usage.home + usage.library), limit: preferences.artworkLimitMb,
                    home: size(usage.home), library: size(usage.library) });
            });
        }
    }

    var accountAudio = { client: null, state: "idle", value: null, error: null };

    function accountAudioError(error) {
        return translate(error && (error.status === 401 || error.status === 403) ?
            "Sign in to this Plex profile again to edit its account preferences." :
            "Plex account preferences are unavailable.") + " " + translate("Select Retry.");
    }

    function loadAccountAudio(refresh) {
        var client = accountClient;
        var cached = readAccountAudioCache();
        accountAudio = { client: client, state: cached ? "ready" : "loading", value: cached, error: null };
        refresh();
        client.accountPreferences().then(function (payload) {
            if (accountAudio.client !== client) { return; }
            var fresh = window.PlexAccountPreferences.parse(payload);
            var changed = accountAudio.state !== "ready" || JSON.stringify(accountAudio.value) !== JSON.stringify(fresh);
            writeAccountAudioCache(fresh);
            if (!changed) { return; }
            accountAudio.value = fresh;
            accountAudio.state = "ready";
            refresh();
        }).catch(function (error) {
            if (accountAudio.client !== client) { return; }
            if (accountAudio.state === "ready") { return; }
            if (error && error.code === "cancelled") { accountAudio.state = "idle"; return; }
            accountAudio.state = "error";
            accountAudio.error = accountAudioError(error);
            refresh();
        });
    }

    function saveAccountAudio(change) {
        var client = accountClient;
        var update = window.PlexAccountPreferences.update(accountAudio.value, change);
        setStatus(translate("Saving to your Plex account…"));
        client.saveAccountPreferences(update.query).then(function () {
            if (accountAudio.client !== client) { return; }
            accountAudio.value = update.next;
            writeAccountAudioCache(update.next);
            setStatus("");
            backView();
        }).catch(function (error) {
            if (accountAudio.client !== client) { return; }
            setStatus(accountAudioError(error), true);
        });
    }

    function accountAudioGroup(menu, notes) {
        var section = group(menu, "", "settings-group");
        var generation = viewGeneration;
        function refresh() {
            if (generation !== viewGeneration || !section.parentNode) { return; }
            var focused = section.contains(document.activeElement);
            renderAccountAudio(section, notes, refresh);
            if (focused && !section.contains(document.activeElement)) {
                var first = section.querySelector("button");
                if (first) { first.focus(); }
            }
        }
        if (accountAudio.client !== accountClient || accountAudio.state === "idle") {
            loadAccountAudio(refresh);
        } else {
            renderAccountAudio(section, notes, refresh);
        }
    }

    function renderAccountAudio(section, notes, refresh) {
        var api = window.PlexAccountPreferences;
        clear(section);
        clear(notes);
        notes.appendChild(element("p", "help-text", translate("Language preferences synced with your Plex account.")));
        if (accountAudio.state === "loading") {
            notes.appendChild(element("p", "help-text", translate("Loading your Plex account preferences…")));
            return;
        }
        if (accountAudio.state === "error") {
            notes.appendChild(element("p", "inline-error", accountAudio.error));
            button(section, "Retry", function () { loadAccountAudio(refresh); }, false, "refresh");
            return;
        }
        var value = accountAudio.value;
        var subtitleModes = ["Off (manual selection)", "When audio isn't in the subtitle language", "Always"];
        var forcedModes = ["Prefer non-forced subtitles", "Prefer forced subtitles", "Only forced subtitles", "Only non-forced subtitles"];
        function languageOptions(none) {
            return [{ value: "", label: translate(none) }].concat(api.picker().map(function (language) {
                return { value: language.code, label: language.name, literal: true };
            }));
        }
        function row(title, label, open) {
            button(section, translate("{setting}: {value}", { setting: translate(title), value: label }), open, true, "settings");
        }
        row("Preferred audio language", value.audioLanguage ? api.label(value.audioLanguage) : translate("Original"), function () {
            settingsChoices("Preferred audio language", languageOptions("Original"),
                value.autoSelectAudio === false ? null : api.canonical(value.audioLanguage || ""),
                function (code) { saveAccountAudio({ audioLanguage: code }); });
        });
        if (value.autoSelectAudio === false) {
            notes.appendChild(element("p", "help-text", translate("Automatic selection is off. Choosing a language enables it.")));
        }
        row("Subtitles", translate(subtitleModes[value.subtitleMode]), function () {
            settingsChoices("Subtitles", api.SUBTITLE_MODES.map(function (mode) {
                return { value: mode, label: translate(subtitleModes[mode]) };
            }), value.subtitleMode, function (mode) { saveAccountAudio({ subtitleMode: mode }); });
        });
        row("Subtitle language", value.subtitleLanguage ? api.label(value.subtitleLanguage) : translate("No preference"), function () {
            settingsChoices("Subtitle language", languageOptions("No preference"), api.canonical(value.subtitleLanguage || ""),
                function (code) { saveAccountAudio({ subtitleLanguage: code }); });
        });
        row("Forced subtitles", translate(forcedModes[value.subtitleForced]), function () {
            settingsChoices("Forced subtitles", api.FORCED_MODES.map(function (mode) {
                return { value: mode, label: translate(forcedModes[mode]) };
            }), value.subtitleForced, function (mode) { saveAccountAudio({ subtitleForced: mode }); });
        });
        notes.appendChild(element("p", "help-text", translate("Saved to this Plex profile and shared with your other Plex apps. Changes may take time to affect playback; selections already made for an item still take priority.")));
    }

    function openAbout() {
        retryView = null;
        viewGeneration += 1;
        clear(screen);
        page(translate("About Vemm"), "about");
        var identity = element("section", "about-brand");
        var mark = element("img", "about-brand-mark");
        mark.src = "brand/vemm-mark.svg";
        mark.alt = "";
        identity.appendChild(mark);
        identity.appendChild(element("h2", "", product.name));
        identity.appendChild(element("p", "about-pronunciation",
            translate("Pronounced {pronunciation}, one syllable.", { pronunciation: product.pronunciation })));
        identity.appendChild(element("p", "about-tagline", translate(product.tagline)));
        screen.appendChild(identity);
        screen.appendChild(element("p", "help-text",
            translate("Vemm is an independent, unofficial Plex-compatible media player for Samsung Tizen.")));
        screen.appendChild(element("p", "help-text working-brand-status",
            translate("Vemm is a working brand. Trademark clearance and repository migration are not complete.")));
        screen.appendChild(element("p", "help-text",
            translate("Updates keep the existing Samsung application identity, saved settings and signing continuity.")));
        // Typing the developer code with the remote's number keys while this line is focused unlocks developer mode.
        var version = "";
        try { version = window.tizen.application.getCurrentApplication().appInfo.version || ""; } catch (error) { version = ""; }
        var versionLine = button(screen, version ? translate("Version {version}", { version: version }) : translate("Version"),
            function () {}, true, "info");
        versionLine.vemmDevCode = "";
        button(screen, "Back", backView);
        restoreView = openAbout;
        setStatus("");
        focusFirst();
    }

    var settingsSection = "";

    // Each section builds its controls into the page menu; the Settings page lists the available ones.
    function settingsSections() {
        var sections = [{ title: "Playback", build: function (menu, notes) {
            var playbackSettings = group(menu, "", "settings-group");
            button(playbackSettings, translate("Quality: {quality}", { quality: qualityName(preferences.quality) }), function () {
                // Recomputed on every render, so a recheck or a new choice shows up when coming back.
                function choices() {
                    var speed = recentSpeed();
                    var list = [];
                    qualityGroups(preferences.quality).forEach(function (resolution) {
                        resolution.qualities.forEach(function (quality) {
                            list.push({ value: quality, label: qualityName(quality), group: resolution.title,
                                warn: quality !== "original" && window.VemmPlayback.warns(qualityKbps(quality), speed) });
                        });
                    });
                    return list;
                }
                settingsChoices("Quality", choices, function () { return preferences.quality; }, function (quality) {
                    preferences.quality = quality;
                    if (savePreferences()) { backView(); }
                }, function (menu, notes) {
                    button(menu, "Recheck speed", openSpeedTest, false, "server");
                    var speed = recentSpeed();
                    if (!speed) { return; }
                    var mbps = Math.round(speed.mbps * 10) / 10;
                    notes.appendChild(element("p", "help-text", speed.count === 1 ?
                        translate("Recent speed: {mbps} Mbps (1 test)", { mbps: mbps }) :
                        translate("Recent speed: {mbps} Mbps (average of {count} tests)", { mbps: mbps, count: speed.count })));
                    notes.appendChild(element("p", "help-text", translate("Options with a warning icon may buffer on your connection.")));
                });
            }, false, "settings");
            button(playbackSettings, "Test connection speed", openSpeedTest, false, "server");
            preferenceChoice(playbackSettings, "Minimum buffer", "minBuffer", bufferChoices(), bufferName);
            bufferWarning(null, notes);
            preferenceChoice(playbackSettings, "Skip interval", "skipInterval", [5, 10, 15, 30, 60],
                function (seconds) { return seconds + " seconds"; });
            preferenceChoice(playbackSettings, "Intros", "skipIntro", SKIP_MODES,
                function (mode) { return SKIP_MODE_NAMES[mode]; });
            preferenceChoice(playbackSettings, "Credits", "skipCredits", SKIP_MODES,
                function (mode) { return SKIP_MODE_NAMES[mode]; });
            preferenceChoice(playbackSettings, "Next episode", "nextEpisode", ["countdown", "after_credits", "off"],
                function (value) {
                    return { countdown: "Countdown during credits", after_credits: "Play after credits", off: "Off" }[value];
                });
            preferenceChoice(playbackSettings, "Direct play", "directPlay", ["auto", "force", "off"],
                function (value) { return { auto: "Auto", force: "Force", off: "Off" }[value]; });
            button(playbackSettings, translate("Continue Watching: {state}", {
                state: translate(preferences.continueAction === "play" ? "Play" : "Open details")
            }), function () {
                preferences.continueAction = preferences.continueAction === "play" ? "details" : "play";
                if (savePreferences()) { openSettings(settingsSection); }
            }, false, "play");
        } }];
        if (accountClient && window.PlexAccountPreferences) {
            sections.push({ title: "Audio & subtitles", build: accountAudioGroup });
        }
        sections.push({ title: "Text overlay appearance", build: function (menu, notes) {
            var subtitleSettings = group(menu, "", "settings-group");
            var previewToggle = button(subtitleSettings, translate("Preview: {state}", {
                state: translate(subtitlePreview ? "On" : "Off")
            }), function () {
                subtitlePreview = !subtitlePreview;
                previewToggle.setAttribute("aria-pressed", String(subtitlePreview));
                previewToggle.textContent = translate("Preview: {state}", { state: translate(subtitlePreview ? "On" : "Off") });
                syncSubtitlePreview();
                notes.hidden = subtitlePreview;
            }, false, "subtitles");
            previewToggle.setAttribute("aria-pressed", String(subtitlePreview));
            syncSubtitlePreview();
            notes.hidden = subtitlePreview;
            notes.appendChild(element("p", "help-text", translate("These settings apply only to the app-rendered SRT/WebVTT text overlay, not device-native or burned subtitles.")));
            preferenceChoice(subtitleSettings, "Text size", "subtitleSize", ["small", "medium", "large", "extra_large"],
                function (value) { return { small: "Small", medium: "Medium", large: "Large", extra_large: "Extra large" }[value]; });
            preferenceChoice(subtitleSettings, "Text position", "subtitlePosition", ["low", "middle", "high"], function (value) { return value; });
            preferenceChoice(subtitleSettings, "Text color", "subtitleColor", SUBTITLE_COLORS, colorName);
            preferenceChoice(subtitleSettings, "Text background", "subtitleBackground", ["off", "on"], backgroundName);
        } });
        if (currentClient && currentServerId) {
            sections.push({ title: "Libraries", build: function (menu) {
                var librarySettings = group(menu, "", "settings-group");
                button(librarySettings, "Favorite libraries", function () { visit(function () { openFavorites(false); }); });
                var advanceToggle = button(librarySettings, translate("Auto-advance featured titles: {state}", {
                    state: translate(preferences.autoAdvanceFeatures ? "On" : "Off")
                }), function () {
                    var previous = preferences.autoAdvanceFeatures;
                    preferences.autoAdvanceFeatures = !previous;
                    if (!savePreferences()) { preferences.autoAdvanceFeatures = previous; return; }
                    openSettings(settingsSection);
                }, false, "settings");
                advanceToggle.setAttribute("aria-pressed", String(preferences.autoAdvanceFeatures));
                button(librarySettings, translate("Ratings shown: {count} of {total}", {
                    count: preferences.ratingSources.length, total: window.VemmPreferences.ratingSources.length
                }), openRatingSourceChoices, false, "settings");
                if (isServerOwner()) { libraryRatingSourceEntry(librarySettings, currentClient); }
            } });
        }
        if (accountClient || (currentClient && currentServerId && window.VemmHomeRows)) {
            sections.push({ title: "Home", build: function (menu, notes) {
                var home = group(menu, "", "settings-group");
                if (accountClient) {
                    var autoOpen = button(home, translate("Open last profile on launch: {state}", {
                        state: translate(preferences.autoOpenProfile ? "On" : "Off")
                    }), function () {
                        var previous = preferences.autoOpenProfile;
                        preferences.autoOpenProfile = !previous;
                        if (!savePreferences()) { preferences.autoOpenProfile = previous; return; }
                        openSettings(settingsSection);
                    }, true, "profile");
                    autoOpen.setAttribute("aria-pressed", String(preferences.autoOpenProfile));
                    notes.appendChild(element("p", "help-text", translate(
                        "Skips Who is watching? and opens Home with the profile used last. A profile with a PIN still asks for it.")));
                }
                if (currentClient && currentServerId && window.VemmHomeRows) {
                    button(home, "Home rows", function () { visit(openHomeRows); }, false, "television");
                }
            } });
        }
        sections.push({ title: "Language", build: function (menu) {
            var languages = group(menu, "", "settings-group");
            var names = { en: "English", es: "Español", be: "Беларуская" };
            button(languages, translate("Language") + ": " + names[preferences.language], function () {
                settingsChoices("Language", ["en", "es", "be"].map(function (language) {
                    return { value: language, label: names[language] };
                }), preferences.language, function (language) {
                    preferences.language = language;
                    if (savePreferences()) { backView(); }
                });
            }, false, "language");
        } });
        if (window.VemmTheme) {
            sections.push({ title: "Appearance", build: function (menu, notes) {
                var theme = window.VemmTheme;
                var appearance = group(menu, "", "settings-group");
                preferenceChoice(appearance, "Theme", "theme", window.VemmPreferences.themes,
                    function (id) { return theme.themes[id].label; }, function (id) { return "theme-" + id; });
                preferenceChoice(appearance, "Accent", "accent", window.VemmPreferences.accents, function (id) {
                    return id === "theme" ? "Match theme" : theme.accents[id].label;
                }, function (id) { return "accent-" + theme.resolve(preferences.theme, id).accent; });
                notes.appendChild(element("p", "help-text", translate("Pure black switches unused pixels off on OLED screens.")));
                notes.appendChild(element("p", "help-text",
                    translate("The accent colours progress bars, the play button and selected items.")));
            } });
        }
        if (accountToken || currentClient) {
            sections.push({ title: "Graphics", build: function (menu, notes) {
                var graphicsSettings = group(menu, "", "settings-group");
                var graphicsToggle = button(graphicsSettings, translate("New graphics enhancements: {state}", {
                    state: translate(preferences.enhancedGraphics ? "On" : "Off")
                }), function () {
                    var previous = preferences.enhancedGraphics;
                    preferences.enhancedGraphics = !previous;
                    if (!savePreferences()) { preferences.enhancedGraphics = previous; return; }
                    graphicsFailure = false;
                    if (graphics) { graphics.setEnabled(preferences.enhancedGraphics && !!currentClient); }
                    openSettings(settingsSection);
                }, false, "settings");
                graphicsToggle.setAttribute("aria-pressed", String(preferences.enhancedGraphics));
                notes.appendChild(element("p", "help-text", translate(
                    "Optional WebGL artwork rendering. Off by default. Existing Home acceleration and AVPlay stay enabled. Unsupported features automatically use the existing renderer.")));
                notes.appendChild(element("p", "help-text", translate(graphicsFailure ?
                    "New graphics enhancements are unavailable here. Existing graphics remain active." :
                    preferences.enhancedGraphics ?
                        "Support is checked when artwork loads. This setting does not force hardware video decoding or promise faster playback." :
                        "Only new graphics enhancements are off. Existing acceleration is unchanged.")));
            } });
        }
        sections.push({ title: "Performance", build: function (menu, notes) {
            var performance = group(menu, "", "settings-group");
            var artworkToggle = button(performance, translate("Save Home artwork on this TV: {state}", {
                state: translate(preferences.saveHomeArtwork ? "On" : "Off")
            }), function () {
                var previous = preferences.saveHomeArtwork;
                preferences.saveHomeArtwork = !previous;
                if (!savePreferences()) { preferences.saveHomeArtwork = previous; return; }
                if (!preferences.saveHomeArtwork) {
                    dropSavedArtwork();
                    if (artworkStore) { artworkStore.clear(); }
                }
                openSettings(settingsSection);
            }, false, "settings");
            artworkToggle.setAttribute("aria-pressed", String(preferences.saveHomeArtwork));
            if (preferences.saveHomeArtwork) { artworkOptions(performance, notes); }
        } });
        if (devMode()) {
            sections.push({ title: "Developer", build: function (menu, notes) {
                var tools = group(menu, "", "settings-group");
                button(tools, "Error log", function () { visit(openErrorLog); }, false, "info");
                button(tools, "Turn off developer mode", function () {
                    window.VemmDevMode.setEnabled(window.localStorage, false);
                    openSettings("");
                }, false, "settings");
                notes.appendChild(element("p", "help-text", translate("Technical readouts for diagnosing problems. Stats for nerds also shows playback decisions and buffering while this is on.")));
            } });
        }
        sections.push({ title: "Privacy and data", build: function (menu, notes) {
            var privacy = group(menu, "", "settings-group");
            var storageWarning = "";
            if (accountToken && window.VemmSession) {
                var savedAccount = "";
                try { savedAccount = window.VemmSession.load(window.localStorage); }
                catch (error) { storageWarning = errorText(error); }
                var savedSignIn = savedAccount === accountToken;
                var savedLabel = translate("Stay signed in on this TV") + ": " +
                    translate(savedSignIn ? "On" : "Off");
                var saveSignIn = button(privacy, savedLabel, function () {
                    var shouldSave = saveSignIn.getAttribute("aria-pressed") !== "true";
                    try {
                        if (shouldSave) {
                            window.VemmSession.save(window.localStorage, accountToken);
                            window.VemmSession.setEnabled(window.localStorage, true);
                        } else {
                            window.VemmSession.forget(window.localStorage);
                            window.VemmSession.setEnabled(window.localStorage, false);
                        }
                        saveSignIn.setAttribute("aria-pressed", String(shouldSave));
                        saveSignIn.textContent = translate("Stay signed in on this TV") + ": " +
                            translate(shouldSave ? "On" : "Off");
                        setStatus("");
                    } catch (error) {
                        setStatus("Could not update saved sign-in. Check app storage permissions.", true);
                    }
                }, true);
                saveSignIn.setAttribute("aria-pressed", String(savedSignIn));
                notes.appendChild(element("p", "help-text",
                    translate("Saved Plex credentials are stored unencrypted on this TV.")));
            }
            button(privacy, "Reset preferences", function () {
                try {
                    window.VemmPreferences.reset(window.localStorage);
                    if (window.VemmFavorites) { window.VemmFavorites.reset(window.localStorage); }
                    if (window.VemmRecents) { window.VemmRecents.reset(window.localStorage); }
                    forgetRememberedHome();
                    var storedArtwork = preferences.saveHomeArtwork;
                    preferences = window.VemmPreferences.load(window.localStorage);
                    dropSavedArtwork();
                    if (artworkStore && storedArtwork) { artworkStore.clear(); }
                    graphicsFailure = false;
                    if (graphics) { graphics.setEnabled(false); }
                    window.VemmI18n.setLanguage(preferences.language);
                    applyTheme();
                    openSettings(settingsSection);
                } catch (error) { setStatus("Could not reset preferences. Check app storage permissions.", true); }
            });
            button(privacy, "Diagnostics", function () {
                visit(function () {
                    viewGeneration += 1;
                    clear(screen);
                    page(translate("Diagnostics"), "diagnostics");
                    screen.appendChild(element("p", "help-text", translate("Sign-in is saved on this TV by default. You can turn it off in Settings. Storage is unencrypted. No analytics or crash uploads are enabled.")));
                    screen.appendChild(element("p", "help-text",
                        translate("AVPlay: {state}. {profile}. Model support is not certified. Account tokens, server origins, titles and queries are not logged or uploaded.", {
                            state: translate(window.webapis && window.webapis.avplay ? "available" : "unavailable"), profile: directPlaySummary() })));
                    button(screen, "Back", backView);
                    focusFirst();
                });
            });
            button(privacy, "About Vemm", function () { visit(openAbout); });
            button(privacy, "Sign out", signOut);
            return storageWarning;
        } });
        return sections;
    }

    var homeRowsReorder = null;
    // Which Plex shelves Home shows and their order for this profile and server. Enter shows or hides a row; with
    // Reorder on, Up and Down move the focused row.
    function openHomeRows() {
        retryView = null;
        viewGeneration += 1;
        homeRowsReorder = null;
        clear(screen);
        page(translate("Home rows"), "settings");
        var menu = element("section", "settings-menu");
        screen.appendChild(menu);
        var notes = element("div", "settings-notes");
        screen.appendChild(notes);
        var api = window.VemmHomeRows;
        var storeKey = homeRowsKey();
        var saved = api.load(window.localStorage, storeKey);
        var rows = [];
        var reordering = false;
        var generation = viewGeneration;
        var controls = group(menu, "", "settings-group");
        var list = group(menu, "", "settings-group");
        var reorderToggle = button(controls, translate("Reorder: {state}", { state: translate("Off") }), function () {
            reordering = !reordering;
            homeRowsReorder = reordering ? move : null;
            reorderToggle.setAttribute("aria-pressed", String(reordering));
            reorderToggle.textContent = translate("Reorder: {state}", { state: translate(reordering ? "On" : "Off") });
            setStatus(reordering ? "Press Up or Down on a row to move it." : "");
        }, true, "settings");
        reorderToggle.setAttribute("aria-pressed", "false");
        function persist() {
            saved = api.choose(rows, saved);
            if (!api.save(window.localStorage, storeKey, saved)) { setStatus("Could not save Home rows. Check app storage permissions.", true); }
        }
        function draw(at) {
            clear(list);
            rows.forEach(function (row, index) {
                var node = button(list, row.hub.title || "Plex shelf", function () {
                    row.shown = !row.shown;
                    persist();
                    draw(index);
                }, true, "none");
                node.vemmRow = index;
                node.setAttribute("aria-pressed", String(row.shown));
                if (!row.shown) { node.className += " home-row-hidden"; }
            });
            var nodes = list.querySelectorAll("button");
            if (at !== undefined && nodes[at]) { nodes[at].focus(); }
        }
        function move(index, step) {
            var target = index + step;
            if (target < 0 || target >= rows.length) { return false; }
            var row = rows[index];
            rows[index] = rows[target];
            rows[target] = row;
            persist();
            draw(target);
            return true;
        }
        button(controls, "Show all rows and reset order", function () {
            try { window.localStorage.removeItem(storeKey); } catch (error) { /* nothing saved */ }
            saved = api.load(window.localStorage, storeKey);
            show(serverHubs);
        }, false, "refresh");
        button(menu, "Back", backView);
        notes.appendChild(element("p", "help-text", translate("Enter shows or hides a row. Turn on Reorder, then press Up or Down on a row to move it.")));
        var serverHubs = [];
        function show(hubs) {
            serverHubs = hubs;
            rows = api.arrange(hubs.filter(function (hub) { return hub.Metadata && hub.Metadata.length; }), saved);
            if (!rows.length) { notes.appendChild(element("p", "help-text", translate("No Home shelves were returned."))); }
            draw();
        }
        var cached = homeCache && homeCache.client === currentClient ? homeCache : null;
        if (cached) { show(cached.hubs); } else {
            setStatus("Loading...");
            currentClient.getHomeHubs().then(function (hubs) {
                if (generation !== viewGeneration) { return; }
                setStatus("");
                show(hubs);
            }).catch(function (error) {
                if (generation === viewGeneration) { setStatus(errorText(error), true); }
            });
        }
        restoreView = openHomeRows;
        focusFirst();
    }

    function logTime(at) {
        var date = new Date(at);
        function two(value) { return (value < 10 ? "0" : "") + value; }
        return date.getFullYear() + "-" + two(date.getMonth() + 1) + "-" + two(date.getDate()) + " " +
            two(date.getHours()) + ":" + two(date.getMinutes()) + ":" + two(date.getSeconds());
    }

    // Developer mode: the newest errors the app reported, newest first. Credentials were removed when stored.
    function openErrorLog() {
        retryView = null;
        viewGeneration += 1;
        clear(screen);
        page(translate("Error log"), "settings");
        var menu = element("section", "settings-menu");
        screen.appendChild(menu);
        var entries = window.VemmDevMode.list(window.localStorage).reverse();
        var actions = group(menu, "", "settings-group");
        button(actions, "Clear log", function () {
            window.VemmDevMode.clear(window.localStorage);
            openErrorLog();
        }, false, "refresh");
        button(actions, "Back", backView);
        var list = group(menu, "", "settings-group error-log");
        entries.forEach(function (entry) {
            var logged = entry.message;
            button(list, logTime(entry.at) + "  " + logged, function () {}, true, "none");
        });
        restoreView = openErrorLog;
        setStatus(entries.length ? "" : "No errors recorded.");
        focusFirst();
    }

    function openSettings(section) {
        retryView = null;
        section = typeof section === "string" ? section : "";
        var focusedSetting = section && restoreView && restoreView.settingsSection === section ?
            Array.prototype.slice.call(screen.querySelectorAll("button")).indexOf(document.activeElement) : -1;
        viewGeneration += 1;
        clear(screen);
        var sections = settingsSections();
        var chosen = sections.filter(function (candidate) { return candidate.title === section; })[0];
        settingsSection = chosen ? section : "";
        if (settingsSection !== "Text overlay appearance") { subtitlePreview = false; }
        page(translate(settingsSection || "Settings"), "settings");
        var menu = element("section", "settings-menu");
        menu.setAttribute("aria-label", translate(settingsSection || "Settings"));
        screen.appendChild(menu);
        // Info text goes below the options, outside the list card.
        var notes = element("div", "settings-notes");
        screen.appendChild(notes);
        var warning = "";
        if (chosen) {
            warning = chosen.build(menu, notes) || "";
            var shown = function () { openSettings(section); };
            shown.settingsSection = section;
            restoreView = shown;
        } else {
            var device = element("div", "device-stats");
            notes.appendChild(device);
            // One reading per line: joined, they wrapped mid-phrase at 1080p.
            deviceStatsLines(function (lines) {
                lines.forEach(function (line) { device.appendChild(element("p", "help-text", line)); });
            });
            var sectionIcons = { "Playback": "film", "Audio & subtitles": "audio", "Text overlay appearance": "subtitles",
                "Libraries": "library", "Home": "television", "Developer": "settings", "Profile": "profile", "Language": "language", "Appearance": "palette", "Graphics": "sparkle", "Performance": "gauge", "Privacy and data": "shield" };
            sections.forEach(function (candidate) {
                button(menu, candidate.title, function () {
                    visit(function () { openSettings(candidate.title); });
                }, false, sectionIcons[candidate.title] || "none");
            });
            restoreView = openSettings;
            menu.className += " settings-sections";
        }
        button(menu, "Back", backView);
        setStatus(warning, !!warning);
        focusFirst();
        var controls = screen.querySelectorAll("button");
        if (focusedSetting >= 0 && controls[focusedSetting]) { controls[focusedSetting].focus(); }
    }

    function insideHidden(node) {
        for (var current = node; current; current = current.parentNode) {
            if (current !== document && current.hidden === true) { return true; }
        }
        return false;
    }

    function restoreScrubControl() {
        var controls = screen.querySelectorAll(".playback-controls button");
        var center = screen.querySelectorAll(".playback-center button");
        var target = scrubReturnFocus;
        if (!target || !target.parentNode || target.disabled || insideHidden(target)) {
            target = center.length > 1 ? center[1] : controls[0];
        }
        if (target) { target.focus(); }
    }

    function moveFocus(direction, key) {
        var active = document.activeElement;
        var hud = player && screen.querySelector(".player-hud");
        var playerControls = hud && hud.querySelector(".playback-controls");
        var scrubSurface = hud && hud.querySelector(".playback-progress");
        if (playerControls && scrubSurface && !hud.hidden && key === 38 && playerControls.contains(active)) {
            scrubReturnFocus = active;
            scrubSurface.focus();
            return;
        }
        if (scrubSurface && !hud.hidden && key === 38 && active === scrubSurface) {
            hideHud();
            return;
        }
        if (scrubSurface && !hud.hidden && key === 40 && active === scrubSurface) {
            restoreScrubControl();
            return;
        }
        if (playerControls && !hud.hidden && key === 40 && playerControls.contains(active)) { return; }
        if (player && active && active.parentNode && /chapter-strip/.test(active.parentNode.className || "") && (key === 38 || key === 40)) {
            var chaptersTab = Array.prototype.filter.call(screen.querySelectorAll(".playback-controls .player-tab"), function (node) {
                return node.textContent === translate("Chapters");
            })[0];
            // Down closes the strip so no other control is reachable beneath an open one.
            if (key === 40) { closePlayerPanel(); showHud(); }
            if (chaptersTab) { chaptersTab.focus(); return; }
            if (key === 40) { return; }
        }
        if (browseKey(direction, key, active)) { return; }
        var vertical = key === 38 || key === 40;
        var parent = active && active.parentNode;
        var homeScreen = screen.className.indexOf("screen-home") !== -1;
        var row = !vertical && rowOf(active);
        if (row) {
            var items = usable(row.querySelectorAll("button"));
            var side = items[items.indexOf(active) + direction];
            var account = screen.querySelector(".account-control");
            if (side) {
                sideways = true;
                try { side.focus(); } finally { sideways = false; }
            } else if (hasClass(row, /playback-controls/)) { wrapFocus(items, active, direction); }
            else if (key === 37 && account && !account.disabled &&
                    (hasClass(row, /home-navigation/) || homeScreen && active.vemmCard)) {
                // Down from the account button returns to this card without moving the rows.
                if (active.vemmCard) { homeReturn = active; }
                account.focus();
            } else if (stepFeature && hasClass(row, /home-feature-actions/)) { stepFeature(direction); }
            return;
        }
        var onAccount = hasClass(active, /(?:^| )account-control(?: |$)/);
        if (key === 40 && onAccount && homeReturn && screen.contains(homeReturn) && !homeReturn.disabled) {
            var returnCard = homeReturn;
            homeReturn = null;
            sideways = true;
            try { returnCard.focus(); } finally { sideways = false; }
            return;
        }
        if (key === 39 && onAccount) {
            var accountNavigation = screen.querySelector(".home-navigation");
            if (accountNavigation) { accountNavigation.querySelector("button").focus(); }
            return;
        }
        if (vertical && hasClass(parent, /home-navigation/)) {
            if (key === 38) { return; }
            var featuredAction = screen.querySelector(".home-feature-primary");
            var firstCard = screen.querySelector(".media-card");
            if (featuredAction) {
                screen.className = "screen screen-home";
                if (!moveHome(0)) { screen.scrollTop = 0; }
            }
            if (featuredAction || firstCard) { (featuredAction || firstCard).focus(); return; }
        }
        if (vertical && hasClass(parent, /home-feature-actions/)) {
            var beside = key === 40 ? screen.querySelector(".media-card") : screen.querySelector(".home-navigation button");
            if (beside) { beside.focus(); return; }
        }
        // Home shelves: Up/Down go to the adjacent shelf's card nearest in column; Up from the first shows the hero.
        if (vertical && active.vemmCard && homeScreen) {
            var homeRows = Array.prototype.filter.call(screen.querySelectorAll(".shelf-row"), function (shelfRow) {
                return shelfRow.querySelector(".media-card");
            });
            var rowPosition = homeRows.indexOf(parent);
            if (rowPosition >= 0) {
                var featureAbove = rowPosition === 0 && key === 38 && screen.querySelector(".home-feature-primary");
                if (featureAbove) {
                    screen.className = "screen screen-home";
                    featureAbove.focus();
                    return;
                }
                var targetRow = homeRows[rowPosition + direction];
                if (targetRow) {
                    var sourceBounds = active.getBoundingClientRect();
                    var sourceCenter = sourceBounds.left + sourceBounds.width / 2;
                    var closest = null;
                    var distance = Infinity;
                    usable(targetRow.querySelectorAll(".media-card")).forEach(function (candidate) {
                        var bounds = candidate.getBoundingClientRect();
                        var delta = Math.abs(bounds.left + bounds.width / 2 - sourceCenter);
                        if (delta < distance) { closest = candidate; distance = delta; }
                    });
                    if (closest) { closest.focus(); }
                }
                return;
            }
        }
        var utilities = hasClass(parent, /(?:^| )home-utilities(?: |$)/) && parent;
        var menu = document.getElementById("player-menu");
        var fileInfo = screen.querySelector(".file-info-panel");
        var focusSurface = utilities || (fileInfo && !fileInfo.hidden ? fileInfo : menu || screen);
        var jumpBar = screen.querySelector(".letter-bar");
        var controls = usable(focusSurface.querySelectorAll("button, input, select")).filter(function (node) {
            return !(jumpBar && jumpBar.contains(node));
        });
        var index = controls.indexOf(active);
        if (!controls.length) {
            return;
        }
        if (index < 0) {
            controls[0].focus();
            return;
        }
        // Vertical menus wrap: the account menu, the player's menus and Settings.
        if (vertical && (utilities || focusSurface === menu || screen.className.indexOf("screen-settings") !== -1)) {
            wrapFocus(controls, active, direction);
            return;
        }
        // A grid steps by position (Up/Down a whole row) instead of measuring every card; leaving it falls through.
        if (active.vemmCard && hasClass(parent, /(?:^| )item-list(?: |$)/)) {
            var cards = parent.children;
            var at = Array.prototype.indexOf.call(cards, active);
            var columns = 1;
            while (vertical && columns < cards.length && cards[columns].offsetTop === cards[0].offsetTop) { columns += 1; }
            var target = cards[at + columns * direction];
            if (!target && key === 40 && Math.floor(at / columns) < Math.floor((cards.length - 1) / columns)) {
                target = cards[cards.length - 1];
            }
            if (target && target.vemmCard && !target.disabled) { target.focus(); return; }
        }
        var next = Math.max(0, Math.min(controls.length - 1, index + direction));
        if (active.getBoundingClientRect && key) {
            var source = active.getBoundingClientRect();
            var x = source.left + source.width / 2;
            var y = source.top + source.height / 2;
            var best = Infinity;
            controls.forEach(function (node, candidate) {
                if (node === active) { return; }
                var rect = node.getBoundingClientRect();
                var dx = rect.left + rect.width / 2 - x;
                var dy = rect.top + rect.height / 2 - y;
                var primary = key === 37 ? -dx : key === 39 ? dx : key === 38 ? -dy : dy;
                var secondary = key === 37 || key === 39 ? Math.abs(dy) : Math.abs(dx);
                var score = primary + secondary * 3;
                if (primary > 1 && score < best) { best = score; next = candidate; }
            });
        }
        controls[next].focus();
    }

    function onKeyDown(event) {
        var key = event.keyCode;
        if (key === 40 && homeFinish) { homeFinish(); }
        var active = document.activeElement;
        if (player && [13, 37, 38, 39, 40, 415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            var hud = screen.querySelector(".player-hud");
            var wasHidden = hud && hud.hidden;
            showHud();
            if (wasHidden && [13, 37, 38, 39, 40].indexOf(key) !== -1) {
                event.preventDefault();
                if (key !== 37 && key !== 39) {
                    if (hudFocus && hud.contains(hudFocus)) { hudFocus.focus(); }
                    else { focusFirst(); }
                    return;
                }
            }
        }
        if (active && active.vemmDevCode !== undefined && window.VemmDevMode) {
            var entered = window.VemmDevMode.typed(active.vemmDevCode, key);
            active.vemmDevCode = entered;
            if (window.VemmDevMode.matches(entered)) {
                active.vemmDevCode = "";
                window.VemmDevMode.setEnabled(window.localStorage, true);
                setStatus("Developer mode is on. Find it in Settings.");
            }
        }
        if (homeRowsReorder && active && active.vemmRow !== undefined && (key === 38 || key === 40) &&
                homeRowsReorder(active.vemmRow, key === 38 ? -1 : 1)) {
            event.preventDefault();
            return;
        }
        var editing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
        if (key === 13 && event.repeat) { event.preventDefault(); return; }
        if (player && subtitleTiming && (key === 37 || key === 39)) {
            event.preventDefault();
            adjustSubtitleTiming(key === 39 ? 1 : -1, event.repeat);
            return;
        }
        if (player && subtitleTiming && key === 13) {
            event.preventDefault();
            closeSubtitleTiming();
            return;
        }
        if ((key === 10135 || key === 457) && !player && active && active.vemmCard) {
            event.preventDefault();
            openItemMenu(active);
            return;
        }
        if (player && active && active.id === "playback-progress" && key === 13) {
            event.preventDefault();
            commitScrub();
            return;
        }
        if (key === 10009 || key === 27 || key === 8) {
            if (editing && key === 8) { return; }
            event.preventDefault();
            if (player && active && active.id === "playback-progress") {
                commitScrub();
                restoreScrubControl();
                return;
            }
            if (player && subtitleTiming) { closeSubtitleTiming(); return; }
            // The menu the viewer is in goes up a level first, whatever else is on screen (an Up Next card).
            var focusedMenu = document.getElementById("player-menu");
            if (player && focusedMenu && focusedMenu.plexDismiss && focusedMenu.contains(active)) { focusedMenu.plexDismiss(); return; }
            if (player && playerPanel) {
                var activePanel = playerPanel;
                closePlayerPanel();
                var tabs = screen.querySelectorAll(".playback-controls .player-tab");
                var desired = activePanel === "chapters" ? translate("Chapters") : translate("Info");
                Array.prototype.some.call(tabs, function (tab) {
                    if (tab.textContent === desired) { tab.focus(); return true; }
                    return false;
                });
                showHud();
                return;
            }
            if (player && document.getElementById("playback-stats")) {
                togglePlayerStats();
                return;
            }
            if (player && document.getElementById("up-next-panel")) {
                var watchCredits = document.querySelector("#up-next-panel button");
                if (watchCredits) { watchCredits.click(); }
                else { closeUpNext(); }
                return;
            }
            if (player && document.getElementById("playback-error")) {
                var errorBack = Array.prototype.filter.call(document.querySelectorAll("#playback-error button"), function (control) {
                    return control.textContent === translate("Back");
                })[0];
                if (errorBack) { errorBack.click(); }
                return;
            }
            if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; setStatus("Auto-play cancelled."); return; }
            var menu = document.getElementById("player-menu");
            if (menu && menu.plexDismiss) { menu.plexDismiss(); return; }
            if (menu) { closePlayerMenu(); return; }
            if (closeDropdown()) { return; }
            var hiddenKeys = screen.querySelector(".search-keyboard.keyboard-collapsed");
            if (hiddenKeys && hiddenKeys.vemmRestore) { hiddenKeys.vemmRestore(); return; }
            var utilities = screen.querySelector(".home-utilities");
            if (utilities && !utilities.hidden) {
                utilities.hidden = true;
                screen.querySelector(".account-control").focus();
                return;
            }
            var fileInfo = screen.querySelector(".file-info-panel");
            if (fileInfo && !fileInfo.hidden) {
                fileInfo.hidden = true;
                var detailMore = screen.querySelector('[aria-label="More"]');
                if (detailMore) { detailMore.focus(); }
                return;
            }
            var overflow = screen.querySelector(".detail-overflow");
            if (overflow && !overflow.hidden) {
                overflow.hidden = true;
                var moreControl = screen.querySelector('.detail-actions [aria-expanded]');
                moreControl.setAttribute("aria-expanded", "false");
                moreControl.focus();
                return;
            }
            backView();
            return;
        }
        if (player && [415, 19, 10252, 413, 417, 412].indexOf(key) !== -1) {
            event.preventDefault();
            if (Date.now() - lastAction < 150) { return; }
            lastAction = Date.now();
            if (key === 413) { stopPlayer(); }
            else if (key === 417 || key === 412) {
                seekPlayer(key === 417 ? preferences.skipInterval * 1000 : -preferences.skipInterval * 1000);
            }
            else if (key === 415 && (playerWaiting() ? !wantsPause() : player.snapshot().state !== "paused")) { return; }
            else if (key === 19 && (playerWaiting() ? wantsPause() : player.snapshot().state !== "playing")) { return; }
            else { togglePlayer(); }
            return;
        }
        if (player && !document.getElementById("player-menu") && !playerPanel && !playerStatsVisible &&
                !subtitleTiming && !document.getElementById("up-next-panel") &&
                !document.getElementById("playback-error") && (key === 37 || key === 39)) {
            var hud = screen.querySelector(".player-hud");
            var playerControls = hud && hud.querySelector(".playback-controls");
            if (!hud || hud.hidden || !playerControls || !playerControls.contains(document.activeElement)) {
                event.preventDefault();
                scrubPlayer(key === 39 ? 1 : -1);
                return;
            }
        }
        if (editing && (key === 37 || key === 39)) {
            return;
        }
        if (key === 38) {
            event.preventDefault();
            moveFocus(-1, key);
        } else if (key === 40) {
            event.preventDefault();
            moveFocus(1, key);
        } else if (key === 37) {
            event.preventDefault();
            moveFocus(-1, key);
        } else if (key === 39) {
            event.preventDefault();
            moveFocus(1, key);
        } else if (key === 13 && active && active.vemmCard && !player) {
            // A card waits for key-up: a short press opens it, a hold opens the action menu.
            event.preventDefault();
            cancelHold();
            holdCard = active;
            holdTimer = setTimeout(function () {
                holdTimer = null;
                if (holdCard === document.activeElement) { openItemMenu(holdCard); }
                holdCard = null;
            }, 600);
        } else if (key === 13 && active && active.tagName === "BUTTON") {
            event.preventDefault();
            active.click();
        }
    }

    function cancelHold() {
        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        holdCard = null;
    }

    function onKeyUp(event) {
        if (event.keyCode !== 13 || !holdCard) { return; }
        var target = holdCard;
        var short = holdTimer !== null;
        cancelHold();
        event.preventDefault();
        if (short && target === document.activeElement) { target.click(); }
    }

    // After onKeyDown has moved focus, any key press restarts the 8 second featured-title wait.
    document.addEventListener("keydown", function (event) { onKeyDown(event); armFeatureTimer(); });
    document.addEventListener("keyup", onKeyUp);
    screen.addEventListener("mousemove", function () { if (player) { showHud(); } });
    screen.addEventListener("click", function () { if (player) { showHud(); } });
    keepScreenAwake(false);
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            clearGraphics();
            cancelScrub();
            hidePreview();
            keepScreenAwake(false);
            cancelHold();
            preload.cancel();
            if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
            if (player) {
                var item = playerItem;
                var client = playerClient;
                foregroundRecovery = function () {
                    openDetail(item.ratingKey, client);
                };
                stopPlayer(function () {
                    if (!document.hidden && foregroundRecovery) {
                        var recover = foregroundRecovery; foregroundRecovery = null; recover();
                    }
                });
            } else {
                var controls = Array.prototype.slice.call(screen.querySelectorAll("button, input, select"));
                suspendedView = { restore: restoreView, focus: controls.indexOf(document.activeElement), scroll: screen.scrollTop };
                viewGeneration += 1;
                cancelViewRequests();
                stopAuthorization();
                resetImages();
                if (viewCleanup) { var cleanup = viewCleanup; viewCleanup = null; cleanup(); }
            }
        } else if (foregroundRecovery && !playerClosing) {
            var recoverPlayer = foregroundRecovery; foregroundRecovery = null; recoverPlayer();
        } else if (suspendedView) {
            var previous = suspendedView; suspendedView = null;
            pendingRestore = previous;
            if (previous.restore) { previous.restore(); }
            else { addConnectForm("The app returned to the foreground. Restart pairing if needed."); }
        }
    });
    window.addEventListener("error", function (event) {
        var place = event.filename ? " (" + String(event.filename).split("/").pop() + ":" + event.lineno + ")" : "";
        logError("Uncaught error: " + (event.message || "unknown") + place);
    });
    window.addEventListener("unhandledrejection", function (event) {
        var reason = event.reason;
        logError("Unhandled promise rejection: " + (reason && reason.message || reason || "unknown"));
    });
    window.addEventListener("pagehide", function () {
        keepScreenAwake(false);
        preload.cancel();
        if (graphics) { graphics.dispose(); graphics = null; }
        stopAuthorization();
        resetImages();
        if (viewCleanup) { viewCleanup(); viewCleanup = null; }
        if (player) { stopPlayer(function () {}); }
    });
    if (window.tizen && window.tizen.tvinputdevice) {
        try {
            ["MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop", "MediaFastForward", "MediaRewind"].forEach(function (name) {
                window.tizen.tvinputdevice.registerKey(name);
            });
            ["Tools", "Info", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].forEach(function (name) {
                try { window.tizen.tvinputdevice.registerKey(name); } catch (ignore) { /* optional card-menu shortcut */ }
            });
        } catch (error) { setStatus("Some media keys could not be registered. Use on-screen playback controls.", true); }
    }
    addConnectForm("");
    if (preferenceError) { setStatus(preferenceError, true); }
    if (window.VemmSession) {
        try {
            var savedAccount = window.VemmSession.load(window.localStorage);
            if (savedAccount) {
                accountToken = savedAccount;
                accountClient = window.PlexApi.createAccountClient({ token: accountToken });
                autoOpenPending = true;
                openProfiles();
            }
        } catch (error) { setStatus(errorText(error), true); }
    }
}());
