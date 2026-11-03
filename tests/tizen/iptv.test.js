"use strict";

var assert = require("assert");
var iptv = require("../../samsung/Vemm/js/iptv.js");
var reconnectModule = require("../../samsung/Vemm/js/reconnect.js");

function storage() {
    var data = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { data[key] = String(value); },
        removeItem: function (key) { delete data[key]; },
        all: function () { return JSON.stringify(data); }
    };
}

// ---- links and storage
assert.strictEqual(iptv.link("  http://lists.invalid/a.m3u  "), "http://lists.invalid/a.m3u", "plain http is allowed");
assert.strictEqual(iptv.link("https://lists.invalid:8080/get.php?username=u&password=p&type=m3u"),
    "https://lists.invalid:8080/get.php?username=u&password=p&type=m3u");
["", "ftp://lists.invalid/a.m3u", "lists.invalid/a.m3u", "http://", "http:///a", "http://a.invalid/ b", "javascript:alert(1)"].forEach(function (text) {
    assert.strictEqual(iptv.link(text), "", "Rejected: " + text);
});
assert.strictEqual(iptv.link("http://a.invalid/" + new Array(2100).join("x")), "", "An absurdly long link is refused");

var store = storage();
assert.strictEqual(iptv.source(store), "");
assert.strictEqual(iptv.saveSource(store, "http://lists.invalid/a.m3u"), true);
assert.strictEqual(iptv.source(store), "http://lists.invalid/a.m3u");
iptv.remember(store, { group: "News", name: "Channel One", url: "http://x.invalid/secret" });
assert.deepStrictEqual(iptv.last(store), { group: "News", name: "Channel One" });
assert(store.all().indexOf("secret") === -1, "A channel address is never remembered");
assert.strictEqual(iptv.saveSource(store, "http://other.invalid/b.m3u"), true);
assert.strictEqual(iptv.last(store), null, "A new playlist forgets the last channel");
iptv.forget(store);
assert.strictEqual(iptv.source(store), "");
assert.strictEqual(iptv.saveSource(store, "not a link"), false);

// ---- parser
var text = "﻿#EXTM3U x-tvg-url=\"http://guide.invalid/g.xml\"\r\n" +
    "junk line that is not part of a channel\r\n" +
    "#EXTINF:-1 tvg-id=\"a\" tvg-logo=\"http://img.invalid/a.png\" group-title=\"News, World\",Channel, One\r\n" +
    "#EXTVLCOPT:network-caching=1000\r\n" +
    "http://s.invalid:80/user/pass/1.ts\r\n" +
    "\r\n" +
    "#EXTINF:-1 group-title='Sport' tvg-logo=\"data:image/png;base64,AAAA\",  Two  \r\n" +
    "https://s.invalid/two.m3u8\r\n" +
    "#EXTINF:0,No Group\r\n" +
    "http://s.invalid/3\r\n" +
    "#EXTGRP:Movies\r\n" +
    "#EXTINF:0,Grouped By Tag\r\n" +
    "http://s.invalid/4\r\n" +
    "#EXTINF:0,Next Without Tag\r\n" +
    "http://s.invalid/5\r\n" +
    "http://s.invalid/orphan\r\n" +
    "#EXTINF:0,Not A Stream\r\n" +
    "rtmp://s.invalid/6\r\n" +
    "#EXTINF:0 tvg-name=\"Only Attribute\" group-title=\"Sport\",\r\n" +
    "http://s.invalid/7\r\n" +
    "#EXTINF:0,Dangling";
var playlist = iptv.parse(text);
assert.strictEqual(playlist.total, 6);
assert.strictEqual(playlist.skipped, 1, "A non-http address is counted, not played");
assert.deepStrictEqual(playlist.groups.map(function (g) { return g.name; }), ["News, World", "Sport", "", "Movies"]);
var one = playlist.groups[0].channels[0];
assert.deepStrictEqual([one.name, one.url, one.logo, one.group],
    ["Channel, One", "http://s.invalid:80/user/pass/1.ts", "http://img.invalid/a.png", "News, World"],
    "Commas inside a quoted group and inside the name survive; the BOM is ignored");
