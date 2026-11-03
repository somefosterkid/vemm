(function (root, factory) {
    var api = factory(root);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmIptv = api; }
}(this, function (root) {
    "use strict";
    // Live TV from an M3U playlist the viewer pastes. The playlist link and the channel addresses in it usually carry
    // a username and password, so they are kept on this TV only and never appear in a message, the error log or a
    // request to Plex: every error here has a code and fixed text, none has the link.
    var SOURCE_KEY = "vemm-tizen-iptv-source";
    var LAST_KEY = "vemm-tizen-iptv-last";
    var MAX_LINK = 2000;
    // Lists of tens of thousands of channels are ordinary; this only stops a link that is not a list at all.
    var MAX_BYTES = 64 * 1024 * 1024;
    // The most channels one page of the channel list holds; a bigger group is split in consecutive pages.
    var PAGE = 1000;

    function failure(code, message, status) {
        var error = new Error(message);
        error.code = code;
        if (status) { error.status = status; }
        return error;
    }

    // The link as typed, trimmed, when it is a plain http or https address; "" otherwise. Plain http is allowed: many
    // sources offer nothing else, and the viewer chose this one.
    function link(text) {
        text = String(text || "").replace(/^\s+|\s+$/g, "");
        return text.length <= MAX_LINK && /^https?:\/\/[^\s\/?#]+[^\s]*$/i.test(text) ? text : "";
    }
    function source(storage) {
        try { return link(storage.getItem(SOURCE_KEY)); } catch (error) { return ""; }
    }
    // True when saved. An empty or invalid link forgets the saved one.
    function saveSource(storage, text) {
        var value = link(text);
        try {
            if (value) { storage.setItem(SOURCE_KEY, value); } else { storage.removeItem(SOURCE_KEY); }
            storage.removeItem(LAST_KEY);
        } catch (error) { return false; }
        return !!value;
    }
    function forget(storage) { saveSource(storage, ""); }

    // The last channel watched, by group and name (never its address).
    function last(storage) {
        try {
            var saved = JSON.parse(storage.getItem(LAST_KEY));
            return saved && typeof saved.group === "string" && typeof saved.name === "string" ? saved : null;
        } catch (error) { return null; }
    }
    function remember(storage, channel) {
        try { storage.setItem(LAST_KEY, JSON.stringify({ group: channel.group, name: channel.name })); } catch (error) { /* only a convenience */ }
    }

    // key="value", key='value' or key=value, as EXTINF writes its attributes.
    var ATTRIBUTE = /([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,"']*))/g;
    var BLANK = /^\s*$/;

    // The attributes and the name of an EXTINF line (the text after "#EXTINF:"). The name starts at the first comma
    // after the attributes, so commas inside a quoted value or in the name itself are safe.
    function extinf(text) {
        var attributes = {};
        var at = /^\s*[-+]?[0-9.]+/.exec(text);
        at = at ? at[0].length : 0;
        for (;;) {
            ATTRIBUTE.lastIndex = at;
            var found = ATTRIBUTE.exec(text);
            if (!found || !BLANK.test(text.slice(at, found.index))) { break; }
            attributes[found[1].toLowerCase()] = found[2] !== undefined ? found[2] : found[3] !== undefined ? found[3] : found[4];
            at = ATTRIBUTE.lastIndex;
        }
        var comma = text.indexOf(",", at);
        return { attributes: attributes, name: comma < 0 ? "" : text.slice(comma + 1) };
    }

    function clean(text) { return String(text || "").replace(/\s+/g, " ").replace(/^ | $/g, ""); }

    // Reads a playlist a line at a time (line), then gives the groups in order of first appearance (finish). Lines that
    // are not part of a channel - junk, comments, other tags, an address with no EXTINF before it - are skipped.
    function parser() {
        var groups = [];
        var byName = Object.create(null);
        var pending = null;
        var group = "";
        var total = 0;
        var skipped = 0;
        var first = true;
        function add(channel) {
            var key = "g" + channel.group;
            var at = byName[key];
            if (at === undefined) { at = byName[key] = groups.push({ name: channel.group, channels: [] }) - 1; }
            groups[at].channels.push(channel);
            total += 1;
        }
        return {
            line: function (line) {
                if (first) { first = false; if (line.charCodeAt(0) === 0xFEFF) { line = line.slice(1); } }
                line = line.replace(/^\s+|\s+$/g, "");
                if (!line) { return; }
                if (line.charAt(0) === "#") {
                    if (line.slice(0, 8).toUpperCase() === "#EXTINF:") { pending = extinf(line.slice(8)); }
                    else if (line.slice(0, 8).toUpperCase() === "#EXTGRP:") { group = clean(line.slice(8)); }
                    return;
                }
                if (!pending) { return; }
                var entry = pending;
                pending = null;
                if (!/^https?:\/\//i.test(line)) { skipped += 1; return; }
                var logo = entry.attributes["tvg-logo"] || "";
                add({
                    name: clean(entry.name) || clean(entry.attributes["tvg-name"]),
                    url: line,
                    logo: /^https?:\/\//i.test(logo) ? logo : "",
                    group: clean(entry.attributes["group-title"]) || group
                });
                group = "";
            },
            finish: function () { return { groups: groups, total: total, skipped: skipped }; }
        };
    }

    function parse(text) {
        var reader = parser();
        String(text).split(/\r\n?|\n/).forEach(reader.line);
        return reader.finish();
    }

    // The same, in slices of about 25 ms so a spinner keeps turning while tens of thousands of channels are read.
    function parseLater(text, options) {
        options = options || {};
        var now = options.now || Date.now;
        var wait = options.setTimeout || setTimeout;
        return new Promise(function (resolve, reject) {
            var reader = parser();
            var lines = String(text).split(/\r\n?|\n/);
            var at = 0;
            function step() {
                try {
                    var end = now() + 25;
                    while (at < lines.length) {
                        reader.line(lines[at]);
                        at += 1;
                        if ((at & 255) === 0 && now() > end && at < lines.length) { wait(step, 0); return; }
                    }
                    resolve(reader.finish());
                } catch (error) { reject(error); }
            }
            step();
        });
    }

    // What the channel list shows: [{ group, name, from, to }], a big group in pages of PAGE channels.
    function pages(playlist) {
        var list = [];
        playlist.groups.forEach(function (group, index) {
            var count = group.channels.length;
            for (var from = 0; from < count; from += PAGE) {
                list.push({ group: index, name: group.name, from: from, to: Math.min(count, from + PAGE), count: count });
            }
        });
        return list;
    }

    // Where a remembered channel is: { group, at } in the playlist, or null.
    function find(playlist, saved) {
        if (!saved) { return null; }
        for (var i = 0; i < playlist.groups.length; i += 1) {
            if (playlist.groups[i].name !== saved.group) { continue; }
            var channels = playlist.groups[i].channels;
            for (var at = 0; at < channels.length; at += 1) {
                if (channels[at].name === saved.name) { return { group: i, at: at }; }
            }
        }
        return null;
    }

    // The playlist's text. A plain GET with no headers and no credentials, so it is not a preflighted request.
    // options.createRequest is for tests.
    function fetchText(url, options) {
        options = options || {};
        return new Promise(function (resolve, reject) {
            var request;
            try {
                request = options.createRequest ? options.createRequest() : new root.XMLHttpRequest();
                request.open("GET", url);
            } catch (error) { reject(failure("network", "The playlist could not be read.")); return; }
            var done = false;
            function end(error, text) {
                if (done) { return; }
                done = true;
                if (error) { try { request.abort(); } catch (ignore) { /* already over */ } reject(error); } else { resolve(text); }
            }
            request.timeout = options.timeout || 60000;
            request.onprogress = function (event) {
                if (event && event.loaded > MAX_BYTES) { end(failure("size", "The playlist is too large.")); }
            };
            request.onload = function () {
                if (request.status >= 200 && request.status < 300) { end(null, String(request.responseText || "")); }
                else { end(failure("http", "The playlist link was refused.", request.status)); }
            };
            // A refused cross-origin read and a lost connection look the same from here: no status at all.
            request.onerror = request.onabort = function () { end(failure("network", "The playlist could not be read.")); };
            request.ontimeout = function () { end(failure("timeout", "The playlist took too long to load.")); };
            try { request.send(); } catch (error) { end(failure("network", "The playlist could not be read.")); }
        });
    }

    // The playlist at the link: fetched and read. Resolves with the groups, or rejects with a code of network, timeout,
    // http, size or empty.
    function load(url, options) {
        return fetchText(url, options).then(function (text) {
            return parseLater(text, options);
        }).then(function (playlist) {
            if (!playlist.total) { throw failure("empty", "The link did not return a channel list."); }
            return playlist;
        });
    }

    var REASONS = {
        PLAYER_ERROR_CONNECTION_FAILED: "connection",
        PLAYER_ERROR_INVALID_URI: "address",
        PLAYER_ERROR_NOT_SUPPORTED_FILE: "format",
        PLAYER_ERROR_NOT_SUPPORTED_FORMAT: "format"
    };

    // AVPlay refuses an endless MPEG-TS stream at once unless its address ends in .ts, and most IPTV addresses don't:
    // a bare channel number, a token after the name, or a redirect to one of those. HLS and MP4 play with this ending
    // too (all seen on a 2018 TV), and a fragment never reaches the server.
    function playableAddress(url) { return /.ts$/i.test(url) ? url : url.replace(/#.*$/, "") + "#.ts"; }

    // A channel's AVPlay session on top of the app's adapter (js/avplay.js): live, so no position, seek or progress.
    // Feed every adapter event to event(). onChange gets { state, code }; state is starting, playing, waiting (the
    // stream stalled), reconnecting, failed (code says why: connection, address, format, timeout, silent or stream)
    // or stopped. A stream that drops is opened again for about two minutes (js/reconnect.js) before it fails.
    function live(options) {
        var adapter = options.adapter;
        var timers = options.timers || { set: function (run, wait) { return setTimeout(run, wait); }, clear: function (id) { clearTimeout(id); } };
        var silence = options.silence || 20000;
        var channel = null;
        var generation = 0;
        var reconnect = null;
        var watch = null;
        var state = "stopped";

        function change(next, code) {
            state = next;
            options.onChange({ state: next, code: code || "" });
        }
        function unwatch() { if (watch !== null) { timers.clear(watch); watch = null; } }
        function stopReconnect() { if (reconnect) { reconnect.cancel(); reconnect = null; } }
        // Opened but no picture within the wait is as good as a dead channel.
        function open() {
            unwatch();
            return adapter.open(playableAddress(channel.url), 0, false, null, {}).then(function () {
                unwatch();
                var own = generation;
                watch = timers.set(function () {
                    watch = null;
                    if (own === generation && state === "starting") { fail("silent"); }
                }, silence);
            });
        }
        function fail(code) {
            generation += 1;
            unwatch();
            stopReconnect();
            try { adapter.close(); } catch (error) { /* the channel is over either way */ }
            change("failed", code);
        }
        function reasonOf(error) {
            var reason = String(error && error.reason || "");
            if (error && error.code === "avplay-prepare-timeout") { return "timeout"; }
            return REASONS[reason] || "stream";
        }
        function drop() {
            if (state === "failed" || state === "stopped" || !channel || reconnect) { return; }
            var own = generation;
            change("reconnecting");
            reconnect = options.reconnect.create({
                limit: 120000,
                probeLimit: 30000,
                probe: function () { return open(); },
                onUp: function () { reconnect = null; if (own === generation) { change("starting"); } },
                onGiveUp: function () { reconnect = null; if (own === generation) { fail("connection"); } }
            });
            reconnect.start();
        }

        return {
            tune: function (next) {
                generation += 1;
                var own = generation;
                stopReconnect();
                channel = next;
                change("starting");
                open().catch(function (error) {
                    if (own === generation) { fail(reasonOf(error)); }
                });
            },
            stop: function () {
                generation += 1;
                unwatch();
                stopReconnect();
                channel = null;
                try { adapter.close(); } catch (error) { /* closing is best effort */ }
                change("stopped");
            },
            // Every adapter event comes here.
            event: function (event) {
                if (!channel) { return; }
                if (event.type === "time" && state === "starting") { unwatch(); change("playing"); }
                else if (event.type === "buffering" && (state === "playing" || state === "waiting")) { change(event.detail ? "waiting" : "playing"); }
                else if (event.type === "error") {
                    if (event.reason === "PLAYER_ERROR_CONNECTION_FAILED") { drop(); } else { fail(reasonOf({ reason: event.reason })); }
                } else if (event.type === "ended") { drop(); }
            },
            state: function () { return state; }
        };
    }

    return { PAGE: PAGE, link: link, source: source, saveSource: saveSource, forget: forget, last: last, remember: remember,
        parse: parse, parseLater: parseLater, pages: pages, find: find, fetchText: fetchText, load: load, live: live };
}));
