"use strict";
// TV memory/storage readouts: a fake environment, a desktop browser without tizen, and APIs that fail.
var assert = require("assert");
var Stats = require("../../samsung/Vemm/js/device-stats.js");
var MB = 1024 * 1024;
function say(text, values) {
    return text.replace(/\{(\w+)\}/g, function (match, key) { return values && key in values ? values[key] : match; });
}
function tv(overrides) {
    var env = {
        tizen: { systeminfo: {
            getTotalMemory: function () { return 1869 * MB; },
            getAvailableMemory: function () { return 572 * MB; },
            getPropertyValue: function (name, ok) {
                assert.strictEqual(name, "STORAGE");
                ok({ units: [{ type: "INTERNAL", capacity: 4544 * MB, availableCapacity: 2236 * MB, isRemovable: false }] });
            }
        } },
        performance: { memory: { usedJSHeapSize: 10 * MB } },
        navigator: { webkitTemporaryStorage: { queryUsageAndQuota: function (ok) { ok(3 * MB, 156 * MB); } } }
    };
    Object.keys(overrides || {}).forEach(function (key) { env[key] = overrides[key]; });
    return env;
}
function read(env) { return new Promise(function (resolve) { Stats.read(env, resolve); }); }

(async function () {
    var stats = await read(tv());
    assert.deepStrictEqual(Stats.lines(stats, say), [
        "TV memory: 572 MB free of 1,869 MB", "TV storage: 2.2 GB free of 4.4 GB",
        "Vemm memory: 10 MB", "Vemm storage: 3 MB of 156 MB"]);
    assert.strictEqual(stats.quota, 156 * MB);

    // A desktop browser: no tizen, no performance.memory, no webkitTemporaryStorage.
    stats = await read({ performance: {}, navigator: {} });
    assert.deepStrictEqual(Stats.lines(stats, say), [], "Nothing is shown when nothing is readable");
    assert.strictEqual(stats.quota, null);
    assert.deepStrictEqual(Stats.lines(await read(undefined), say), []);

    // Every API may throw or report an error; a call never throws and the rest still reads.
    var broken = tv();
    broken.tizen.systeminfo.getTotalMemory = function () { throw new Error("denied"); };
    broken.tizen.systeminfo.getPropertyValue = function () { throw new Error("denied"); };
    broken.navigator.webkitTemporaryStorage.queryUsageAndQuota = function (ok, fail) { fail(new Error("denied")); };
    assert.deepStrictEqual(Stats.lines(await read(broken), say), ["Vemm memory: 10 MB"]);

    // Garbage values and a callback that never answers twice.
    var odd = tv({ performance: { memory: { usedJSHeapSize: "lots" } } });
    odd.tizen.systeminfo.getPropertyValue = function (name, ok) { ok({ units: [] }); ok({ units: [] }); };
    var calls = 0;
    await new Promise(function (resolve) { Stats.read(odd, function () { calls += 1; resolve(); }); });
    assert.strictEqual(calls, 1, "done runs once");
    assert.deepStrictEqual(Stats.lines(await read(odd), say), ["TV memory: 572 MB free of 1,869 MB", "Vemm storage: 3 MB of 156 MB"]);

    // A storage API that never answers is given up on.
    var silent = tv();
    silent.tizen.systeminfo.getPropertyValue = function () {};
    assert.deepStrictEqual(Stats.lines(await read(silent), say).length, 3);

    assert.strictEqual(Stats.size(512 * MB), "512 MB");
    assert.strictEqual(Stats.size(1024 * MB), "1 GB");
    console.log("Device stats: passed");
}()).catch(function (error) { console.error(error); process.exitCode = 1; });
