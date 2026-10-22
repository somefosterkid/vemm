(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmDevMode = api; }
}(this, function () {
    "use strict";
    // Developer mode: unlocked by typing a code on the About page, it reveals the technical readouts and the
    // error log. The log keeps the newest entries only, in localStorage, with credentials removed.
    var modeKey = "vemm-tizen-dev-mode";
    var logKey = "vemm-tizen-error-log";
    var code = "2580";
    var cap = 50;
    var messageLimit = 300;

    // Removes values that grant access: tokens, passwords, bearer credentials and auth headers.
    function redact(text) {
        return String(text)
            .replace(/((?:[a-z_-]*token|password|passwd|pin|authorization)["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^&\s"',;)]+/gi, "$1[redacted]")
            .replace(/(bearer\s+)[A-Za-z0-9._~+\/=-]+/gi, "$1[redacted]");
    }
    function enabled(storage) {
        try { return storage.getItem(modeKey) === "1"; } catch (error) { return false; }
    }
    function setEnabled(storage, on) {
        try { if (on) { storage.setItem(modeKey, "1"); } else { storage.removeItem(modeKey); } } catch (error) { /* only a convenience */ }
    }
    function list(storage) {
        try {
            var value = JSON.parse(storage.getItem(logKey));
            return Array.isArray(value) ? value.filter(function (entry) {
                return entry && typeof entry.at === "number" && typeof entry.message === "string";
            }).slice(-cap) : [];
        } catch (error) { return []; }
    }
    // Appends one entry (when developer mode is on), dropping the oldest beyond the cap. Never throws.
    function record(storage, message, now) {
        if (!enabled(storage)) { return; }
        var text = redact(message === undefined || message === null ? "" : message).slice(0, messageLimit);
        if (!text) { return; }
        try {
            var entries = list(storage);
            entries.push({ at: typeof now === "number" ? now : new Date().getTime(), message: text });
            storage.setItem(logKey, JSON.stringify(entries.slice(-cap)));
        } catch (error) { /* a full or blocked store loses the entry, never the app */ }
    }
    function clear(storage) {
        try { storage.removeItem(logKey); } catch (error) { /* nothing to clear */ }
    }
    // The digits typed so far, with a new key (48-57 or the keypad's 96-105) appended; keeps only the code's length.
    function typed(buffer, keyCode) {
        var digit = keyCode >= 48 && keyCode <= 57 ? keyCode - 48 : keyCode >= 96 && keyCode <= 105 ? keyCode - 96 : -1;
        if (digit < 0) { return buffer; }
        return (buffer + digit).slice(-code.length);
    }
    return { code: code, cap: cap, redact: redact, enabled: enabled, setEnabled: setEnabled, list: list,
        record: record, clear: clear, typed: typed,
        matches: function (buffer) { return buffer === code; } };
}));