assert.strictEqual(playlist.groups[1].channels[0].name, "Two", "Names are trimmed");
assert.strictEqual(playlist.groups[1].channels[0].logo, "", "Only http logos are used");
assert.strictEqual(playlist.groups[1].channels[1].name, "Only Attribute", "tvg-name stands in for an empty name");
assert.strictEqual(playlist.groups[3].channels[0].name, "Grouped By Tag", "EXTGRP names the next channel's group");
assert.strictEqual(playlist.groups[2].channels.map(function (c) { return c.name; }).join("|"), "No Group|Next Without Tag",
    "EXTGRP applies to one channel only");
assert.deepStrictEqual(iptv.parse("<html>Login failed</html>").groups, []);
assert.strictEqual(iptv.parse("").total, 0);
assert.strictEqual(iptv.parse("#EXTM3U\n#EXT-X-VERSION:3\nseg1.ts\n").total, 0, "A media playlist has no channels");

// ---- very large lists stay fast and are shown in pages
var parts = ["#EXTM3U"];
for (var i = 0; i < 60000; i += 1) {
    parts.push("#EXTINF:-1 tvg-id=\"c" + i + "\" tvg-logo=\"http://img.invalid/" + i + ".png\" group-title=\"Group " + (i % 50) + "\",Channel " + i);
    parts.push("http://s.invalid/live/user/pass/" + i + ".ts");
}
var big = parts.join("\n");
var started = Date.now();
var parsed = iptv.parse(big);
var elapsed = Date.now() - started;
assert.strictEqual(parsed.total, 60000);
assert.strictEqual(parsed.groups.length, 50);
assert(elapsed < 2000, "60000 channels parse in " + elapsed + " ms");
var paged = iptv.pages(parsed);
assert.strictEqual(paged.length, 50 * 2, "1200 channels per group make two pages of at most " + iptv.PAGE);
assert.deepStrictEqual([paged[0].from, paged[0].to, paged[1].from, paged[1].to, paged[1].count], [0, 1000, 1000, 1200, 1200]);
assert.deepStrictEqual(iptv.pages(playlist).map(function (p) { return p.name + ":" + p.from + "-" + p.to; }),
    ["News, World:0-1", "Sport:0-2", ":0-2", "Movies:0-1"]);

