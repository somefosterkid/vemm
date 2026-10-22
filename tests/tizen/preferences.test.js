"use strict";
var assert = require("assert");
var prefs = require("../../samsung/Vemm/js/preferences.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.deepStrictEqual(prefs.load(storage), { quality: "original", language: "en", nextEpisode: "countdown",
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto", enhancedGraphics: false, saveHomeArtwork: false, artworkLimitMb: 10, saveLibraryArtwork: false, preloadArtwork: true, autoAdvanceFeatures: true, minBuffer: 1, skipIntro: "button", skipCredits: "button", theme: "blue", accent: "theme", autoOpenProfile: false, ratingSources: ["rt_critic", "rt_audience", "imdb", "tmdb"] });
value = JSON.stringify({ quality: "720", language: "en", autoNext: false });
assert.deepStrictEqual(prefs.load(storage), { quality: "720", language: "en", nextEpisode: "off",
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto", enhancedGraphics: false, saveHomeArtwork: false, artworkLimitMb: 10, saveLibraryArtwork: false, preloadArtwork: true, autoAdvanceFeatures: true, minBuffer: 1, skipIntro: "button", skipCredits: "button", theme: "blue", accent: "theme", autoOpenProfile: false, ratingSources: ["rt_critic", "rt_audience", "imdb", "tmdb"] }, "Preferences from earlier app versions receive safe defaults; auto-play off stays off");
value = JSON.stringify({ quality: "720", language: "en", autoNext: true });
assert.strictEqual(prefs.load(storage).nextEpisode, "countdown", "Auto-play on becomes the LG credits countdown");
assert.strictEqual("autoNext" in prefs.load(storage), false);
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", token: "synthetic-secret",
    skipInterval: 15, subtitleSize: "large", subtitlePosition: "middle", subtitleColor: "yellow", subtitleDelayMs: 500 });
assert.strictEqual(value.includes("secret"), false, "Only non-secret preference fields may be persisted");
assert.strictEqual(prefs.load(storage).language, "es");
assert.strictEqual(prefs.load(storage).skipInterval, 15);
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 500);
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: -60000 });
assert.strictEqual(prefs.load(storage).subtitleDelayMs, -60000, "Sidecar timing supports the LG 60-second earlier bound");
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 60000 });
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 60000, "Subtitle timing supports the LG 60-second later bound");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 50 });
}, /invalid/, "Timing offsets must use the LG 100 ms step");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 60100 });
}, /invalid/, "Timing offsets must stay inside the LG 60-second bound");
assert.strictEqual(prefs.load(storage).continueAction, "details", "Preferences saved before the Continue Watching choice load as Open details");
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", continueAction: "play",
    skipInterval: 60, subtitleSize: "small", subtitlePosition: "high", subtitleColor: "white", subtitleDelayMs: -500 });
