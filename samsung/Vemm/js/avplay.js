(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmAvplay = api; }
}(this, function () {
    "use strict";

    function create(options) {
        options = options || {};
        var avplay = options.avplay;
        var emit = options.onEvent || function () {};
        var generation = 0;
        var state = "idle";
        var position = 0;
        var duration = 0;
        var pending = null;
        var pendingSeek = null;
        var timer = null;
        var listener = null;
        var clock = null;

        function notify(type, detail) { emit({ type: type, state: state, position: position, duration: duration, detail: detail }); }
        function transition(next) { state = next; notify("state"); }
        function error(operation) {
            var failure = new Error("Samsung playback failed during " + operation + ". Stop and retry this title.");
            failure.code = "avplay-" + operation;
            return failure;
        }
        function requireState(allowed, operation) {
            if (!avplay) { throw new Error("Samsung AVPlay is not available in this runtime."); }
            if (allowed.indexOf(state) === -1) { throw new Error("Cannot " + operation + " while playback is " + state + "."); }
        }
        function cancelPending() {
            if (timer !== null) { clearTimeout(timer); timer = null; }
            if (pending) { var reject = pending; pending = null; reject(new Error("Playback preparation was cancelled.")); }
        }
        function close() {
            generation += 1;
            stopClock();
            cancelPending();
            if (pendingSeek) { pendingSeek(new Error("Seek cancelled.")); }
            if (avplay && state !== "idle") {
                try {
                    var nativeState = avplay.getState();
                    if (nativeState === "PLAYING" || nativeState === "PAUSED") { avplay.stop(); }
                    avplay.close();
                } catch (failure) {
                    transition("error");
                    throw error("close");
                }
            }
            position = 0;
            duration = 0;
            transition("idle");
        }
        // AVPlay accepts buffering parameters only in IDLE: after open and before prepare. buffer is
        // { play, resume } in seconds, with playBytes for a play value under a second (see
        // VemmPlayback.buffering); without one the TV decides. A refused value would leave the TV's own,
        // much larger default, so the play buffer falls back to 1 s; buffer.fallback records that.
        function setBuffering(buffer) {
            if (!buffer) { return; }
            function set(option, unit, amount) {
                if (typeof amount !== "number" || !(amount > 0)) { return false; }
                try { avplay.setBufferingParam(option, unit, amount); return true; } catch (failure) { return false; }
            }
            var play = buffer.play < 1 ? set("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_BYTE", buffer.playBytes) :
                set("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", buffer.play);
            if (!play && buffer.play > 0 && buffer.play !== 1) { buffer.fallback = set("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 1); }
            set("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", buffer.resume);
        }
        function stopClock() {
            if (clock !== null) { clearInterval(clock); clock = null; }
        }
        // AVPlay's first time event comes about 0.5 s after its clock starts (2018 TV: the clock ran 33 ms after
        // play() on a direct MP4 and 250 ms after it on a conversion), and a pause before the clock runs throws.
        // So after play() the clock is read every 40 ms; its first rise is reported as that first time event.
        function watchClock() {
            stopClock();
            var ownGeneration = generation;
            var last = 0;
            var reads = 0;
            clock = setInterval(function () {
                reads += 1;
                if (ownGeneration !== generation || state !== "playing" || reads > 75) { stopClock(); return; }
                var now = 0;
                try { now = Number(avplay.getCurrentTime()) || 0; } catch (failure) { stopClock(); return; }
                if (last > 0 && now > last) { listener.oncurrentplaytime(now); return; }
                last = now;
            }, 40);
        }
        // Runs after the screen has painted. On direct play the native seek holds the page for up to
        // ten seconds on a 2018 TV, so the new position and the spinner must be on screen first.
        function afterPaint(run) {
            if (typeof requestAnimationFrame !== "function") { setTimeout(run, 0); return; }
            var done = false;
            function once() { if (!done) { done = true; run(); } }
            requestAnimationFrame(function () { setTimeout(once, 0); });
            setTimeout(once, 100);
        }
        // mode.prebuffer prepares AVPlay at the offset (PREBUFFER_MODE) instead of at the start, so it never
        // fetches the opening; a TV that refuses it fails the open with code "avplay-prebuffer" (the caller
        // asks again without). The READY seek stays: it lands the resume where the TV ignores the mode.
        // mode.hold stops in READY without playing (a background start); play() then starts it.
        // mode.moving settles only once the picture moves (at most 3 s after play), for a reopen that stands in
        // for a seek: its spinner then covers the wait for the first frame. paused plays until the picture moves,
        // then pauses there (this TV refuses a pause sooner) and settles paused.
        function open(url, offset, paused, buffer, mode) {
            mode = mode || {};
            if (!avplay) { return Promise.reject(new Error("Samsung AVPlay is unavailable. Use an authorized Samsung TV runtime.")); }
            close();
            if (!/^https?:\/\//.test(url) || /[\r\n]/.test(url)) {
                return Promise.reject(new Error("The playback URL is invalid."));
            }
            var ownGeneration = generation;
            transition("preparing");
            return new Promise(function (resolve, reject) {
                pending = reject;
                var moved = null;
                function failed(operation) {
                    if (ownGeneration !== generation || !pending) { return; }
                    clearTimeout(timer);
                    timer = null;
                    pending = null;
                    generation += 1;
                    transition("error");
                    reject(error(operation));
                }
                try {
                    avplay.open(url);
                    if (mode.prebuffer && offset > 0) {
                        try { avplay.setStreamingProperty("PREBUFFER_MODE", String(offset)); }
                        catch (failure) { failed("prebuffer"); return; }
                    }
                    setBuffering(buffer);
                    avplay.setDisplayRect(0, 0, 1920, 1080);
                    avplay.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
                    listener = {
                        onbufferingstart: function () {
                            if (ownGeneration === generation) { notify("buffering", true); }
                        },
                        onbufferingprogress: function (percent) {
                            if (ownGeneration === generation) { notify("buffer-progress", percent); }
                        },
                        onbufferingcomplete: function () {
                            if (ownGeneration === generation) { notify("buffering", false); }
                        },
                        oncurrentplaytime: function (time) {
                            if (ownGeneration === generation && typeof time === "number" && isFinite(time)) {
                                stopClock();
                                position = Math.max(0, Math.round(time));
                                // Prepared at an offset, AVPlay reports no duration until it plays.
                                if (!duration) {
                                    try { duration = Math.max(0, Number(avplay.getDuration()) || 0); } catch (failure) { duration = 0; }
                                }
                                notify("time");
                                if (moved) { moved(); }
                            }
                        },
                        onsubtitlechange: function (length, text) {
                            if (ownGeneration === generation) { notify("subtitle", { text: String(text || ""), duration: length }); }
                        },
                        onstreamcompleted: function () {
                            if (ownGeneration === generation) {
                                generation += 1;
                                cancelPending();
                                if (pendingSeek) { pendingSeek(new Error("Seek cancelled.")); }
                                position = Math.max(position, duration);
                                transition("ended");
                                notify("ended");
                            }
                        },
                        onerror: function () {
                            if (ownGeneration !== generation) { return; }
                            if (pending) { failed("prepare"); }
                            else {
                                generation += 1;
                                if (pendingSeek) { pendingSeek(new Error("Seek cancelled.")); }
                                transition("error"); notify("error", error("stream").message);
                            }
                        }
                    };
                    avplay.setListener(listener);
                    timer = setTimeout(function () { failed("prepare-timeout"); }, options.prepareTimeout || 25000);
                    avplay.prepareAsync(function () {
                        if (ownGeneration !== generation || !pending) { return; }
                        try {
                            duration = Math.max(0, Number(avplay.getDuration()) || 0);
                            transition("ready");
                            var resumeWait = options.resumeSeekTimeout || 8000;
                            function play(resumed) {
                                if (ownGeneration !== generation || !pending) { return; }
                                // A held start cannot fix a missed resume after playing; it fails, and
                                // the caller starts again in the ordinary way.
                                if (mode.hold && !resumed) { failed("resume"); return; }
                                try {
                                    if (!mode.hold) { avplay.play(); }
                                    // Prepared at the offset, AVPlay reports 0 until it plays.
                                    position = Math.max(resumed ? offset : 0, Math.round(Number(avplay.getCurrentTime()) || 0));
                                    clearTimeout(timer);
                                    timer = null;
                                    if (!mode.hold) { transition("playing"); watchClock(); }
                                    if ((mode.moving || paused) && !mode.hold) {
                                        var guard = setTimeout(function () { if (moved) { moved(); } }, 3000);
                                        moved = function () {
                                            clearTimeout(guard);
                                            moved = null;
                                            if (ownGeneration !== generation || !pending) { return; }
                                            pending = null;
                                            if (paused) {
                                                try { avplay.pause(); } catch (failure) { resolve(); return; }
                                                transition("paused");
                                            }
                                            resolve();
                                        };
                                    } else { pending = null; resolve(); }
                                } catch (failure) { failed("play"); return; }
                                if (!resumed) { seekWhilePlaying(); }
                            }
                            // A READY-state seek is unreliable for HLS on Tizen: on a UE55MU6172 it never
                            // called back. Retry the resume from PLAYING, which Samsung documents as safe.
                            function seekWhilePlaying() {
                                var done = false;
                                function lost() {
                                    if (done || ownGeneration !== generation) { return; }
                                    done = true;
                                    notify("resume-failed", offset);
                                }
                                var guard = null;
                                try {
                                    avplay.seekTo(offset, function () {
                                        if (done || ownGeneration !== generation) { return; }
                                        done = true;
                                        clearTimeout(guard);
                                        position = offset;
                                        notify("time");
                                    }, function () { clearTimeout(guard); lost(); });
                                } catch (failure) { lost(); return; }
                                // Counted from the call's return: the native seek may block until it lands.
                                if (!done) { guard = setTimeout(lost, resumeWait); }
                            }
                            if (offset > 0) {
                                var readySettled = false;
                                var readyGuard = null;
                                var settleReady = function (resumed) {
                                    if (readySettled) { return; }
                                    readySettled = true;
                                    clearTimeout(readyGuard);
                                    play(resumed);
                                };
                                try {
                                    avplay.seekTo(offset, function () { settleReady(true); }, function () { settleReady(false); });
                                } catch (failure) { settleReady(false); }
                                if (!readySettled) { readyGuard = setTimeout(function () { settleReady(false); }, resumeWait); }
                            } else { play(true); }
                        } catch (failure) { failed("prepare"); }
                    }, function () { failed("prepare"); });
                } catch (failure) { failed("open"); }
            });
        }
        function seek(target) {
            try { requireState(["playing", "paused", "ready"], "seek"); }
            catch (failure) { return Promise.reject(failure); }
            if (typeof target !== "number" || !isFinite(target)) { return Promise.reject(new Error("Invalid seek position.")); }
            if (pendingSeek) { return Promise.reject(new Error("A seek is already in progress. Wait before seeking again.")); }
            var ownGeneration = generation;
            target = Math.max(0, Math.min(duration || target, Math.round(target)));
            return new Promise(function (resolve, reject) {
                var settled = false;
                var timeout = null;
                function finish(failure, landed) {
                    if (settled) { return; }
                    settled = true;
                    clearTimeout(timeout);
                    pendingSeek = null;
                    if (failure) { reject(failure); }
                    else { resolve(landed); }
                }
                pendingSeek = finish;
                afterPaint(function () {
                    if (settled) { return; }
                    if (ownGeneration !== generation) { finish(new Error("Seek cancelled.")); return; }
                    try {
                        avplay.seekTo(target, function () {
                            if (settled) { return; }
                            if (ownGeneration !== generation) { finish(new Error("Seek cancelled.")); return; }
                            try {
                                position = Math.max(0, Math.round(Number(avplay.getCurrentTime()) || 0));
                                finish(null, position);
                                notify("time");
                            } catch (failure) { finish(error("seek")); }
                        }, function () { finish(error("seek")); });
                    } catch (failure) { finish(error("seek")); return; }
                    // Counted from the call's return, so time the page spent blocked in it is not a timeout.
                    if (!settled) { timeout = setTimeout(function () { finish(error("seek-timeout")); }, options.seekTimeout || 10000); }
                });
            });
        }
        return {
            open: open, close: close, seek: seek,
            snapshot: function () { return { state: state, position: position, duration: duration }; },
            pause: function () {
                requireState(["playing"], "pause");
                try { avplay.pause(); transition("paused"); } catch (failure) { throw error("pause"); }
            },
            play: function () {
                requireState(["paused", "ready"], "play");
                try { avplay.play(); } catch (failure) { throw error("play"); }
                transition("playing");
                watchClock();
            },
            tracks: function () {
                requireState(["ready", "playing", "paused"], "list tracks");
                try { return avplay.getTotalTrackInfo(); } catch (failure) { throw error("tracks"); }
            },
            selectTrack: function (type, index) {
                requireState(["playing", "paused"], "change track");
                if (["AUDIO", "TEXT"].indexOf(type) === -1 || typeof index !== "number" || index < 0) {
                    throw new Error("Invalid playback track.");
                }
                var resume = state === "playing";
                try {
                    if (resume) { avplay.pause(); }
                    avplay.setSelectTrack(type, index);
                    if (resume) { avplay.play(); }
                } catch (failure) {
                    if (resume && avplay.getState() === "PAUSED") {
                        try { avplay.play(); } catch (resumeFailure) { transition("error"); }
                    }
                    throw error("track-selection");
                }
            },
            subtitles: function (enabled) {
                requireState(["playing", "paused"], "change subtitles");
                try { avplay.setSilentSubtitle(!enabled); } catch (failure) { throw error("subtitles"); }
            },
            suspend: function () {
                requireState(["playing", "paused"], "suspend");
                try { avplay.suspend(); transition("suspended"); } catch (failure) { throw error("suspend"); }
            },
            restore: function () {
                requireState(["suspended"], "restore");
                try { avplay.restore(); transition("paused"); } catch (failure) { throw error("restore"); }
            }
        };
    }
    return { create: create };
}));
