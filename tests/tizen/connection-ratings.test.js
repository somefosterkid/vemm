"use strict";
// Remembered connection first, Rating parsing per source and library rating-source prefs helpers.
var assert = require("assert");
var api = require("../../samsung/Vemm/js/plex-api.js");

function memory() {
    var data = {};
    return { data: data, getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
        setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; } };
}
function identityFetch(server, failing, calls) {
    return function (url) {
        calls.push(url);
        if (failing.some(function (part) { return url.indexOf(part) !== -1; })) { return Promise.reject(new Error("offline")); }
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: { machineIdentifier: server.id } });
        } });
    };
}

async function connections() {
    var key = "vemm-tizen-last-connection";
    var server = { id: "synthetic-machine", token: "synthetic-server-grant", connections: [
        { uri: "https://v6.invalid:32400" }, { uri: "https://v4.invalid:32400" }, { uri: "https://relay.invalid", relay: true }
    ] };
    var storage = memory();
    var calls = [];
    var first = await api.selectServer(server, { storage: storage, fetch: identityFetch(server, ["v6"], calls) });
    assert.strictEqual(calls.length, 2, "Without a memory the advertised order is used");
    assert.strictEqual(first.relay, false);
    assert.deepStrictEqual(JSON.parse(storage.data[key]), { "synthetic-machine": "https://v4.invalid:32400" },
        "The winning URI is saved per server id");
    assert.strictEqual(storage.data[key].indexOf(server.token), -1, "No token is stored");

    calls = [];
    var attempts = [];
    await api.selectServer(server, { storage: storage, onAttempt: function (a) { attempts.push(a); },
        fetch: identityFetch(server, ["v6"], calls) });
    assert.strictEqual(calls.length, 1, "The remembered URI is tried first and alone when it works");
    assert.strictEqual(calls[0].indexOf("https://v4.invalid:32400"), 0);
    assert.strictEqual(attempts[0].total, 3, "Progress still counts every connection");
    assert.strictEqual(server.connections[0].uri, "https://v6.invalid:32400", "The server's connection list is not reordered");

    calls = [];
    var fallback = await api.selectServer(server, { storage: storage, fetch: identityFetch(server, ["v4", "v6"], calls) });
    assert.strictEqual(fallback.relay, true, "A failing remembered URI falls back through the existing order");
    assert.deepStrictEqual(calls.map(function (u) { return u.split("/identity")[0]; }),
        ["https://v4.invalid:32400", "https://v6.invalid:32400", "https://relay.invalid"],
        "Remembered first, then the rest in order without retrying it");
    assert.strictEqual(JSON.parse(storage.data[key])["synthetic-machine"], "https://relay.invalid");

    storage.data[key] = JSON.stringify({ "synthetic-machine": "https://gone.invalid" });
    calls = [];
    await api.selectServer(server, { storage: storage, fetch: identityFetch(server, [], calls) });
    assert.strictEqual(calls[0].indexOf("https://v6.invalid"), 0, "A remembered URI the server no longer lists is ignored");
    storage.data[key] = "{not json";
    await api.selectServer(server, { storage: storage, fetch: identityFetch(server, [], []) });
    assert.strictEqual(JSON.parse(storage.data[key])["synthetic-machine"], "https://v6.invalid:32400",
        "Corrupt memory is replaced");
}

function ratings() {
    var item = { Rating: [
        { image: "imdb://image.rating", value: 7.8, type: "audience" },
        { image: "rottentomatoes://image.rating.ripe", value: 9.1, type: "critic" },
        { image: "rottentomatoes://image.rating.upright", value: 8.5, type: "audience" },
        { image: "themoviedb://image.rating", value: 7.6, type: "audience" },
        { image: "letterboxd://image.rating", value: 3, type: "audience" }
    ], rating: 1, ratingImage: "imdb://image.rating" };
    var all = api.ratingBadges(item);
    assert.deepStrictEqual(all.map(function (b) { return b.source + "=" + b.text; }),
        ["rt_critic=91%", "rt_audience=85%", "imdb=7.8/10", "tmdb=76%"]);
    assert.strictEqual(all[0].fresh, true);
    var rotten = api.ratingBadges({ Rating: [{ image: "rottentomatoes://image.rating.rotten", value: 3.2, type: "critic" }] });
    assert.strictEqual(rotten[0].text, "32%");
    assert.strictEqual(rotten[0].fresh, false);
    assert.deepStrictEqual(api.ratingBadges(item, ["tmdb", "imdb"]).map(function (b) { return b.source; }), ["imdb", "tmdb"],
        "Only the enabled sources are returned");
    assert.deepStrictEqual(api.ratingBadges(item, []), []);
    var fallback = api.ratingBadges({ rating: 9.1, ratingImage: "rottentomatoes://image.rating.rotten",
        audienceRating: 7.4, audienceRatingImage: "imdb://image.rating" });
    assert.deepStrictEqual(fallback.map(function (b) { return b.source + "=" + b.text; }), ["rt_critic=91%", "imdb=7.4/10"],
        "Library rating fields are used when Rating is absent");
    assert.deepStrictEqual(api.ratingBadges({ rating: 5 }), [], "A score with no known source is not shown");
    assert.deepStrictEqual(api.ratingBadges({ Rating: [{ image: "imdb://image.rating", value: "x" }] }), []);
}

async function prefs() {
    var calls = [];
    var client = api.createClient({ baseUrl: "https://pms.invalid", token: "t", fetch: function (url, options) {
        calls.push({ url: url, method: options.method });
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: { Setting: [
                { id: "enableCinemaTrailers", type: "bool", value: true },
                { id: "ratingsSource", label: "Ratings source", type: "int", value: 1, default: 0,
                    enumValues: "0:Rotten Tomatoes|1:IMDb|2:The Movie Database" }] } });
        } });
    } });
    var settings = await client.getSectionPrefs("3");
    assert.strictEqual(calls[0].url.indexOf("https://pms.invalid/library/sections/3/prefs"), 0);
    var pref = api.ratingPref(settings);
    assert.strictEqual(pref.id, "ratingsSource");
    assert.strictEqual(pref.value, "1");
    assert.deepStrictEqual(pref.options, [{ value: "0", label: "Rotten Tomatoes" }, { value: "1", label: "IMDb" },
        { value: "2", label: "The Movie Database" }]);
    assert.strictEqual(api.ratingPref([{ id: "ratingsSource", type: "text" }]), null, "A rating setting without enumValues is ignored");
    assert.strictEqual(api.ratingPref([{ id: "other", enumValues: "0:a" }]), null);
    await client.setSectionPref("3", "ratingsSource", "2");
    assert.strictEqual(calls[1].method, "PUT");
    assert.strictEqual(calls[1].url, "https://pms.invalid/library/sections/3/prefs?ratingsSource=2");
    await assert.rejects(client.setSectionPref("3", "bad&id", "1"));
    await assert.rejects(client.setSectionPref("x/../", "ratingsSource", "1"));
}

(async function () {
    await connections(); ratings(); await prefs();
    console.log("Tizen connection memory and ratings: passed");
}()).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
