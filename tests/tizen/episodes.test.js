"use strict";
// Which season and episode a show's page rests on without an On Deck answer, and the season tabs' order. Synthetic.
var assert = require("assert");
var episodes = require("../../samsung/Vemm/js/episodes.js");

function numbers(list) { return list.map(function (season) { return season.index; }); }
function season(index, viewed, leaves) { return { index: index, viewedLeafCount: viewed, leafCount: leaves }; }
function episode(index, state) { return Object.assign({ index: index }, state || {}); }
var watched = { viewCount: 1 };

assert.deepStrictEqual(numbers(episodes.seasonOrder([season(0), season(1), season(2), season(10)])), [1, 2, 10, 0], "Specials go last");
assert.deepStrictEqual(numbers(episodes.seasonOrder([season(3), season(0), season(52)])), [3, 52, 0], "Numbers, not text, and gaps are fine");

var order = episodes.seasonOrder([season(0, 0, 4), season(1, 0, 12), season(2, 0, 10)]);
assert.strictEqual(episodes.nextSeason(order).index, 1, "An unwatched show opens its first season, not Specials or its last");
assert.strictEqual(episodes.nextSeason([season(1, 12, 12), season(2, 3, 10), season(3, 0, 8)]).index, 2, "The unfinished season reached");
assert.strictEqual(episodes.nextSeason([season(1, 12, 12), season(2, 0, 10), season(3, 8, 8), season(4, 0, 9)]).index, 4,
    "The season after the furthest watched, past a skipped one");
assert.strictEqual(episodes.nextSeason([season(1, 12, 12), season(2, 10, 10), season(0, 0, 1)]).index, 1,
    "A finished show starts over; an unwatched special does not count");
assert.strictEqual(episodes.nextSeason([season(0, 0, 1)]).index, 0, "A show of Specials alone opens them");
assert.strictEqual(episodes.nextSeason([]), null);

assert.strictEqual(episodes.nextEpisode([episode(1), episode(2), episode(3)]).index, 1,
    "A completely unwatched season suggests its first episode, never its last");
assert.strictEqual(episodes.nextEpisode([episode(1, watched), episode(2, watched), episode(3), episode(4)]).index, 3, "The next after the watched");
assert.strictEqual(episodes.nextEpisode([episode(1, watched), episode(2), episode(3, watched), episode(4)]).index, 4,
    "After the furthest watched, not the first gap");
assert.strictEqual(episodes.nextEpisode([episode(1, watched), episode(2, { viewOffset: 5 }), episode(3, watched), episode(4)]).index, 2,
    "One in progress comes first");
assert.strictEqual(episodes.nextEpisode([episode(1, watched), episode(2, watched)]).index, 1, "A finished season starts over");
assert.strictEqual(episodes.nextEpisode([]), null);

console.log("Tizen show page suggestion tests: passed");
