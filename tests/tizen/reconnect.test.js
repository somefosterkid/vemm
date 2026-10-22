"use strict";
// Waiting for the server after a network drop: backoff, success, the limit and cancelling. Synthetic only.
var assert = require("assert");
var VemmReconnect = require("../../samsung/Vemm/js/reconnect.js");

function settle() { return new Promise(function (done) { setTimeout(done, 0); }); }

function fixture(answers, extra) {
    var clock = { now: 0, timers: [] };
    var seen = { probes: 0, waits: [], up: 0, gaveUp: 0 };
    var options = {
        probe: function () {
            var answer = answers[Math.min(seen.probes, answers.length - 1)];
            seen.probes += 1;
            return answer ? Promise.resolve() : Promise.reject(new Error("down"));
        },
        onWait: function (tries) { seen.waits.push(tries); },
        onUp: function () { seen.up += 1; },
        onGiveUp: function () { seen.gaveUp += 1; },
        now: function () { return clock.now; },
        setTimeout: function (run, ms) { clock.timers.push({ run: run, ms: ms }); return clock.timers.length; },
        clearTimeout: function (id) { if (clock.timers[id - 1]) { clock.timers[id - 1].run = null; } }
    };
    Object.keys(extra || {}).forEach(function (key) { options[key] = extra[key]; });
    // Runs the next pending timer, moving the clock by its delay.
    function tick() {
        var next = clock.timers.filter(function (timer) { return timer.run; })[0];
        if (!next) { return null; }
        var run = next.run;
        next.run = null;
        clock.now += next.ms;
        run();
        return next.ms;
    }
    return { reconnect: VemmReconnect.create(options), seen: seen, clock: clock, tick: tick };
}

async function run() {
    // Back after the third try: pauses of 1 s, then 2 s, and the viewer is told once it is up.
    var a = fixture([false, false, true]);
    a.reconnect.start();
    await settle();
    assert.strictEqual(a.seen.probes, 1, "The first probe runs at once");
    assert.deepStrictEqual(a.seen.waits, [1], "A failed probe reports a wait");
    assert.strictEqual(a.tick(), 1000);
    await settle();
    assert.strictEqual(a.tick(), 2000, "The pause grows");
    await settle();
    assert.strictEqual(a.seen.up, 1, "A probe that answers ends the wait");
    assert.strictEqual(a.seen.gaveUp, 0);
    assert.strictEqual(a.reconnect.running(), false);
    assert.strictEqual(a.tick(), null, "Nothing is scheduled after success");

    // The pause stops growing at 8 s, and the limit ends a server that never answers.
    var b = fixture([false], { limit: 30000 });
    b.reconnect.start();
    await settle();
    var pauses = [];
    for (var i = 0; i < 8 && !b.seen.gaveUp; i += 1) {
        var ms = b.tick();
        if (ms !== null) { pauses.push(ms); }
        await settle();
    }
    assert.deepStrictEqual(pauses.slice(0, 5), [1000, 2000, 4000, 8000, 8000], "Backoff 1, 2, 4, then 8 s");
    assert.strictEqual(b.seen.gaveUp, 1, "It gives up once the limit has passed");
    assert.strictEqual(b.seen.up, 0);
    assert.ok(b.clock.now >= 30000 && b.clock.now < 40000, "after about the limit, got " + b.clock.now);
    assert.strictEqual(b.reconnect.running(), false);

    // Cancelling stops the timer, and a probe that answers afterwards is ignored.
    var c = fixture([false, true]);
    c.reconnect.start();
    await settle();
    c.reconnect.cancel();
    assert.strictEqual(c.tick(), null, "Cancel clears the pending try");
    var d = fixture([true]);
    d.reconnect.start();
    d.reconnect.cancel();
    await settle();
    assert.strictEqual(d.seen.up, 0, "A cancelled wait never reports");

    // A probe that throws is a failed probe; start() while running does nothing; it can run again afterwards.
    var e = fixture([false, true], { probe: function () { throw new Error("sync"); } });
    e.reconnect.start();
    e.reconnect.start();
    await settle();
    assert.strictEqual(e.seen.waits.length, 1);
    e.reconnect.cancel();
    var f = fixture([true]);
    f.reconnect.start();
    await settle();
    f.reconnect.start();
    await settle();
    assert.strictEqual(f.seen.up, 2, "A finished wait can start again");

    // A first pause holds the first probe back.
    var h = fixture([true]);
    h.reconnect.start(3000);
    await settle();
    assert.strictEqual(h.seen.probes, 0, "Nothing is asked during the pause");
    assert.strictEqual(h.tick(), 3000);
    await settle();
    assert.strictEqual(h.seen.up, 1);

    // A probe that never answers (a dead link) fails after 5 s, then the pauses go on as usual.
    var g = fixture([true], { probe: function () { return new Promise(function () {}); } });
    g.reconnect.start();
    await settle();
    assert.deepStrictEqual(g.seen.waits, [], "A probe still waiting is not yet a failure");
    assert.strictEqual(g.tick(), 5000, "until its 5 s are up");
    await settle();
    assert.deepStrictEqual(g.seen.waits, [1]);
    assert.strictEqual(g.tick(), 1000);
    g.reconnect.cancel();
    assert.strictEqual(g.tick(), null, "Cancelling also drops the wait on a probe");
    var late = fixture([true], { probe: function () { return new Promise(function (resolve) { late.answer = resolve; }); } });
    late.reconnect.start();
    await settle();
    late.tick();
    await settle();
    late.answer();
    await settle();
    assert.strictEqual(late.seen.up, 0, "An answer that comes after its time is ignored");
    console.log("reconnect tests passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