// A sliced read gives the same answer and yields between slices
var yields = 0;
var tick = 0;
iptv.parseLater(big, {
    now: function () { tick += 10; return tick; },
    setTimeout: function (run) { yields += 1; setTimeout(run, 0); }
}).then(function (later) {
    assert.strictEqual(later.total, 60000);
    assert(yields > 10, "A long list is read in slices (" + yields + ")");
    assert.deepStrictEqual(later.groups[7].channels[3], parsed.groups[7].channels[3]);
    return null;
}).then(function () {
    // ---- remembered channel
    assert.deepStrictEqual(iptv.find(playlist, { group: "Sport", name: "Only Attribute" }), { group: 1, at: 1 });
    assert.strictEqual(iptv.find(playlist, { group: "Sport", name: "Gone" }), null);
    assert.strictEqual(iptv.find(playlist, null), null);

    // ---- fetching: plain GET, no headers, errors never carry the link
    function request(outcome) {
        var req = {
            headers: 0,
            open: function (method, url) { req.method = method; req.url = url; },
            setRequestHeader: function () { req.headers += 1; },
            abort: function () { req.aborted = true; },
            send: function () {
                setTimeout(function () {
                    if (outcome.progress) { req.onprogress({ loaded: outcome.progress }); }
                    if (outcome.fail) { req[outcome.fail](); return; }
                    req.status = outcome.status; req.responseText = outcome.text; req.onload();
                }, 0);
            }
        };
        return req;
    }
    var secret = "http://lists.invalid/get.php?username=alice&password=hunter2";
    function attempt(outcome) {
        var req = request(outcome);
        return iptv.load(secret, { createRequest: function () { return req; } }).then(function (result) {
            return { result: result, req: req };
        }, function (error) { return { error: error, req: req }; });
    }
    return Promise.all([
        attempt({ status: 200, text: "#EXTM3U\n#EXTINF:-1,A\nhttp://s.invalid/a\n" }),
        attempt({ status: 403, text: "" }),
        attempt({ fail: "onerror" }),
        attempt({ fail: "ontimeout" }),
        attempt({ status: 200, text: "<html>nope</html>" }),
        attempt({ progress: 70 * 1024 * 1024 })
    ]).then(function (results) {
        assert.strictEqual(results[0].result.total, 1);
        assert.strictEqual(results[0].req.url, secret);
        assert.strictEqual(results[0].req.headers, 0, "No custom headers, so no CORS preflight");
        assert.deepStrictEqual(results.slice(1).map(function (r) { return r.error.code; }),
            ["http", "network", "timeout", "empty", "size"]);
        assert.strictEqual(results[1].error.status, 403);
        results.slice(1).forEach(function (r) {
            ["alice", "hunter2", "lists.invalid", "http"].forEach(function (word) {
                if (word !== "http") { assert(r.error.message.indexOf(word) === -1, "The link is not in: " + r.error.message); }
            });
        });
        assert(results[5].req.aborted, "An oversized download stops");
    });
}).then(function () {
    // ---- the live controller
    var events = [];
    var opened = [];
    var adapter = {
        failNext: null,
        open: function (url, offset, paused, buffer, mode) {
            opened.push([url, offset, paused]);
            if (adapter.failNext) { var error = adapter.failNext; adapter.failNext = null; return Promise.reject(error); }
            return Promise.resolve();
        },
        close: function () { opened.push("close"); }
    };
    var timers = { pending: [], set: function (run) { timers.pending.push(run); return timers.pending.length; }, clear: function (id) { timers.pending[id - 1] = null; } };
    var reconnects = 0;
    var liveStream = iptv.live({
        adapter: adapter, timers: timers,
        reconnect: { create: function (options) {
            reconnects += 1;
            return { start: function () { options.probe().then(options.onUp); }, cancel: function () {} };
        } },
        onChange: function (change) { events.push(change.state + (change.code ? ":" + change.code : "")); }
    });
    var channel = { name: "A", url: "http://s.invalid/a", group: "G" };
    liveStream.tune(channel);
    return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
        assert.deepStrictEqual(opened[0], ["http://s.invalid/a#.ts", 0, false], "Live opens at 0, not paused");
        // AVPlay refuses an endless MPEG-TS stream unless its address ends in .ts, so every channel's does.
        // The fragment never reaches the server. HLS and MP4 played with it on the TV too.
        [
            ["http://s.invalid/user/pass/123", "http://s.invalid/user/pass/123#.ts"],
            ["http://s.invalid/1.ts", "http://s.invalid/1.ts"],
            ["http://s.invalid/1.TS", "http://s.invalid/1.TS"],
            ["http://s.invalid/1.ts?token=abc", "http://s.invalid/1.ts?token=abc#.ts"],
            ["http://s.invalid/two.m3u8?token=abc", "http://s.invalid/two.m3u8?token=abc#.ts"],
            ["http://s.invalid/a#old", "http://s.invalid/a#.ts"],
            ["http://s.invalid/a.ts#old", "http://s.invalid/a.ts#.ts"]
        ].forEach(function (pair) {
            var asked = [];
            iptv.live({
                adapter: { open: function (url) { asked.push(url); return Promise.resolve(); }, close: function () {} },
                timers: timers, reconnect: { create: function () {} }, onChange: function () {}
            }).tune({ name: "C", url: pair[0], group: "G" });
            assert.deepStrictEqual(asked, [pair[1]]);
        });
        liveStream.event({ type: "time", position: 1000 });
        assert.strictEqual(liveStream.state(), "playing");
        liveStream.event({ type: "buffering", detail: true });
        assert.strictEqual(liveStream.state(), "waiting");
        liveStream.event({ type: "buffering", detail: false });
        assert.strictEqual(liveStream.state(), "playing");
        // The connection drops: the same channel opens again
        liveStream.event({ type: "error", reason: "PLAYER_ERROR_CONNECTION_FAILED" });
        assert.strictEqual(reconnects, 1);
        assert.strictEqual(liveStream.state(), "reconnecting");
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }).then(function () {
        assert.strictEqual(liveStream.state(), "starting", "Reopened and waiting for the picture");
        assert.strictEqual(opened.filter(function (o) { return o !== "close"; }).length, 2);
        liveStream.event({ type: "time", position: 2000 });
        // A format error is final
        liveStream.event({ type: "error", reason: "PLAYER_ERROR_NOT_SUPPORTED_FORMAT" });
        assert.strictEqual(liveStream.state(), "failed");
        assert.strictEqual(events[events.length - 1], "failed:format");
        // A channel that does not open
        adapter.failNext = Object.assign(new Error("Samsung playback failed during prepare."), { code: "avplay-prepare", reason: "PLAYER_ERROR_INVALID_URI" });
        liveStream.tune(channel);
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }).then(function () {
        assert.strictEqual(events[events.length - 1], "failed:address");
        adapter.failNext = Object.assign(new Error("slow"), { code: "avplay-prepare-timeout" });
        liveStream.tune(channel);
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }).then(function () {
        assert.strictEqual(events[events.length - 1], "failed:timeout");
        // Opens but never shows a picture
        liveStream.tune(channel);
        return new Promise(function (resolve) { setTimeout(resolve, 0); });
    }).then(function () {
        assert.strictEqual(liveStream.state(), "starting");
        timers.pending[timers.pending.length - 1]();
        assert.strictEqual(events[events.length - 1], "failed:silent", "No picture ends in an error, not a spinner");
        // Changing channel while another is starting ignores the old answer
        liveStream.tune(channel);
        liveStream.tune({ name: "B", url: "http://s.invalid/b", group: "G" });
        liveStream.stop();
        assert.strictEqual(liveStream.state(), "stopped");
        liveStream.event({ type: "time", position: 1 });
        assert.strictEqual(liveStream.state(), "stopped", "Events after stop are ignored");
        events.forEach(function (name) { assert(name.indexOf("s.invalid") === -1); });
        // The real reconnect module drives it too
        var real = iptv.live({
            adapter: { open: function () { return Promise.resolve(); }, close: function () {} }, timers: timers,
            reconnect: reconnectModule,
            onChange: function () {}
        });
        real.tune(channel);
        real.event({ type: "ended" });
        assert.strictEqual(real.state(), "reconnecting");
        real.stop();
        // With no timers passed, as the app runs it. A browser refuses setTimeout called as another object's method
        // (Node doesn't), which failed every channel on the TV right after it started playing.
        var nodeTimeout = global.setTimeout;
        var nodeClear = global.clearTimeout;
        function asBrowser(native) {
            return function () {
                if (this !== undefined && this !== global) { throw new TypeError("Illegal invocation"); }
                return native.apply(global, arguments);
            };
        }
        global.setTimeout = asBrowser(nodeTimeout);
        global.clearTimeout = asBrowser(nodeClear);
        var plainStates = [];
        var plain = iptv.live({
            adapter: { open: function () { return Promise.resolve(); }, close: function () {} },
            reconnect: reconnectModule,
            onChange: function (change) { plainStates.push(change.state); }
        });
        plain.tune(channel);
        return new Promise(function (resolve) { nodeTimeout(resolve, 0); }).then(function () {
            var stateAfterOpen = plain.state();
            plain.stop();
            global.setTimeout = nodeTimeout;
            global.clearTimeout = nodeClear;
            assert.strictEqual(stateAfterOpen, "starting", "An opened channel waits for its picture");
            assert.deepStrictEqual(plainStates, ["starting", "stopped"]);
        });
    }).then(function () {
        console.log("Live TV playlist, link storage, fetching and channel session: passed");
    });
}).catch(function (error) { console.error(error); process.exit(1); });
