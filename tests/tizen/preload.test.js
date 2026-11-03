"use strict";
// The background start behind a focused Play control: timing, hand-over and discarding. Synthetic only.
var assert = require("assert");
var VemmPreload = require("../../samsung/Vemm/js/preload.js");

function clock() {
    var timers = [];
    return {
        setTimeout: function (run, ms) { timers.push({ run: run, ms: ms }); return timers.length; },
        clearTimeout: function (id) { if (timers[id - 1]) { timers[id - 1].run = null; } },
        // Runs the pending timers of one delay, as the clock would.
        pass: function (ms) {
            timers.filter(function (timer) { return timer.ms === ms && timer.run; }).forEach(function (timer) {
                var run = timer.run;
                timer.run = null;
                run();
            });
        },
        pending: function (ms) { return timers.filter(function (timer) { return timer.ms === ms && timer.run; }).length; }
    };
}
function settle() { return new Promise(function (done) { setTimeout(done, 0); }); }
function prepared(key, ready) {
    var started = { key: key, ready: ready || Promise.resolve(), discarded: 0 };
    started.discard = function () { started.discarded += 1; };
    return started;
}

async function run() {
    var time = clock();
    var preload = VemmPreload.create({ setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, delay: 600, lifetime: 120000 });
    var starts = 0;
    var current = null;
    function start() { starts += 1; current = prepared("item:45000"); return current; }

    preload.arm(start);
    assert.strictEqual(starts, 0, "Nothing starts until the control has kept focus for the delay");
    assert.strictEqual(preload.take("item:45000"), null, "A press before the delay gets nothing");
    time.pass(600);
    await settle();
    assert.strictEqual(starts, 0, "and that press cancelled the wait");

    preload.arm(start);
    time.pass(600);
    await settle();
    assert.strictEqual(starts, 1);
    assert.strictEqual(preload.take("item:0"), null, "A different start point is not handed over");
    assert.strictEqual(current.discarded, 1, "and the prepared one is discarded");

    preload.arm(start);
    time.pass(600);
    await settle();
    var mine = current;
    assert.strictEqual(preload.take("item:45000"), mine, "The matching start is handed over");
    assert.strictEqual(mine.discarded, 0, "and not discarded");
    preload.cancel();
    assert.strictEqual(mine.discarded, 0, "Once handed over it is no longer the preload's to discard");
    assert.strictEqual(time.pending(120000), 0, "nor to expire");

    preload.arm(start);
    time.pass(600);
    await settle();
    var forgotten = current;
    time.pass(120000);
    assert.strictEqual(forgotten.discarded, 1, "A start nobody takes is discarded after its lifetime");
    assert.strictEqual(preload.take("item:45000"), null);

    preload.arm(start);
    time.pass(600);
    await settle();
    var replaced = current;
    preload.arm(start);
    assert.strictEqual(replaced.discarded, 1, "Focusing another Play control discards the previous start");
    preload.cancel();
    assert.strictEqual(time.pending(600), 0, "Cancel also stops a wait");

    var failing;
    preload.arm(function () { failing = prepared("item:45000", Promise.reject(new Error("prepare failed"))); return failing; });
    time.pass(600);
    await settle();
    assert.strictEqual(failing.discarded, 1, "A start that fails to prepare is discarded");
    assert.strictEqual(preload.take("item:45000"), null, "and never handed over");

    var resolveLate;
    var late = prepared("item:45000");
    preload.arm(function () { return new Promise(function (resolve) { resolveLate = resolve; }); });
    time.pass(600);
    await settle();
    preload.cancel();
    resolveLate(late);
    await settle();
    assert.strictEqual(late.discarded, 1, "A start that resolves after it was cancelled is discarded at once");

    preload.arm(function () { return null; });
    time.pass(600);
    await settle();
    assert.strictEqual(time.pending(120000), 0, "A control with nothing to prepare leaves nothing behind");

    var loading;
    preload.arm(function () { return new Promise(function (resolve) { loading = resolve; }); });
    time.pass(600);
    await settle();
    assert.strictEqual(preload.take("item:45000"), null, "A start still loading its metadata is not handed over");
    var stale = prepared("item:45000");
    loading(stale);
    await settle();
    assert.strictEqual(stale.discarded, 1, "and is discarded when it arrives");

    var slow = new Promise(function () {});
    preload.arm(function () { current = prepared("item:45000", slow); return current; });
    time.pass(600);
    await settle();
    assert.strictEqual(preload.take("item:45000"), current, "A start still preparing is handed over; Play waits for it");

    // A details page holds one start: at once, whatever has focus afterwards, for as long as the page stays.
    var held = 0;
    function holdStart() { held += 1; current = prepared("item:45000"); return current; }
    preload.hold(holdStart);
    assert.strictEqual(time.pending(600), 0, "A held start waits for nothing");
    assert.strictEqual(time.pending(120000), 0, "and has no lifetime");
    await settle();
    assert.strictEqual(held, 1, "It begins at once");
    var first = current;
    preload.hold(holdStart);
    await settle();
    assert.strictEqual(held, 1, "Focusing the suggested item again changes nothing");
    assert.strictEqual(first.discarded, 0);
    time.pass(120000);
    await settle();
    assert.strictEqual(first.discarded, 0, "Time alone never discards it");
    assert.strictEqual(preload.take("item:0"), null, "Pressing something else gets nothing");
    assert.strictEqual(first.discarded, 1, "and discards it");
    preload.hold(holdStart);
    await settle();
    var second = current;
    assert.strictEqual(preload.take("item:45000"), second, "Pressing the suggested item uses it");
    assert.strictEqual(second.discarded, 0);
    preload.hold(holdStart);
    await settle();
    var third = current;
    preload.cancel();
    assert.strictEqual(third.discarded, 1, "Leaving the page discards it");
    var failing2 = prepared("item:45000", Promise.reject(new Error("dropped")));
    failing2.ready.catch(function () {});
    preload.hold(function () { return failing2; });
    await settle();
    assert.strictEqual(failing2.discarded, 1, "A failed hold is discarded");
    held = 0;
    preload.hold(holdStart);
    await settle();
    assert.strictEqual(held, 1, "and focusing the item again prepares it again");
    preload.cancel();
    preload.arm(start);
    assert.strictEqual(time.pending(600), 1, "A Home card still waits 0.6 s");
    preload.hold(holdStart);
    assert.strictEqual(time.pending(600), 0, "and a hold replaces what was armed");
    preload.cancel();

    console.log("Tizen background playback start (preload) tests: passed");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