assert.strictEqual(prefs.load(storage).continueAction, "play");
assert.strictEqual(prefs.load(storage).skipInterval, 60);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", continueAction: "delete" }); }, /invalid/);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off" });
assert.strictEqual(prefs.load(storage).quality, "original", "Original quality is a saved choice");
assert.throws(function () { prefs.save(storage, { quality: "4k", language: "en", nextEpisode: "off" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", skipInterval: 45 }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitlePosition: "center" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 2501 }); }, /invalid/);
prefs.save(storage, { quality: "1080", language: "en", nextEpisode: "off", directPlay: "off" });
assert.strictEqual(prefs.load(storage).directPlay, "off");
prefs.save(storage, { quality: "1080h", language: "en", nextEpisode: "after_credits", directPlay: "force",
    subtitleSize: "extra_large", subtitleColor: "grey_55" });
assert.strictEqual(prefs.load(storage).quality, "1080h", "The LG ladder's 1080p 20 Mbps rung is a saved choice");
assert.strictEqual(prefs.load(storage).directPlay, "force");
assert.strictEqual(prefs.load(storage).subtitleSize, "extra_large");
assert.strictEqual(prefs.load(storage).subtitleColor, "grey_55");
assert.strictEqual(prefs.load(storage).subtitleBackground, "off", "Subtitles default to the LG outline, no box");
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", subtitleBackground: "on" });
assert.strictEqual(prefs.load(storage).subtitleBackground, "on");
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", subtitleBackground: "grey" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "always" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "1080", language: "en", nextEpisode: "off", directPlay: "always" }); }, /invalid/);
value = "{invalid";
assert.throws(function () { prefs.load(storage); }, /invalid/);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: true });
assert.strictEqual(prefs.load(storage).enhancedGraphics, true);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: false });
assert.strictEqual(prefs.load(storage).enhancedGraphics, false);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", saveHomeArtwork: true });
assert.strictEqual(prefs.load(storage).saveHomeArtwork, true);
[1, "true", null, {}].forEach(function (invalid) {
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: invalid });
    }, /invalid/);
});
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", minBuffer: 15 });
assert.strictEqual(prefs.load(storage).minBuffer, 15, "The minimum buffer is a saved choice");
[0.5, 1, 2, 4, 8, 15].forEach(function (seconds) {
    prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", minBuffer: seconds });
    assert.strictEqual(prefs.load(storage).minBuffer, seconds);
});
assert.deepStrictEqual(prefs.bufferSizes, [0.5, 1, 2, 4, 8, 15], "Shortest first; 0.1 s is no longer offered");
value = JSON.stringify({ quality: "1080h", language: "en", nextEpisode: "countdown", minBuffer: 0.1 });
assert.strictEqual(prefs.load(storage).minBuffer, 0.5, "A saved 0.1 s (slower on the TV) loads as 0.5 s, not as invalid preferences");
[3, 30, "auto", "8", null, 0, 0.2].forEach(function (invalid) {
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", minBuffer: invalid });
    }, /invalid/);
});
// Earlier buffer settings ("Buffer before playing" bufferSeconds, then "Buffer: Auto" buffer) no longer apply.
value = JSON.stringify({ quality: "1080h", language: "en", nextEpisode: "countdown", bufferSeconds: 30 });
assert.strictEqual(prefs.load(storage).minBuffer, 1);
assert.strictEqual("bufferSeconds" in prefs.load(storage), false);
value = JSON.stringify({ quality: "1080h", language: "en", nextEpisode: "countdown", buffer: "auto" });
assert.strictEqual(prefs.load(storage).minBuffer, 1, "A profile saved with Buffer: Auto loads with the 1 s minimum");
assert.strictEqual("buffer" in prefs.load(storage), false);
["button", "auto", "off"].forEach(function (mode) {
    prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", skipIntro: mode, skipCredits: mode });
    assert.strictEqual(prefs.load(storage).skipIntro, mode);
    assert.strictEqual(prefs.load(storage).skipCredits, mode);
});
["on", true, null].forEach(function (invalid) {
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", skipIntro: invalid });
    }, /invalid/);
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", skipCredits: invalid });
    }, /invalid/);
});
prefs.reset(storage);
assert.strictEqual(value, null);
["2160", "1440", "1080_16", "1080_12", "1080_10"].forEach(function (quality) {
    prefs.save(storage, { quality: quality, language: "en", nextEpisode: "off" });
    assert.strictEqual(prefs.load(storage).quality, quality, quality + " is a saved choice");
    assert(prefs.qualities.indexOf(quality) !== -1);
});
// Artwork storage options: older saved preferences load with the defaults; bad values are refused.
value = JSON.stringify({ quality: "original", language: "en", saveHomeArtwork: true });
assert.strictEqual(prefs.load(storage).artworkLimitMb, 10);
assert.strictEqual(prefs.load(storage).saveLibraryArtwork, false);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", artworkLimitMb: 150, saveLibraryArtwork: true });
assert.strictEqual(prefs.load(storage).artworkLimitMb, 150);
assert.strictEqual(prefs.load(storage).saveLibraryArtwork, true);
[0, 5, 11, "25", null].forEach(function (invalid) {
    assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", artworkLimitMb: invalid }); }, /invalid/);
});
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", saveLibraryArtwork: "on" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", preloadArtwork: "on" }); }, /invalid/);
assert.deepStrictEqual(prefs.artworkLimitChoices(156 * 1024 * 1024, 10), [10, 25, 50, 100, 150]);
assert.deepStrictEqual(prefs.artworkLimitChoices(60 * 1024 * 1024, 10), [10, 25, 50], "Choices above the quota are hidden");
assert.deepStrictEqual(prefs.artworkLimitChoices(60 * 1024 * 1024, 150), [10, 25, 50, 150], "The current value stays even above the quota");
assert.deepStrictEqual(prefs.artworkLimitChoices(null, 10), [10, 25, 50, 100, 150], "An unknown quota offers everything");
assert.deepStrictEqual(prefs.artworkLimitChoices(5 * 1024 * 1024, 10), [10], "The current value stays even when the quota is tiny");
value = JSON.stringify({ quality: "720", language: "en", nextEpisode: "countdown" });
assert.strictEqual(prefs.load(storage).autoAdvanceFeatures, true, "Preferences saved before the featured auto-advance setting load as On");
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "countdown", autoAdvanceFeatures: false });
assert.strictEqual(prefs.load(storage).autoAdvanceFeatures, false, "Auto-advance Off is persisted");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "en", nextEpisode: "countdown", autoAdvanceFeatures: "no" });
}, /invalid/);
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "countdown", ratingSources: ["imdb"] });
assert.deepStrictEqual(prefs.load(storage).ratingSources, ["imdb"], "The chosen rating sources are persisted");
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "countdown", ratingSources: [] });
assert.deepStrictEqual(prefs.load(storage).ratingSources, [], "Every source may be switched off");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "en", nextEpisode: "countdown", ratingSources: ["metacritic"] });
}, /invalid/);
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", theme: "pure_black", accent: "teal" });
assert.strictEqual(prefs.load(storage).theme, "pure_black", "The theme is a saved choice");
assert.strictEqual(prefs.load(storage).accent, "teal", "The accent is a saved choice");
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", theme: "neon" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", accent: "#ff0000" }); }, /invalid/);
console.log("Tizen preference persistence/allowlist/reset tests: passed");
