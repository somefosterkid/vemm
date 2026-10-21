(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPreload = api; }
}(this, function () {
    "use strict";

    // One background start at a time. arm(start) waits `delay` ms (a Play control keeping focus), then
    // start() returns (a promise of) { key, ready, discard } or null: key names exactly what it prepares,
    // ready settles once it is prepared, discard() undoes it. take(key) hands over a matching one, even
    // one still preparing; anything else is discarded, as on cancel(), a new arm(), a failed ready or
    // after `lifetime` ms (a forgotten details page must not keep a server conversion running).
    function create(options) {
        options = options || {};
        var wait = options.setTimeout || function (run, ms) { return setTimeout(run, ms); };
        var stopWaiting = options.clearTimeout || function (id) { clearTimeout(id); };
        var delay = options.delay || 600;
        var lifetime = options.lifetime || 120000;
        var timer = null;
        var current = null;

        function cancel() {
            if (timer !== null) { stopWaiting(timer); timer = null; }
            var old = current;
            current = null;
            if (old && old.prepared) { old.prepared.discard(); }
        }
        function arm(start) {
            cancel();
            var own = { prepared: null };
            current = own;
            timer = wait(function () {
                timer = wait(cancel, lifetime);
                Promise.resolve().then(start).then(function (prepared) {
                    if (!prepared) { if (current === own) { cancel(); } return; }
                    if (current !== own) { prepared.discard(); return; }
                    own.prepared = prepared;
                    Promise.resolve(prepared.ready).then(null, function () { if (current === own) { cancel(); } });
                }, function () { if (current === own) { cancel(); } });
            }, delay);
        }
        function take(key) {
            var prepared = current && current.prepared;
            if (prepared && prepared.key === key) {
                if (timer !== null) { stopWaiting(timer); timer = null; }
                current = null;
                return prepared;
            }
            cancel();
            return null;
        }
        return { arm: arm, cancel: cancel, take: take };
    }

    return { create: create };
}));
