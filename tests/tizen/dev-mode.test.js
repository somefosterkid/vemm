"use strict";
// Developer mode, its unlock code and the bounded, redacted error log. Everything here is synthetic.
var assert = require("assert");
var dev = require("../../samsung/Vemm/js/dev-mode.js");
var rows = require("../../samsung/Vemm/js/home-rows.js");

function memoryStorage() {
    var data = {};
    return { getItem: function (key) { return key in data ? data[key] : null; },
        setItem: function (key, value) { data[key] = String(value); }, removeItem: function (key) { delete data[key]; } };
}

var storage = memoryStorage();
assert.strictEqual(dev.enabled(storage), false, "Developer mode is off by default");
dev.record(storage, "ignored while off", 1);
assert.deepStrictEqual(dev.list(storage), [], "Nothing is logged while off");
dev.setEnabled(storage, true);
assert.strictEqual(dev.enabled(storage), true);

var buffer = "";
"9992580".split("").forEach(function (digit) { buffer = dev.typed(buffer, 48 + Number(digit)); });
assert(dev.matches(buffer), "The code is the last four digits typed");
assert.strictEqual(dev.typed("12", 37), "12", "Other keys are ignored");
assert.strictEqual(dev.typed("", 98), "2", "Keypad digits count");

dev.record(storage, "first", 1000);
dev.record(storage, new Array(1000).join("x"), 2000);
assert.strictEqual(dev.list(storage)[1].message.length, 300, "Messages are capped");
for (var i = 0; i < 80; i += 1) { dev.record(storage, "entry " + i, 3000 + i); }
var list = dev.list(storage);
assert.strictEqual(list.length, 50, "Only the newest 50 are kept");
assert.strictEqual(list[49].message, "entry 79");
assert.strictEqual(list[0].message, "entry 30");
dev.clear(storage);
assert.deepStrictEqual(dev.list(storage), []);

[
    ["GET https://s.invalid/library?X-Plex-Token=abc123&x=1 failed", "abc123"],
    ["request failed: {\"token\":\"abc123\"}", "abc123"],
    ["Authorization: Bearer abc123.def", "abc123"],
    ["header x-plex-token: abc123", "abc123"],
    ["https://plex.tv/api?authToken=abc123", "abc123"],
    ["password=abc123", "abc123"]
].forEach(function (pair) {
    assert.strictEqual(dev.redact(pair[0]).indexOf(pair[1]), -1, "Redacted: " + pair[0]);
    assert(dev.redact(pair[0]).indexOf("[redacted]") !== -1);
});
assert.strictEqual(dev.redact("Playback failed. Stop and retry."), "Playback failed. Stop and retry.");

var broken = { getItem: function () { throw new Error("blocked"); }, setItem: function () { throw new Error("full"); }, removeItem: function () { throw new Error("blocked"); } };
assert.strictEqual(dev.enabled(broken), false);
dev.setEnabled(broken, true);
dev.clear(broken);
assert.deepStrictEqual(dev.list(broken), []);

// Home rows: unseen shelves show, after the placed ones; a hidden shelf is dropped.
var hubs = ["a", "b", "c", "d"].map(function (id) { return { hubIdentifier: id, title: id.toUpperCase() }; });
assert.deepStrictEqual(rows.visible(hubs, { order: [], hidden: [] }).map(rows.idOf), ["a", "b", "c", "d"]);
var choice = { order: ["c", "a"], hidden: ["a"] };
assert.deepStrictEqual(rows.arrange(hubs, choice).map(function (row) { return row.id + (row.shown ? "" : "-"); }), ["c", "a-", "b", "d"]);
assert.deepStrictEqual(rows.visible(hubs, choice).map(rows.idOf), ["c", "b", "d"]);
assert.strictEqual(rows.idOf({ title: "No Identifier" }), "No Identifier", "A title identifies a shelf without an identifier");
var arranged = rows.arrange(hubs, choice);
arranged.reverse();
var next = rows.choose(arranged, { order: ["gone", "c"], hidden: ["gone"] });
assert.deepStrictEqual(next.order, ["d", "b", "a", "c", "gone"], "Shelves not shown today keep their saved place");
assert.deepStrictEqual(next.hidden, ["a", "gone"]);
var rowStore = memoryStorage();
var rowKey = rows.key("profile-1", "server-1");
assert.notStrictEqual(rowKey, rows.key("profile-2", "server-1"), "Choices are per profile");
assert.notStrictEqual(rowKey, rows.key("profile-1", "server-2"), "Choices are per server");
assert(rows.save(rowStore, rowKey, next));
assert.deepStrictEqual(rows.load(rowStore, rowKey), next);
rowStore.setItem(rowKey, "{broken");
assert.deepStrictEqual(rows.load(rowStore, rowKey), { order: [], hidden: [] }, "A damaged choice shows everything");
console.log("Tizen developer mode, error log and Home rows tests: passed");
