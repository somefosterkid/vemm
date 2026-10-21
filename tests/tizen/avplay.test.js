"use strict";
var assert = require("assert");
var av = require("../../samsung/Vemm/js/avplay.js");

function fake() {
    var state = "NONE";
    var listener;
    var time = 0;
    var calls = [];
    return {
        calls: calls,
        getState: function () { return state; },
        open: function () { calls.push("open"); state = "IDLE"; },
        close: function () { calls.push("close"); state = "NONE"; },
        stop: function () { calls.push("stop"); state = "IDLE"; },
        setDisplayRect: function (x, y, width, height) { assert.strictEqual(width, 1920); assert.strictEqual(height, 1080); },
        setDisplayMethod: function (method) { assert.strictEqual(method, "PLAYER_DISPLAY_MODE_LETTER_BOX"); },
        setBufferingParam: function (option, unit, amount) { assert.strictEqual(state, "IDLE", "Buffering is only valid in IDLE"); calls.push(["buffer", option, unit, amount].join(":")); },
        setListener: function (value) { listener = value; },
        prepareAsync: function (success) { calls.push("prepareAsync"); state = "READY"; success(); },
        getDuration: function () { return 100000; },
        getCurrentTime: function () { return time; },
        seekTo: function (target, success) { time = Math.floor(target / 1000) * 1000; success(); },
        play: function () { calls.push("play"); state = "PLAYING"; },
        pause: function () { calls.push("pause"); state = "PAUSED"; },
        getTotalTrackInfo: function () { return [{ type: "AUDIO", index: 0 }]; },
        setSelectTrack: function (type, index) { calls.push(type + index); },
        setSilentSubtitle: function () {},
        send: function (type, value) { listener[type](value); }
    };
}

// The adapter calls the native seek after the screen has painted (a timer in Node).
function tick(ms) { return new Promise(function (done) { setTimeout(done, ms || 0); }); }
function blockFor(ms) { var until = Date.now() + ms; while (Date.now() < until) { /* the native call holds the page */ } }

