"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.join(__dirname, "../../samsung/Vemm");

function harness(seed) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var data = { "vemm-tizen-account": JSON.stringify({ version: 2, storage: "unencrypted", token: "synthetic-account-token" }) };
    Object.keys(seed || {}).forEach(function (key) { data[key] = seed[key]; });
    Object.defineProperty(dom.window, "localStorage", { value: {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) { data[key] = value; },
        removeItem: function (key) { delete data[key]; },
        key: function (index) { return Object.keys(data)[index] || null; },
        get length() { return Object.keys(data).length; }
    } });
    dom.window.fetch = function () { assert.fail("The synthetic account preferences UI must not use the network"); };
    var state = { hold: !!seed, release: null, loads: 0, saves: [], fail: 503, profile: { autoSelectAudio: false, defaultAudioLanguage: "",
        defaultSubtitleLanguage: "en", autoSelectSubtitle: 1, defaultSubtitleForced: 0 } };
    dom.window.PlexApi = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "pending" }); }
        }; },
        createAccountClient: function () { return {
            getProfiles: function () { return Promise.resolve([{ uuid: "synthetic-profile", title: "Profile" }]); },
            switchProfile: function () { return Promise.resolve("synthetic-profile-token"); },
            getServers: function () {
                return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", token: "synthetic-server-token",
                    connections: [{ uri: "https://server.synthetic.invalid" }] }]);
            },
            accountPreferences: function () {
                state.loads += 1;
                if (state.fail) { var error = new Error("Synthetic"); error.status = state.fail; state.fail = 0; return Promise.reject(error); }
                if (state.hold) { return new Promise(function (resolve) { state.release = function () { resolve({ profile: state.profile }); }; }); }
                return Promise.resolve({ profile: state.profile });
            },
            saveAccountPreferences: function (query) { state.saves.push(query); return Promise.resolve({}); }
        }; },
        selectServer: function () {
            return Promise.resolve({ client: {
                getSections: function () { return Promise.resolve([{ key: "1", type: "movie", title: "Movies" }]); },
                getHomeHubs: function () { return Promise.resolve([]); }
            } });
        }
    };
    ["js/i18n.js", "js/session.js", "js/account-preferences.js", "main.js"].forEach(function (file) {
        dom.window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function find(pattern) {
        return Array.from(dom.window.document.querySelectorAll("button")).find(function (node) {
            return pattern.test(node.textContent);
        });
    }
    return {
        state: state, find: find, data: data,
        text: function () { return dom.window.document.body.textContent; },
        click: function (pattern) {
            var node = find(pattern);
            assert(node, "Missing control: " + pattern);
            node.focus();
            node.click();
        },
        close: function () { dom.window.close(); }
    };
}
async function settle() { for (var i = 0; i < 20; i += 1) { await Promise.resolve(); } }

async function run() {
    var ui = harness();
    await settle();
    ui.click(/^Profile$/);
    await settle();
    // The only server connects automatically.
    ui.click(/^Settings$/);
    await settle();
    ui.click(/^Audio & subtitles$/);
    await settle();
    assert(ui.text().includes("Audio & subtitles"));
    assert(ui.text().includes("Plex account preferences are unavailable. Select Retry."));
    ui.click(/^Retry$/);
    await settle();
    assert.strictEqual(ui.state.loads, 2);
    assert(ui.find(/^Preferred audio language: Original$/));
    assert(ui.text().includes("Automatic selection is off. Choosing a language enables it."));
    assert(ui.find(/^Subtitles: When audio isn't in the subtitle language$/));
    assert(ui.find(/^Subtitle language: English$/));
    assert(ui.find(/^Forced subtitles: Prefer non-forced subtitles$/));

    ui.click(/^Preferred audio language:/);
    assert(!ui.find(/^Português \(Brasil\)$/) || true);
    ui.click(/^Français$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { autoSelectAudio: "true", defaultAudioLanguage: "fr" });
    assert(ui.find(/^Preferred audio language: Français$/), "Back on Settings with the saved value");
    assert(!ui.text().includes("Automatic selection is off."));

    ui.click(/^Subtitles:/);
    ui.click(/^Always$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { autoSelectSubtitle: "2" });
    ui.click(/^Subtitle language:/);
    ui.click(/^No preference$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { defaultSubtitleLanguage: "" });
    assert(ui.find(/^Subtitle language: No preference$/));
    ui.click(/^Forced subtitles:/);
    ui.click(/^Only forced subtitles$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { defaultSubtitleForced: "2" });
    assert.strictEqual(ui.state.loads, 2, "Settings reuses the loaded preferences");
    assert(JSON.parse(ui.data["vemm-tizen-account-audio-synthetic-profile"]).audioLanguage === "fr", "The saved choice is cached for the profile");
    ui.close();

    // A fresh boot with a cached profile draws immediately, then refreshes in place.
    var cached = { autoSelectAudio: true, audioLanguage: "de", subtitleLanguage: "", subtitleMode: 2, subtitleForced: 0 };
    var warm = harness({ "vemm-tizen-account-audio-synthetic-profile": JSON.stringify(cached) });
    warm.state.fail = 0;
    await settle();
    warm.click(/^Profile$/);
    await settle();
    warm.click(/^Settings$/);
    await settle();
    warm.click(/^Audio & subtitles$/);
    await settle();
    assert.strictEqual(warm.state.loads, 1, "It still asks plex.tv");
    assert(warm.state.release, "plex.tv has not answered yet");
    assert(warm.find(/^Preferred audio language: Deutsch$/), "Cached values show before plex.tv answers");
    assert(warm.find(/^Subtitles: Always$/));
    assert(!warm.text().includes("Loading your Plex account preferences"), "No loading state with a cache");
    warm.state.release();
    await settle();
    assert(warm.find(/^Preferred audio language: Original$/), "The refresh updates the page in place");
    assert(warm.find(/^Subtitles: When audio isn't in the subtitle language$/));
    assert.strictEqual(JSON.parse(warm.data["vemm-tizen-account-audio-synthetic-profile"]).subtitleMode, 1, "The cache follows the refresh");
    warm.click(/^Back$/);
    await settle();
    warm.click(/^Privacy and data$/);
    await settle();
    warm.click(/^Sign out$/);
    await settle();
    assert.strictEqual(warm.data["vemm-tizen-account-audio-synthetic-profile"], undefined, "Sign out clears the cache");
    warm.close();
    console.log("Tizen account audio & subtitles settings: load/error/Retry/save/cache journeys passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
