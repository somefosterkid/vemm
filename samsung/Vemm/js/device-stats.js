(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmDeviceStats = api; }
}(this, function () {
    "use strict";
    var MB = 1024 * 1024;
    // Reads the TV's memory and storage and Vemm's own use. env is { tizen, performance, navigator }. Anything
    // missing or failing stays null, so a desktop browser simply has nothing to show. done runs once.
    function read(env, done) {
        env = env || {};
        var tizen = env.tizen;
        var memory = env.performance && env.performance.memory;
        var temporary = env.navigator && env.navigator.webkitTemporaryStorage;
        var stats = { memoryFree: null, memoryTotal: null, storageFree: null, storageTotal: null,
            heapUsed: null, usageUsed: null, quota: null };
        var waiting = 0;
        var started = false;
        // An API that never answers must not hold the readout back.
        var timer = setTimeout(function () { waiting = 0; finish(); }, 2000);
        function finish() {
            if (started && waiting === 0 && done) { var call = done; done = null; clearTimeout(timer); call(stats); }
        }
        function number(value) { return typeof value === "number" && isFinite(value) && value >= 0 ? value : null; }
        // start(settle) wraps each callback so that only the first reading counts and a throw leaves null.
        function pending(start) {
            var settled = false;
            waiting += 1;
            function settle(apply) {
                return function () {
                    if (settled) { return; }
                    settled = true;
                    try { apply.apply(null, arguments); } catch (error) { stats.failed = true; }
                    waiting -= 1;
                    finish();
                };
            }
            try { start(settle); } catch (error) { settle(function () {})(); }
        }
        try {
            if (tizen && tizen.systeminfo) {
                stats.memoryTotal = number(tizen.systeminfo.getTotalMemory());
                stats.memoryFree = number(tizen.systeminfo.getAvailableMemory());
            }
        } catch (error) { stats.memoryTotal = stats.memoryFree = null; }
        stats.heapUsed = memory ? number(memory.usedJSHeapSize) : null;
        if (tizen && tizen.systeminfo && tizen.systeminfo.getPropertyValue) {
            pending(function (settle) {
                tizen.systeminfo.getPropertyValue("STORAGE", settle(function (info) {
                    var unit = info.units.filter(function (entry) { return entry.type === "INTERNAL"; })[0] || info.units[0];
                    stats.storageTotal = number(unit.capacity);
                    stats.storageFree = number(unit.availableCapacity);
                }), settle(function () {}));
            });
        }
        if (temporary && temporary.queryUsageAndQuota) {
            pending(function (settle) {
                temporary.queryUsageAndQuota(settle(function (used, quota) {
                    stats.usageUsed = number(used);
                    stats.quota = number(quota);
                }), settle(function () {}));
            });
        }
        started = true;
        finish();
    }

    function megabytes(bytes) {
        return String(Math.round(bytes / MB)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " MB";
    }
    // Storage reads better in GB once it is a gigabyte or more: 2.2 GB, but 512 MB.
    function size(bytes) {
        return bytes >= 1024 * MB ? (Math.round(bytes / MB / 102.4) / 10) + " GB" : megabytes(bytes);
    }
    // The readout lines worth showing; a reading that is unavailable is left out. translate is the app's.
    function lines(stats, translate) {
        var out = [];
        if (stats.memoryTotal !== null && stats.memoryFree !== null) {
            out.push(translate("TV memory: {free} free of {total}", { free: megabytes(stats.memoryFree), total: megabytes(stats.memoryTotal) }));
        }
        if (stats.storageTotal !== null && stats.storageFree !== null) {
            out.push(translate("TV storage: {free} free of {total}", { free: size(stats.storageFree), total: size(stats.storageTotal) }));
        }
        if (stats.heapUsed !== null) { out.push(translate("Vemm memory: {used}", { used: megabytes(stats.heapUsed) })); }
        if (stats.usageUsed !== null && stats.quota !== null) {
            out.push(translate("Vemm storage: {used} of {quota}", { used: megabytes(stats.usageUsed), quota: megabytes(stats.quota) }));
        }
        return out;
    }
    return { read: read, lines: lines, megabytes: megabytes, size: size };
}));
