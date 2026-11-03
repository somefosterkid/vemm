"use strict";
// Favorite libraries, card context menu and video PlayQueue: the LG parity features of the Samsung
// client. Every server is synthetic; nothing here can reach a real account.
var assert = require("assert");
var favorites = require("../../samsung/Vemm/js/favorites");
var menu = require("../../samsung/Vemm/js/item-menu");
var api = require("../../samsung/Vemm/js/plex-api");

function memoryStorage() {
    var data = {};
    return {
        writes: 0,
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { this.writes += 1; data[key] = String(value); },
        removeItem: function (key) { delete data[key]; }
    };
}

function ids(list) { return list.map(function (row) { return row.id; }); }

async function run() {
    var storage = memoryStorage();
    assert.strictEqual(favorites.load(storage, "machine-a"), null, "An unanswered server is first-run");
    assert.strictEqual(favorites.load(storage, "../bad"), null);
    assert.throws(function () { favorites.save(storage, "machine-a", []); }, /at least one/);
    assert.throws(function () { favorites.save(storage, "machine-a", ["x"]); }, /invalid/);
    assert.strictEqual(storage.writes, 0, "Rejected saves must not write");
    assert.deepStrictEqual(favorites.save(storage, "machine-a", ["2", 1, "2"]), ["2", "1"]);
    assert.deepStrictEqual(favorites.load(storage, "machine-a"), ["2", "1"]);
    assert.strictEqual(favorites.load(storage, "machine-b"), null, "Favorites are per server");
    var sections = [{ key: "1" }, { key: "2" }, { key: "3" }];
    assert.deepStrictEqual(favorites.filter(sections, null), sections);
    assert.deepStrictEqual(favorites.filter(sections, ["3"]), [{ key: "3" }]);
    assert.deepStrictEqual(favorites.filter(sections, ["9"]), sections, "A stale selection never empties Home");
    storage.setItem("vemm-tizen-favorite-libraries", "{\"machine-a\":[\"x\"]}");
    assert.throws(function () { favorites.load(storage, "machine-a"); }, /invalid/);
    favorites.reset(storage);
    assert.strictEqual(favorites.load(storage, "machine-a"), null);

    assert.deepStrictEqual(menu.rows({ type: "movie" }), [], "No row without a rating key");
    var listed = { ratingKey: "5", type: "episode", grandparentRatingKey: "3", parentRatingKey: "4", viewOffset: 9 };
    assert.deepStrictEqual(ids(menu.rows(listed, { listed: true })), ["play", "details", "watched", "unwatched", "start"],
        "A card in a show's own episode list plays on OK, so it offers its details; it needs no way to its own show");
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "1", type: "movie" })), ["play", "watched"]);
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "1", type: "movie", viewCount: 1 })), ["play", "unwatched"]);
    var resumed = { ratingKey: "5", type: "episode", viewOffset: 9000, grandparentRatingKey: "3", parentRatingKey: "4" };
    assert.deepStrictEqual(ids(menu.rows(resumed, { deck: true, continueAction: "details" })),
        ["play", "show", "season", "watched", "unwatched", "start", "remove"]);
    assert.deepStrictEqual(ids(menu.rows(resumed, { deck: true, continueAction: "play" })),
        ["play", "details", "show", "season", "watched", "unwatched", "start", "remove"]);
    assert.strictEqual(menu.rows(resumed)[0].label, "Resume");
    var firstIds = ids(menu.rows(resumed, { deck: true }));
    assert(["watched", "unwatched", "remove"].indexOf(firstIds[0]) === -1, "A write is never the default row");
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "7", type: "show", leafCount: 4, viewedLeafCount: 2 })),
        ["play", "watched", "unwatched"]);
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "8", type: "season", leafCount: 8, viewedLeafCount: 0 })),
        ["play", "watched"]);
    assert.strictEqual(menu.rows({ ratingKey: "7", type: "show", OnDeck: { Metadata: [
        { ratingKey: "50", type: "episode", viewOffset: 9000 }
    ] } })[0].label, "Resume", "The menu label reflects the server-selected episode's resume state");
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "8", type: "track" })), []);
    var onDeck = { ratingKey: "50", type: "episode", viewOffset: 9000 };
    var showTarget = await menu.playTarget({
        ratingKey: "7", type: "show", OnDeck: { Metadata: [onDeck] }
    }, {
        getFirstEpisode: function () { assert.fail("A valid on-deck episode should win"); }
    });
    assert.strictEqual(showTarget, onDeck, "Show Play uses the server-selected on-deck episode");
    showTarget = await menu.playTarget({ ratingKey: "7", type: "show" }, {
        getFirstEpisode: function (id) {
            assert.strictEqual(id, "7");
            return Promise.resolve({ ratingKey: "51", type: "episode" });
        }
    });
    assert.strictEqual(showTarget.ratingKey, "51", "A show without OnDeck resolves to its first episode");
    var seasonTarget = await menu.playTarget({ ratingKey: "8", type: "season" }, {
        getChildren: function (id, start) {
            assert.strictEqual(id, "8");
            assert.strictEqual(start, 0);
            return Promise.resolve({ Metadata: [{ ratingKey: "52", type: "episode" }] });
        }
    });
    assert.strictEqual(seasonTarget.ratingKey, "52", "A season resolves to its first episode");
    await assert.rejects(menu.playTarget({ ratingKey: "9", type: "season" }, {
        getChildren: function () { return Promise.resolve({ Metadata: [] }); }
    }), /no available episodes/i);
    await assert.rejects(menu.playTarget({ ratingKey: "bad", type: "show" }, {
        getFirstEpisode: function () { assert.fail("Invalid identity must not request Plex"); }
    }), /identifier/i);
    var trailer = menu.trailerFor({ type: "movie", Extras: { Metadata: [
        { ratingKey: "99", type: "clip", subtype: "behindTheScenes", extraType: 5 },
        { ratingKey: "100", type: "clip", subtype: "trailer", Media: [{ Part: [{ key: "/library/parts/1" }] }] }
    ] } });
    assert.strictEqual(trailer.ratingKey, "100", "Only a playable trailer extra is eligible");
    assert.strictEqual(menu.trailerFor({ type: "episode", Extras: { Metadata: [trailer] } }), null,
        "Episode extras do not qualify as movie/show trailer shortcuts");
    assert.strictEqual(menu.trailerFor({ type: "show", Extras: { Metadata: [
        { ratingKey: "101", type: "clip", extraType: 1, Media: [{ Part: [{ key: "/library/parts/1" }] }] }
    ] } }).ratingKey, "101", "PMS trailer extraType is accepted when subtype is absent");
    assert.strictEqual(menu.trailerFor({ type: "movie", Extras: { Metadata: [
        { ratingKey: "102", type: "clip", subtype: "trailer", Media: [{ Part: [{ key: "/../../private" }] }] }
    ] } }), null, "Unsafe PMS trailer part paths are not accepted");
    await assert.rejects(menu.playTarget({ ratingKey: "7", type: "show" }, {
        getFirstEpisode: function () { return Promise.resolve({ ratingKey: "103", type: "show" }); }
    }), /playable episode/i);
    assert(menu.isDeckHub({ hubIdentifier: "home.continue" }));
    assert(menu.isDeckHub({ context: "hub.home.ondeck" }));
    assert(!menu.isDeckHub({ hubIdentifier: "home.movies.recent" }));

    var firstEpisode;
    var episodeCalls = [];
    var episodeClient = api.createClient({
        baseUrl: "https://pms.synthetic.invalid", token: "synthetic-server-token",
        fetch: function (url) {
            var parsed = new URL(url);
            episodeCalls.push(parsed);
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: [firstEpisode] } });
            } });
        }
    });
    firstEpisode = { ratingKey: "101", type: "episode" };
    assert.strictEqual((await episodeClient.getFirstEpisode("10")).ratingKey, "101");
    assert.strictEqual(episodeCalls[0].pathname, "/library/metadata/10/allLeaves");
    assert.strictEqual(episodeCalls[0].searchParams.get("X-Plex-Container-Start"), "0");
    assert.strictEqual(episodeCalls[0].searchParams.get("X-Plex-Container-Size"), "50");
    firstEpisode = { ratingKey: "102", type: "season" };
    await assert.rejects(episodeClient.getFirstEpisode("10"), /episode/i);
    var beforeInvalidEpisode = episodeCalls.length;
    assert.throws(function () { episodeClient.getFirstEpisode("../10"); }, /identifier/i);
    assert.strictEqual(episodeCalls.length, beforeInvalidEpisode, "Invalid show IDs must not reach PMS");

    var calls = [];
    var client = api.createClient({
        baseUrl: "https://pms.synthetic.invalid",
        token: "synthetic-server-token",
        fetch: function (url, options) {
            calls.push({ url: new URL(url), options: options });
            if (new URL(url).pathname === "/playQueues") {
                return Promise.resolve({ ok: true, status: 200, json: function () {
                    return Promise.resolve({ MediaContainer: { playQueueID: 77, playQueueSelectedItemID: 501,
                        Metadata: [{ ratingKey: "5", playQueueItemID: 501 }, { ratingKey: "6", playQueueItemID: 502 }] } });
                } });
            }
            return Promise.resolve({ ok: true, status: 200 });
        }
    });
    await assert.rejects(client.createVideoPlayQueue("bad machine", "5"), /identity/);
    assert.strictEqual(calls.length, 0);
    var queue = await client.createVideoPlayQueue("machine-a", "5");
    assert.strictEqual(calls[0].options.method, "POST");
    assert.strictEqual(calls[0].url.searchParams.get("type"), "video");
    assert.strictEqual(calls[0].url.searchParams.get("continuous"), "1");
    assert.strictEqual(calls[0].url.searchParams.get("uri"),
        "server://machine-a/com.plexapp.plugins.library/library/metadata/5");
    assert.strictEqual(queue.id, "77");
    assert.strictEqual(queue.itemId, "501");
    assert.strictEqual(queue.items.length, 2);
    var item = { ratingKey: "5", duration: 1000 };
    await client.timeline(item, 10, "playing", "session-1", queue);
    assert.strictEqual(calls[1].url.searchParams.get("playQueueID"), "77");
    assert.strictEqual(calls[1].url.searchParams.get("playQueueItemID"), "501");
    await client.timeline(item, 10, "playing", "session-1", { id: "0", itemId: "x" });
    assert.strictEqual(calls[2].url.searchParams.get("playQueueID"), null, "An invalid queue is never reported");
    await client.timeline(item, 10, "playing", "session-1");
    assert.strictEqual(calls[3].url.searchParams.get("playQueueItemID"), null);
    // LG's timeline contract (rust-modules/plex/src/plex/timeline.rs): the session rides as the
    // same X-Plex-Session-Identifier the decision used, with the SELECTED streams.
    assert.strictEqual(calls[3].url.searchParams.get("X-Plex-Session-Identifier"), "session-1");
    await client.timeline(item, 10, "stopped", "session-1", null, { audioId: 41, subtitleId: 0 });
    assert.strictEqual(calls[4].url.searchParams.get("audioStreamID"), "41");
    assert.strictEqual(calls[4].url.searchParams.get("subtitleStreamID"), null, "Subtitles off is not a stream id");
    await client.timeline(item, 10, "stopped", "session-1", null, { audioId: "x", subtitleId: 7 });
    assert.strictEqual(calls[5].url.searchParams.get("audioStreamID"), null, "An invalid stream id is never reported");
    assert.strictEqual(calls[5].url.searchParams.get("subtitleStreamID"), "7");
    console.log("Tizen favorite libraries, card menu and video PlayQueue contracts: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
