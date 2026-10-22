"use strict";
// Seek preview frames: BIF parsing and the one-strip-per-playback show/hide lifecycle. Synthetic data only.
var assert = require("assert");
var jsdom = require("jsdom");
var VemmPreviewThumbs = require("../../samsung/Vemm/js/preview-thumbs.js");

var bif = require("./fixtures/bif.js");
function settle() { return new Promise(function (done) { setTimeout(done, 0); }); }

// The client asks /library/parts/{id}/indexes/sd with the token; 404 is "no index", a failure is an error.
async function indexRequest(sample) {
    var vm = require("vm");
    var fs = require("fs");
    var window = new jsdom.JSDOM("").window;
    var context = { module: { exports: {} }, Promise: Promise, TextDecoder: TextDecoder, Blob: window.Blob,
        FileReader: window.FileReader, setTimeout: setTimeout, clearTimeout: clearTimeout };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/plex-api"), "utf8"), context);
    var seen = [];
    function client(status) {
        return context.module.exports.createClient({ baseUrl: "https://server.synthetic.invalid", token: "synthetic-token",
            fetch: function (url, options) {
                seen.push({ url: url, token: options.headers["X-Plex-Token"] });
                var sent = false;
                return Promise.resolve({ ok: status === 200, status: status, headers: { get: function () { return null; } },
                    body: { getReader: function () { return {
                        read: function () {
                            if (sent) { return Promise.resolve({ done: true }); }
                            sent = true;
                            return Promise.resolve({ done: false, value: new Uint8Array(sample) });
                        }, cancel: function () { return Promise.resolve(); } }; } } });
            } });
    }
    var bytes = await client(200).previewIndex("42");
    assert.strictEqual(bytes.byteLength, sample.byteLength);
    assert.strictEqual(seen[0].url, "https://server.synthetic.invalid/library/parts/42/indexes/sd");
    assert.strictEqual(seen[0].token, "synthetic-token");
    assert.strictEqual(await client(404).previewIndex("42"), null);
    await assert.rejects(client(500).previewIndex("42"), /preview index/);
    assert.throws(function () { client(200).previewIndex("../x"); }, /invalid media identifier/);
}

async function run() {
    var sample = bif([[0, 5], [10, 7], [20, 3]], 1000);
    var index = VemmPreviewThumbs.parse(sample);
    assert.deepStrictEqual(index.times, [0, 10000, 20000]);
    assert.deepStrictEqual(index.offsets, [96, 101, 108, 111]);
    assert.deepStrictEqual(VemmPreviewThumbs.parse(bif([[0, 1], [5, 1]], 0)).times, [0, 5000], "unit 0 means seconds");
    assert.strictEqual(VemmPreviewThumbs.frameAt(index, -1), -1);
    assert.strictEqual(VemmPreviewThumbs.frameAt(index, 0), 0);
    assert.strictEqual(VemmPreviewThumbs.frameAt(index, 9999), 0);
    assert.strictEqual(VemmPreviewThumbs.frameAt(index, 10000), 1);
    assert.strictEqual(VemmPreviewThumbs.frameAt(index, 999999), 2);
    assert.strictEqual(VemmPreviewThumbs.parse(new ArrayBuffer(10)), null);
    assert.strictEqual(VemmPreviewThumbs.parse(new ArrayBuffer(200)), null, "no magic");
    var cut = sample.slice(0, 100);
    assert.strictEqual(VemmPreviewThumbs.parse(cut), null, "an index cut short is refused");
    var broken = bif([[0, 5], [10, 7]], 1000);
    new DataView(broken).setUint32(64 + 4, 99999, true);
    assert.strictEqual(VemmPreviewThumbs.parse(broken), null, "an offset past the end is refused");

    var dom = new jsdom.JSDOM("<div id=bar></div>");
    var document = dom.window.document;
    var bar = document.getElementById("bar");
    var urls = [];
    var revoked = [];
    global.URL = { createObjectURL: function (blob) { urls.push(blob); return "blob:synthetic/" + urls.length; },
        revokeObjectURL: function (url) { revoked.push(url); } };
    global.Blob = dom.window.Blob;
    var loads = 0;
    var thumbs = VemmPreviewThumbs.create({ load: function () { loads += 1; return Promise.resolve(sample); } });
    thumbs.show(12000, 0.5, bar);
    assert.strictEqual(bar.querySelector(".preview-thumb"), null, "nothing shows until the index has arrived");
    await settle();
    var node = bar.querySelector(".preview-thumb");
    assert(node, "the pending request is drawn once the index arrives");
    assert.strictEqual(node.querySelector("img").src, "blob:synthetic/1");
    assert.strictEqual(urls[0].size, 7, "the frame at 10 s is the second JPEG");
    assert.strictEqual(node.style.left, "50%");
    thumbs.show(14000, 0.6, bar);
    assert.strictEqual(urls.length, 1, "the same frame is not rebuilt");
    assert.strictEqual(node.style.left, "60%");
    thumbs.show(25000, 0.9, bar);
    assert.deepStrictEqual(revoked, ["blob:synthetic/1"], "the previous frame is released");
    assert.strictEqual(node.querySelector("img").src, "blob:synthetic/2");
    thumbs.hide();
    assert.strictEqual(node.hidden, true);
    assert.deepStrictEqual(revoked, ["blob:synthetic/1", "blob:synthetic/2"], "hiding releases the frame");
    thumbs.show(0, 0, bar);
    assert.strictEqual(node.hidden, false);
    assert.strictEqual(loads, 1, "one download per playback");
    thumbs.close();
    assert.strictEqual(bar.querySelector(".preview-thumb"), null, "closing removes the strip");
    thumbs.show(0, 0, bar);
    assert.strictEqual(bar.querySelector(".preview-thumb"), null, "and a closed strip stays closed");

    // No index (null), a failure, or garbage: quietly nothing.
    for (var failing of [function () { return Promise.resolve(null); }, function () { return Promise.reject(new Error("x")); },
        function () { return Promise.resolve(new ArrayBuffer(300)); }]) {
        var none = VemmPreviewThumbs.create({ load: failing });
        none.show(1000, 0.1, bar);
        await settle();
        assert.strictEqual(bar.querySelector(".preview-thumb"), null);
        none.close();
    }
    await indexRequest(sample);
    console.log("Tizen seek preview thumbnails: passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
