"use strict";
// Per-show audio and subtitle memory: what is kept, how another episode is matched, bounds. Synthetic only.
var assert = require("assert");
var VemmTrackMemory = require("../../samsung/Vemm/js/track-memory.js");

function storage() {
    var data = {};
    return {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { data[key] = String(value); },
        raw: data
    };
}
function audio(id, code, selected) { return { id: id, streamType: 2, languageCode: code, selected: !!selected }; }
function sub(id, code, selected, extra) {
    var stream = { id: id, streamType: 3, languageCode: code, selected: !!selected };
    Object.keys(extra || {}).forEach(function (key) { stream[key] = extra[key]; });
    return stream;
}
// Episode 1: Japanese audio and English subtitles are the server's pick; Portuguese audio and subtitles exist.
var one = [audio(10, "jpn", true), audio(11, "por"), sub(12, "por"), sub(13, "por", false, { forced: true }),
    sub(14, "eng", true), sub(15, "eng", false, { hearingImpaired: true })];
var two = [audio(20, "jpn", true), audio(21, "por"), sub(22, "por"), sub(23, "por", false, { forced: true }),
    sub(24, "eng", true), sub(25, "eng", false, { hearingImpaired: true })];

var store = storage();
assert.strictEqual(VemmTrackMemory.recall(store, "500"), null, "Nothing is remembered at first");
assert.strictEqual(VemmTrackMemory.choose(null, two), null);

// Switching the audio to Portuguese is remembered by language, and only the audio.
VemmTrackMemory.remember(store, "500", one, { audioId: 11 });
assert.deepStrictEqual(VemmTrackMemory.recall(store, "500"), { show: "500", audio: "por" });
assert.deepStrictEqual(VemmTrackMemory.choose(VemmTrackMemory.recall(store, "500"), two), { audioId: 21, subtitleId: 24 },
    "Another episode gets the Portuguese track and keeps the server's subtitle pick");
assert.strictEqual(VemmTrackMemory.choose(VemmTrackMemory.recall(store, "500"), [audio(30, "por", true), sub(31, "eng", true)]), null,
    "When the server already picked that language nothing changes");
assert.strictEqual(VemmTrackMemory.choose(VemmTrackMemory.recall(store, "500"), [audio(40, "jpn", true), sub(41, "eng", true)]), null,
    "An episode without the language keeps the defaults");

// Subtitles: language and kind; forced and SDH are kept apart from the plain track.
VemmTrackMemory.remember(store, "500", one, { subtitleId: 13 });
assert.deepStrictEqual(VemmTrackMemory.recall(store, "500"), { show: "500", audio: "por", subtitle: "por:forced" });
assert.deepStrictEqual(VemmTrackMemory.choose(VemmTrackMemory.recall(store, "500"), two), { audioId: 21, subtitleId: 23 });
VemmTrackMemory.remember(store, "500", one, { subtitleId: 15 });
assert.strictEqual(VemmTrackMemory.recall(store, "500").subtitle, "eng:sdh");
// SDH falls back to the plain track of the language; forced does not.
var plainOnly = [audio(50, "por"), audio(51, "jpn", true), sub(52, "eng"), sub(53, "por")];
assert.strictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "eng:sdh" }, plainOnly).subtitleId, 52);
assert.strictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "por:forced" }, plainOnly), null);

// Subtitles off is a choice too, and only changes an episode where the server would show subtitles.
VemmTrackMemory.remember(store, "500", one, { subtitleId: 0 });
assert.strictEqual(VemmTrackMemory.recall(store, "500").subtitle, "off");
assert.deepStrictEqual(VemmTrackMemory.choose(VemmTrackMemory.recall(store, "500"), two), { audioId: 21, subtitleId: 0 });
assert.strictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "off" }, [audio(60, "jpn", true), sub(61, "eng")]), null);

// A track with no language is not remembered; a track that is not in the list is ignored.
var before = JSON.stringify(VemmTrackMemory.recall(store, "500"));
VemmTrackMemory.remember(store, "500", [audio(70, "", true), audio(71, "und", false)], { audioId: 70 });
VemmTrackMemory.remember(store, "500", one, { audioId: 999 });
assert.strictEqual(JSON.stringify(VemmTrackMemory.recall(store, "500")), before);

// Reset, shows are separate, newest first, and only 50 are kept.
VemmTrackMemory.remember(store, "501", one, { audioId: 11 });
VemmTrackMemory.forget(store, "500");
assert.strictEqual(VemmTrackMemory.recall(store, "500"), null);
assert.strictEqual(VemmTrackMemory.recall(store, "501").audio, "por");
for (var show = 0; show < 60; show += 1) { VemmTrackMemory.remember(store, "s" + show, one, { audioId: 11 }); }
var kept = JSON.parse(store.raw["vemm-tizen-track-memory"]);
assert.strictEqual(kept.length, 50, "The oldest shows are dropped");
assert.strictEqual(kept[0].show, "s59");
assert.strictEqual(VemmTrackMemory.recall(store, "501"), null);

// Damaged storage and a storage that throws are harmless.
store.setItem("vemm-tizen-track-memory", "{broken");
assert.strictEqual(VemmTrackMemory.recall(store, "s59"), null);
store.setItem("vemm-tizen-track-memory", JSON.stringify([{ show: 5 }, null, { show: "7", audio: "jpn" }]));
assert.strictEqual(VemmTrackMemory.recall(store, "7").audio, "jpn");
var hostile = { getItem: function () { throw new Error("denied"); }, setItem: function () { throw new Error("denied"); } };
VemmTrackMemory.remember(hostile, "1", one, { audioId: 11 });
VemmTrackMemory.forget(hostile, "1");
assert.strictEqual(VemmTrackMemory.recall(hostile, "1"), null);
console.log("track memory tests passed");
