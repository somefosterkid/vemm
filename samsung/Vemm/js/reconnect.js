(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmReconnect = api; }
}(this, function () {
    "use strict";
    // Waiting for the server to come back after a network drop: probe() is asked at once and then again with a
    // growing pause (1, 2, 4, then every 8 s) until it succeeds (onUp) or the limit has passed (onGiveUp). onWait
    // runs after each failed probe. A probe that takes long (a dead link) counts toward the limit, so it is the
    // time since start() that ends the wait, not the number of tries.
    function create(options) {
        var delays = options.delays || [1000, 2000, 4000, 8000];
        var limit = options.limit === undefined ? 120000 : options.limit;
        var now = options.now || Date.now;
        var wait = options.setTimeout || setTimeout;
        var stopWaiting = options.clearTimeout || clearTimeout;
        var probeLimit = options.probeLimit || 5000;
        var running = false;
        var timer = null;
        var probeTimer = null;
        var tries = 0;
        var begun = 0;
        var generation = 0;

        function attempt(own) {
            var answered = false;
            // A probe that has not answered within probeLimit is a failed one, so a dead link is told about
            // sooner than the request's own timeout.
            var cut = probeTimer = wait(function () { settle(false); }, probeLimit);
            function settle(up) {
                if (answered) { return; }
                answered = true;
                stopWaiting(cut);
                if (own !== generation || !running) { return; }
                if (up) {
                    running = false;
                    options.onUp();
                    return;
                }
                tries += 1;
                if (now() - begun >= limit) {
                    running = false;
                    options.onGiveUp();
                    return;
                }
                if (options.onWait) { options.onWait(tries); }
                timer = wait(function () {
                    timer = null;
                    if (own === generation && running) { attempt(own); }
                }, delays[Math.min(tries, delays.length) - 1]);
            }
            Promise.resolve().then(options.probe).then(function () { settle(true); }, function () { settle(false); });
        }

        return {
            // pause: wait that long before the first probe (after a reopen that just failed).
            start: function (pause) {
                if (running) { return; }
                running = true;
                tries = 0;
                begun = now();
                generation += 1;
                var own = generation;
                if (pause > 0) {
                    timer = wait(function () { timer = null; if (own === generation && running) { attempt(own); } }, pause);
                } else { attempt(own); }
            },
            cancel: function () {
                running = false;
                generation += 1;
                if (timer !== null) { stopWaiting(timer); timer = null; }
                if (probeTimer !== null) { stopWaiting(probeTimer); probeTimer = null; }
            },
            running: function () { return running; }
        };
    }

    return { create: create };
}));
