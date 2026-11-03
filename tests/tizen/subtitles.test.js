"use strict";
var assert = require("assert");
var subtitles = require("../../samsung/Vemm/js/subtitles.js");
var cues = subtitles.parse("1\r\n00:00:01,000 --> 00:00:02,500\r\n<b>First</b>\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond");
assert.strictEqual(subtitles.at(cues, 1500), "First");
assert.strictEqual(subtitles.at(cues, 2600), "");
assert.strictEqual(subtitles.at(cues, 3500), "Second");
cues = subtitles.parse("WEBVTT\n\n00:01.000 --> 00:02.000 align:middle\nCaption");
assert.strictEqual(subtitles.at(cues, 1000), "Caption");
assert.strictEqual(subtitles.at(cues, 2000), "");
// One broken cue costs that cue, not the file: a single zero-length cue used to reject a whole sidecar.
cues = subtitles.parse("1\n00:00:05,000 --> 00:00:05,000\nZero length\n\n2\n00:00:06,000 --> 00:00:07,000\nKept\n\n" +
    "3\n00:99:00,000 --> 00:99:01,000\nBad time\n\n4\n00:00:09,000 --> 00:00:08,000\nBackwards\n\n5\n00:00:10,000 --> 00:00:11,000\nAlso kept");
assert.deepStrictEqual(cues.map(function (cue) { return cue.text; }), ["Kept", "Also kept"]);
assert.throws(function () { subtitles.parse("1\n00:00:02,000 --> 00:00:01,000\nInvalid"); }, /No SRT or WebVTT/,
    "A file with no usable cue at all is still an error");
assert.throws(function () { subtitles.parse("[Script Info]\nASS"); }, /No SRT or WebVTT/);
assert.throws(function () { subtitles.parse("x".repeat(2 * 1024 * 1024 + 1)); }, /size limit/);
// Embedded (AVPlay) and sidecar cue markup: line breaks render as lines, never as literal tags.
assert.strictEqual(subtitles.clean("Hello</br>there"), "Hello\nthere");
assert.strictEqual(subtitles.clean("One<br>Two<BR/>Three<br />Four"), "One\nTwo\nThree\nFour");
assert.strictEqual(subtitles.clean("{\\an8}Top\\NLine\\hend"), "Top\nLine end");
assert.strictEqual(subtitles.clean("<i>Tom &amp; Jerry</i> &lt;3"), "Tom & Jerry <3");
assert.strictEqual(subtitles.clean("<font color=\"#ff0\">a</font>\r\n\n\nb"), "a\nb");
assert.strictEqual(subtitles.clean(null), "");
cues = subtitles.parse("1\n00:00:01,000 --> 00:00:02,000\nA<br/>B");
assert.strictEqual(subtitles.at(cues, 1500), "A\nB");
// When the shown text next changes, for drawing a cue between AVPlay's time reports.
cues = subtitles.parse("1\n00:00:01,000 --> 00:00:02,000\nA\n\n2\n00:00:01,500 --> 00:00:04,000\nB\n\n3\n00:00:06,000 --> 00:00:07,000\nC");
assert.strictEqual(subtitles.next(cues, 0), 1000, "Before the first cue: its start");
assert.strictEqual(subtitles.next(cues, 1000), 1500, "Inside a cue: the next start");
assert.strictEqual(subtitles.next(cues, 1600), 2000, "Overlapping cues: the first end");
assert.strictEqual(subtitles.next(cues, 2000), 4000);
assert.strictEqual(subtitles.next(cues, 4000), 6000, "Between cues: the next start");
assert.strictEqual(subtitles.next(cues, 6500), 7000);
assert.strictEqual(subtitles.next(cues, 7000), Infinity, "Nothing after the last cue");
assert.strictEqual(subtitles.next([], 0), Infinity);
// The app can only draw text PMS will send it: a sidecar file. A track inside the video file answers HTTP 501.
assert.strictEqual(subtitles.drawable({ codec: "srt", key: "/library/streams/1" }), true);
assert.strictEqual(subtitles.drawable({ codec: "webvtt", key: "/library/streams/1" }), true);
assert.strictEqual(subtitles.drawable({ codec: "srt", index: 3 }), false, "Embedded text has no key");
assert.strictEqual(subtitles.drawable({ codec: "ass", key: "/library/streams/1" }), false, "Styled text stays with the server");
assert.strictEqual(subtitles.drawable({ codec: "pgs", index: 4 }), false);
var fs = require("fs");
var path = require("path");
var mainSource = fs.readFileSync(path.join(__dirname, "../../samsung/Vemm/main.js"), "utf8");
assert.ok(mainSource.includes("VemmSubtitles.clean(event.detail.text)"), "Embedded AVPlay subtitle text is cleaned before display");
var css = fs.readFileSync(path.join(__dirname, "../../samsung/Vemm/css/style.css"), "utf8");
var base = /\.subtitle-text \{([^}]*)\}/.exec(css)[1];
assert.ok(!/background/.test(base) && /text-shadow/.test(base), "Subtitles default to an outline with no box");
assert.ok(/\.subtitle-text\.subtitle-background-on \{[^}]*background/.test(css), "Background On restores the box");
console.log("Tizen SRT/WebVTT parsing/seek/cue-boundary tests: passed");
