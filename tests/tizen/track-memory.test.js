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

// What a track carries. Plex flags forced and SDH tracks only sometimes; the rest is in the track's title.
["English Forced", "English [Forced]", "English (forced)", "Signs", "Signs & Songs", "English Signs", "Signs/Songs [Synthetic]",
    "Songs", "Commentary", "Sing-Along"].forEach(function (title) {
    assert.strictEqual(VemmTrackMemory.kind(sub(1, "eng", false, { title: title })), "forced", title + " leaves the dialogue out");
});
["English", "Full Subtitles Signs [Synthetic]", "Dialogue", "English [Full]", "Stripped"].forEach(function (title) {
    assert.strictEqual(VemmTrackMemory.kind(sub(1, "eng", false, { title: title })), "regular", title + " has the dialogue");
});
["English (SDH)", "English (CC)"].forEach(function (title) {
    assert.strictEqual(VemmTrackMemory.kind(sub(1, "eng", false, { title: title })), "sdh", title);
});
assert.strictEqual(VemmTrackMemory.kind(sub(1, "eng", false, { forced: true })), "forced");
assert.strictEqual(VemmTrackMemory.kind(sub(1, "eng", false, { hearingImpaired: true })), "sdh");

// A pick of the full track must not land on a Signs or Commentary track listed first in the next episode.
var signsFirst = [audio(80, "eng", true), sub(81, "eng", true, { title: "Signs" }), sub(82, "eng", false, { title: "Commentary" }),
    sub(83, "eng", false, { title: "Full Subtitles" })];
assert.deepStrictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "eng" }, signsFirst), { audioId: 80, subtitleId: 83 });
assert.strictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "eng" }, [audio(84, "eng", true), sub(85, "eng", true, { title: "Signs" })]), null,
    "No full track: the episode keeps what the server picked");
// The everyday case: the server picked the forced track, the viewer asked for all the dialogue.
assert.deepStrictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "eng" }, [audio(86, "eng", true),
    sub(87, "eng", true, { forced: true }), sub(88, "eng"), sub(89, "eng", false, { hearingImpaired: true })]), { audioId: 86, subtitleId: 88 });

// Moving the selection off a downloaded subtitle deletes it on the server, so memory never does that by itself.
var downloaded = [audio(90, "jpn", true), audio(91, "eng"), sub(92, "eng", true, { key: "/library/streams/92", providerTitle: "Synthetic Provider" }), sub(93, "eng", false, { index: 3 })];
assert.strictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "off" }, downloaded), null, "Off leaves a downloaded subtitle alone");
assert.strictEqual(VemmTrackMemory.choose({ show: "500", subtitle: "eng:sdh" }, downloaded), null);
assert.deepStrictEqual(VemmTrackMemory.choose({ show: "500", audio: "eng", subtitle: "off" }, downloaded), { audioId: 91, subtitleId: 92 },
    "Other memories still apply, naming the downloaded subtitle so it stays");

// The menu order: the tracks with all the dialogue first, keeping Plex's order within each kind.
assert.deepStrictEqual(VemmTrackMemory.ordered([sub(1, "eng", true, { forced: true }), sub(2, "eng", false, { title: "Commentary" }),
    sub(3, "eng", false, { hearingImpaired: true }), sub(4, "eng"), sub(5, "eng", false, { title: "English" })]).map(function (stream) { return stream.id; }),
    [4, 5, 3, 1, 2]);
// Labels: Plex's short title, or its long one where two tracks would read the same.
var same = [{ id: 1, displayTitle: "English", extendedDisplayTitle: "English (PGS)" }, { id: 2, displayTitle: "English", extendedDisplayTitle: "Commentary (English PGS)" },
    { id: 3, displayTitle: "English SDH", extendedDisplayTitle: "English SDH (SRT)" }, { id: 4, language: "French", codec: "srt" }];
assert.strictEqual(VemmTrackMemory.label(same[0], same), "English (PGS)");
assert.strictEqual(VemmTrackMemory.label(same[1], same), "Commentary (English PGS)");
assert.strictEqual(VemmTrackMemory.label(same[2], same), "English SDH");
assert.strictEqual(VemmTrackMemory.label(same[3], same), "French");
assert.strictEqual(VemmTrackMemory.label({ id: 5, codec: "srt" }, []), "srt");
assert.strictEqual(VemmTrackMemory.label({ id: 6 }, []), "6");

// Plex's selection stays until the viewer picks otherwise, a forced track over audio in its own language too.
function partial(audioCode) {
    return [audio(100, audioCode, true), sub(101, "eng", true, { forced: true }), sub(102, "eng"), sub(103, "eng", false, { hearingImpaired: true }), sub(104, "fra")];
}
assert.strictEqual(VemmTrackMemory.choose(null, partial("eng")), null, "With no pick, a forced track stays");
assert.strictEqual(VemmTrackMemory.choose({ show: "700", audio: "eng" }, partial("eng")), null, "A pick of the audio says nothing about subtitles");
// The viewer's subtitle choice for the show applies, where the episode has it.
assert.strictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "eng:forced" }, partial("eng")), null);
assert.deepStrictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "eng" }, partial("eng")), { audioId: 100, subtitleId: 102 }, "A pick of the full track carries over");
assert.deepStrictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "off" }, partial("eng")), { audioId: 100, subtitleId: 0 }, "Off stays off");
assert.deepStrictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "eng:sdh" }, partial("eng")), { audioId: 100, subtitleId: 103 });
assert.strictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "spa" }, partial("eng")), null, "A pick this episode lacks keeps Plex's choice");
assert.strictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "eng" }, [audio(126, "eng", true), sub(127, "eng", true, { forced: true, providerTitle: "Synthetic Provider" }), sub(128, "eng")]), null,
    "Moving off a downloaded subtitle would delete it");
// A selection that already fits the memory stays. Files can hold two tracks that read "English", and a pick of the second must stick.
assert.strictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "eng" }, [audio(150, "eng", true), sub(151, "eng"), sub(152, "eng", true)]), null);
assert.strictEqual(VemmTrackMemory.choose({ show: "700", subtitle: "eng:forced" }, [audio(153, "eng", true), sub(154, "eng", false, { title: "Commentary" }), sub(155, "eng", true, { title: "Signs" })]), null);
// A pick of the forced track, and the track the menu's note can point at.
var backStore = storage();
VemmTrackMemory.remember(backStore, "701", partial("eng"), { subtitleId: 101 });
assert.strictEqual(VemmTrackMemory.choose(VemmTrackMemory.recall(backStore, "701"), partial("eng")), null);
assert.strictEqual(VemmTrackMemory.fullTrack(partial("eng")[1], partial("eng")).id, 102);
assert.strictEqual(VemmTrackMemory.fullTrack(sub(140, "eng", false, { forced: true }), [sub(140, "eng", false, { forced: true }), sub(141, "fra")]), null);

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
