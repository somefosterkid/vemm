"use strict";
// The player's track menus: labels stay distinct across the shapes Plex really sends, and the likely choices come first.
var assert = require("assert");
var path = require("path");
var menu = require(path.resolve(__dirname, "../../samsung/Vemm/js/track-menu.js"));
var search = require(path.resolve(__dirname, "../../samsung/Vemm/js/subtitle-search.js"));

function subtitle(id, language, code, codec, title, extra) {
    var row = { id: id, streamType: 3, language: language, languageCode: code, codec: codec, title: title, displayTitle: language };
    Object.keys(extra || {}).forEach(function (key) { row[key] = extra[key]; });
    return row;
}
function audio(id, language, code, displayTitle, title) {
    return { id: id, streamType: 2, language: language, languageCode: code, codec: "aac", title: title, displayTitle: displayTitle };
}

// Several tracks under one language name each say what they are.
var subtitles = [
    subtitle(1, "English", "eng", "pgs"),
    subtitle(2, "English", "eng", "pgs", "SDH", { hearingImpaired: true, displayTitle: "English SDH" }),
    subtitle(3, "English", "eng", "srt", "", { forced: "1" }),
    subtitle(4, "Español", "spa", "srt", "Latin American"),
    subtitle(5, "Español", "spa", "srt", "Latin American | SDH"),
    subtitle(6, "Español", "spa", "pgs", "European"),
    subtitle(7, "Nederlands", "nld", "srt"),
    subtitle(8, "Nederlands", "nld", "pgs"),
    subtitle(9, "中文", "zho", "srt", "Simplified"),
    subtitle(10, "English", "eng", "ass", "English subs", { displayTitle: "English" })
];
assert.deepStrictEqual(menu.labels(subtitles, "Forced"), [
    "English · PGS", "English · SDH", "English · Forced", "Español · Latin American", "Español · Latin American · SDH", "Español · European",
    "Nederlands · SRT", "Nederlands · PGS", "中文 · Simplified", "English · ASS"
], "The format appears only where two tracks would otherwise read the same");
assert.strictEqual(new Set(menu.labels(subtitles, "Forced")).size, subtitles.length, "No two rows read the same");
assert.deepStrictEqual(menu.labels([subtitle(1, "Deutsch", "deu", "srt", "SDH", { hearingImpaired: 1 })], "Erzwungen"), ["Deutsch · SDH"],
    "A title and the flag saying the same thing appear once");
assert.deepStrictEqual(menu.labels([subtitle(1, "Deutsch", "deu", "srt", "", { forced: true })], "Erzwungen"), ["Deutsch · Erzwungen"],
    "The word for Forced comes from the caller, translated");

// A title is cut down to what it adds.
assert.deepStrictEqual(menu.labels([subtitle(1, "English", "eng", "srt", "English (Forced)")], "Forced"), ["English · Forced"],
    "A title naming the language still says what kind of track it is");
assert.deepStrictEqual(menu.labels([subtitle(1, "Español", "spa", "srt", "Latin American (SDH)", { hearingImpaired: true })], "Forced"),
    ["Español · Latin American (SDH)"], "The flag adds nothing a title already says");
var sentence = "Commentary with the director, the writer, the editor and most of the synthetic cast";
var cut = menu.labels([audio(1, "English", "eng", "English (AC3 Stereo)", sentence)], "Forced")[0];
assert(cut.length < 70 && cut.indexOf("Commentary with the director") !== -1 && cut.indexOf("…") !== -1 && /AC3 Stereo$/.test(cut),
    "A title that runs to a sentence is cut, and the format still shows: " + cut);
// Tracks even the server cannot tell apart are numbered, so every row can be told from the next.
assert.deepStrictEqual(menu.labels([subtitle(1, "Español", "spa", "pgs", "", { displayTitle: "Español (PGS)" }), subtitle(2, "Español", "spa", "pgs", "", { displayTitle: "Español (PGS)" })], "Forced"),
    ["Español (PGS)", "Español (PGS) · 2"]);

// Audio always says its format, without the speaker list.
assert.deepStrictEqual(menu.labels([
    audio(1, "English", "eng", "English (AAC 5.1)", "Surround"),
    audio(2, "English", "eng", "English (HE-AAC Stereo)", "Commentary"),
    audio(3, "English", "eng", "English (EAC3 8 Channels (FL+FR+FC+LFE+SL+SR+TFL+TFR) + Atmos)")
], "Forced"), ["English · Surround · AAC 5.1", "English · Commentary · HE-AAC Stereo", "English · EAC3 8 Channels + Atmos"]);

// When the format cannot tell tracks apart either, the server's own title does.
assert.deepStrictEqual(menu.labels([audio(1, "English", "eng", "English main"), audio(2, "English", "eng", "English other")], "Forced"),
    ["English main", "English other"]);

// A stream without a language still gets a name.
assert.deepStrictEqual(menu.labels([{ id: 1, streamType: 3, codec: "srt" }], "Forced"), ["srt"]);

// The current track, then others in its language, then the viewer's languages; the rest keep the file's order.
function ids(rows) { return rows.map(function (row) { return row.id; }); }
var arranged = menu.arrange(subtitles, 5, ["en"], search.twoLetter);
assert.deepStrictEqual(ids(arranged.first), [5, 4, 6, 1, 2, 3, 10], "Current, its language, then the viewer's");
assert.deepStrictEqual(ids(arranged.others), [7, 8, 9], "The rest stay in file order");

arranged = menu.arrange(subtitles, 0, ["nl", "en"], search.twoLetter);
assert.deepStrictEqual(ids(arranged.first), [7, 8, 1, 2, 3, 10], "With nothing chosen, the viewer's languages in their order");

arranged = menu.arrange(subtitles, 9, [null, "zh"], search.twoLetter);
assert.deepStrictEqual(ids(arranged.first), [9], "An unknown language asks for nothing; the current language is not repeated");
assert.strictEqual(arranged.first.length + arranged.others.length, subtitles.length, "No track is lost");

arranged = menu.arrange([], 1, ["en"], search.twoLetter);
assert.deepStrictEqual(arranged, { first: [], others: [] }, "A file without tracks has an empty menu");

console.log("Tizen track menu order and labels tests: passed");