async function run() {
    var native = fake();
    var events = [];
    var adapter = av.create({ avplay: native, onEvent: function (event) { events.push(event); } });
    assert.strictEqual(native.calls.length, 0, "Constructing the adapter must not play");
    await adapter.open("https://synthetic.invalid/stream", 5000);
    assert.strictEqual(adapter.snapshot().state, "playing");
    assert.strictEqual(adapter.snapshot().position, 5000, "The first timeline must use the native resume position");
    adapter.pause();
    assert.strictEqual(adapter.snapshot().state, "paused");
    assert.strictEqual(await adapter.seek(12555), 12000, "Seek must report native landed time, not requested time");
    adapter.play();
    adapter.selectTrack("AUDIO", 0);
    native.send("onsubtitlechange", 1500);
    assert.strictEqual(adapter.tracks().length, 1);
    native.send("oncurrentplaytime", 30000);
    assert.strictEqual(adapter.snapshot().position, 30000);
    native.send("onstreamcompleted");
    assert.strictEqual(adapter.snapshot().state, "ended");
    assert.strictEqual(adapter.snapshot().position, 100000, "Native completion must report the full clip, not the last cached callback");
    adapter.close();
    assert.strictEqual(adapter.snapshot().state, "idle");
    await assert.rejects(adapter.seek(10), /Cannot seek/);
    await assert.rejects(av.create({}).open("https://synthetic.invalid"), /unavailable/);

    native = fake();
    var prepare;
    native.prepareAsync = function (success) { prepare = success; };
    adapter = av.create({ avplay: native });
    var pending = adapter.open("https://synthetic.invalid");
    adapter.close();
    await assert.rejects(pending, /cancelled/);
    prepare();
    assert(!native.calls.includes("play"), "Stale prepare callback must not start playback");

    native = fake();
    native.prepareAsync = function () {};
    adapter = av.create({ avplay: native, prepareTimeout: 5 });
    await assert.rejects(adapter.open("https://synthetic.invalid"), /prepare-timeout/);
    adapter.close();

    native = fake();
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid", 0);
    var completeSeek;
    native.seekTo = function (target, success) { completeSeek = success; };
    var seeking = adapter.seek(50000);
    var seekFailure = assert.rejects(seeking, /cancelled/);
    assert.strictEqual(completeSeek, undefined, "The native seek waits for the new position to be painted");
    await tick();
    adapter.close();
    completeSeek();
    await seekFailure;
    assert.strictEqual(adapter.snapshot().position, 0, "An old seek callback must not change a closed player");

    native = fake();
    adapter = av.create({ avplay: native, seekTimeout: 5 });
    await adapter.open("https://synthetic.invalid", 0);
    native.seekTo = function (target, success) { completeSeek = success; };
    seeking = adapter.seek(50000);
    var timeoutFailure = assert.rejects(seeking, /seek-timeout/);
    await assert.rejects(adapter.seek(10000), /already/);
    await tick();
    await timeoutFailure;
    completeSeek();
    assert.strictEqual(adapter.snapshot().position, 0, "A timed-out seek must not later mutate the playhead");
    adapter.close();
    // Tizen 3.0 (UE55MU6172): reopening a transcode at 6690 s after an audio switch left AVPlay
    // READY forever, because a READY-state seekTo on HLS never called back.
    native = fake();
    var seeks = [];
    native.seekTo = function (target, success) {
        seeks.push(native.getState());
        if (native.getState() === "PLAYING") { success(); }
    };
    adapter = av.create({ avplay: native, resumeSeekTimeout: 5 });
    await adapter.open("https://synthetic.invalid/stream", 6690000);
    assert.strictEqual(adapter.snapshot().state, "playing", "A silent READY seek must not strand the player in READY");
    assert.deepStrictEqual(seeks, ["READY", "PLAYING"], "The resume seek must be retried once playback has started");
    assert.strictEqual(native.getState(), "PLAYING");
    adapter.close();

    native = fake();
    native.seekTo = function () {};
    events = [];
    adapter = av.create({ avplay: native, resumeSeekTimeout: 5, onEvent: function (event) { events.push(event); } });
    await adapter.open("https://synthetic.invalid/stream", 6690000);
    assert.strictEqual(adapter.snapshot().state, "playing", "A resume that never lands still plays rather than hanging");
    await new Promise(function (done) { setTimeout(done, 30); });
    assert(events.some(function (event) { return event.type === "resume-failed"; }), "A lost resume position must be reported");
    adapter.close();
    // On direct play a 2018 TV held the page inside seekTo for up to ten seconds, then the seek
    // landed; a timeout armed before the call fired as soon as the page was free again.
    native = fake();
    adapter = av.create({ avplay: native, seekTimeout: 20 });
    await adapter.open("https://synthetic.invalid", 0);
    native.seekTo = function (target, success) { blockFor(40); setTimeout(success, 5); };
    assert.strictEqual(await adapter.seek(50000), 0, "A seek that held the page and then landed is not a timeout");
    adapter.close();
    native = fake();
    var readySeekDone = null;
    native.seekTo = function (target, success) { blockFor(40); readySeekDone = success; setTimeout(success, 5); };
    events = [];
    adapter = av.create({ avplay: native, resumeSeekTimeout: 20, onEvent: function (event) { events.push(event); } });
    await adapter.open("https://synthetic.invalid/stream", 6690000);
    await tick(30);
    assert(readySeekDone && !events.some(function (event) { return event.type === "resume-failed"; }),
        "A resume seek that held the page and then landed is not lost");
    adapter.close();

    native = fake();
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid/stream", 0, false, { play: 1, resume: 3 });
    assert.deepStrictEqual(native.calls.slice(0, 4), ["open", "buffer:PLAYER_BUFFER_FOR_PLAY:PLAYER_BUFFER_SIZE_IN_SECOND:1",
        "buffer:PLAYER_BUFFER_FOR_RESUME:PLAYER_BUFFER_SIZE_IN_SECOND:3", "prepareAsync"],
        "Both buffers are set after open and before prepare, including values under 4 s");
    adapter.close();

    // Under a second the seconds unit cannot say it, so the play buffer goes in bytes.
    native = fake();
    adapter = av.create({ avplay: native });
    var tiny = { play: 0.5, resume: 1, playBytes: 506813 };
    await adapter.open("https://synthetic.invalid/stream", 0, false, tiny);
    assert.deepStrictEqual(native.calls.slice(1, 3), ["buffer:PLAYER_BUFFER_FOR_PLAY:PLAYER_BUFFER_SIZE_IN_BYTE:506813",
        "buffer:PLAYER_BUFFER_FOR_RESUME:PLAYER_BUFFER_SIZE_IN_SECOND:1"]);
    assert.strictEqual(tiny.fallback, undefined, "An accepted value needs no fallback");
    adapter.close();
    // A refused value would leave the TV's own, much larger buffer: 1 s instead.
    [{ play: 0.5, resume: 1, playBytes: 506813 }, { play: 0.5, resume: 3, playBytes: 0 }, { play: 15, resume: 15 }].forEach(function (refused) {
        native = fake();
        var accept = native.setBufferingParam;
        native.setBufferingParam = function (option, unit, amount) {
            if (option === "PLAYER_BUFFER_FOR_PLAY" && amount !== 1) { throw new Error("rejected"); }
            accept(option, unit, amount);
        };
        adapter = av.create({ avplay: native });
        adapter.open("https://synthetic.invalid/stream", 0, false, refused);
        assert(native.calls.indexOf("buffer:PLAYER_BUFFER_FOR_PLAY:PLAYER_BUFFER_SIZE_IN_SECOND:1") !== -1,
            "A refused " + refused.play + " s play buffer falls back to 1 s");
        assert.strictEqual(refused.fallback, true, "and records that for the stats");
        adapter.close();
    });

    for (var skipped of [null, undefined, {}, { play: 0, resume: "8" }]) {
        native = fake();
        adapter = av.create({ avplay: native });
        await adapter.open("https://synthetic.invalid/stream", 0, false, skipped);
        assert(!native.calls.some(function (call) { return /^buffer/.test(call); }), "No buffer call for " + JSON.stringify(skipped));
        adapter.close();
    }

    native = fake();
    native.setBufferingParam = function () { throw new Error("unsupported"); };
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid/stream", 0, false, { play: 15, resume: 15 });
    assert.strictEqual(adapter.snapshot().state, "playing", "An unsupported buffering API must not break playback");
    adapter.close();
    // A resume prepares at the offset (PREBUFFER_MODE, set in IDLE before prepare); a background start holds in READY.
    native = fake();
    native.setStreamingProperty = function (name, value) {
        assert.strictEqual(native.getState(), "IDLE", "The mode is set before prepare");
        native.calls.push(name + "=" + value);
    };
    native.getDuration = function () { return native.getState() === "PLAYING" ? 100000 : 0; };
    native.seekTo = function (target, success) { success(); };
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid/stream", 45000, false, null, { prebuffer: true, hold: true });
    assert.deepStrictEqual(native.calls.slice(0, 3), ["open", "PREBUFFER_MODE=45000", "prepareAsync"]);
    assert(!native.calls.includes("play"), "A held start does not play");
    assert.deepStrictEqual(adapter.snapshot(), { state: "ready", position: 45000, duration: 0 },
        "It reports the resume point, not the 0 AVPlay reports before playing");
    adapter.play();
    assert.strictEqual(adapter.snapshot().state, "playing", "play() starts the held stream");
    native.send("oncurrentplaytime", 45500);
    assert.strictEqual(adapter.snapshot().duration, 100000, "The duration is read once AVPlay has one");
    adapter.close();
    native = fake();
    native.setStreamingProperty = function () { throw new Error("unsupported"); };
    adapter = av.create({ avplay: native });
    await assert.rejects(adapter.open("https://synthetic.invalid/stream", 45000, false, null, { prebuffer: true }),
        function (error) { return error.code === "avplay-prebuffer"; }, "A refused mode fails the open with its own code");
    assert(!native.calls.includes("prepareAsync"));
    adapter.close();
    assert.strictEqual(native.getState(), "NONE", "and the player still closes");
    native = fake();
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid/stream", 0, false, null, { prebuffer: true });
    assert.strictEqual(adapter.snapshot().state, "playing", "A start from the beginning sets no mode");
    adapter.close();
    native = fake();
    native.setStreamingProperty = function () {};
    native.seekTo = function (target, success) { success(); };
    adapter = av.create({ avplay: native });
    var settled = false;
    var reopening = adapter.open("https://synthetic.invalid/stream", 90000, false, null, { prebuffer: true, moving: true })
        .then(function () { settled = true; });
    await tick();
    assert(native.calls.includes("play") && !settled, "A reopen standing in for a seek plays, but settles only when the picture moves");
    native.send("oncurrentplaytime", 90500);
    await reopening;
    assert.strictEqual(adapter.snapshot().position, 90500);
    adapter.close();
    native = fake();
    native.setStreamingProperty = function () {};
    native.seekTo = function (target, success, failure) { failure(); };
    adapter = av.create({ avplay: native });
    await assert.rejects(adapter.open("https://synthetic.invalid/stream", 45000, false, null, { prebuffer: true, hold: true }), /resume/,
        "A held start whose resume seek fails cannot retry while playing, so it fails");
    assert(!native.calls.includes("play"));
    adapter.close();

    // A 2018 TV starts its clock 30-250 ms after play(), throws on a pause before that, and sends its first time
    // event only 0.5 s into playback.
    function clocked() {
        var native = fake();
        var playedAt = 0;
        var play = native.play;
        var pause = native.pause;
        native.play = function () { play(); playedAt = Date.now(); };
        native.getCurrentTime = function () { return playedAt && Date.now() - playedAt >= 30 ? 45000 + Date.now() - playedAt - 30 : 0; };
        native.pause = function () {
            if (Date.now() - playedAt < 30) { native.calls.push("refused pause"); throw new Error("PLAYER_ERROR_INVALID_STATE"); }
            pause();
            playedAt = 0;
        };
        native.setStreamingProperty = function () {};
        native.seekTo = function (target, success) { success(); };
        return native;
    }
    native = clocked();
    events = [];
    adapter = av.create({ avplay: native, onEvent: function (event) { events.push(event); } });
    var startedAt = Date.now();
    await adapter.open("https://synthetic.invalid/stream", 45000, true, null, { prebuffer: true });
    assert.deepStrictEqual(native.calls.filter(function (call) { return /play|pause/.test(call); }), ["play", "pause"],
        "A paused start plays and pauses only once the clock runs, never right after play()");
    assert.strictEqual(adapter.snapshot().state, "paused", "and settles paused");
    assert(adapter.snapshot().position > 45000, "at the first frame");
    assert(Date.now() - startedAt < 400, "well before AVPlay's first time event");
    adapter.close();

    native = clocked();
    events = [];
    adapter = av.create({ avplay: native, onEvent: function (event) { events.push(event); } });
    await adapter.open("https://synthetic.invalid/stream", 0);
    assert(!events.some(function (event) { return event.type === "time"; }), "Nothing moves at play()");
    await tick(200);
    var first = events.filter(function (event) { return event.type === "time"; });
    assert.strictEqual(first.length, 1, "The clock's first rise is reported once, as a time event");
    assert(first[0].position > 45000);
    adapter.pause();
    await tick(100);
    assert.strictEqual(events.filter(function (event) { return event.type === "time"; }).length, 1, "and the clock is read no longer");
    adapter.close();

    native = clocked();
    native.pause = function () { native.calls.push("refused pause"); throw new Error("PLAYER_ERROR_INVALID_STATE"); };
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid/stream", 45000, true, null, { prebuffer: true });
    assert.strictEqual(adapter.snapshot().state, "playing", "A pause the TV still refuses leaves the stream playing, not failed");
    adapter.close();
    console.log("Tizen AVPlay state/cancellation/seek tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
