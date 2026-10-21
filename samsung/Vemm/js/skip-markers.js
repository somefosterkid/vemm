(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmSkipMarkers = api; }
}(this, function () {
    "use strict";
    // The on-screen Skip Intro / Skip Credits prompt, with the LG client's rules
    // (rust-modules/data/src/metadata.rs `marker_at`, rust-modules/appkit/src/skip_pill.rs):
    // only intro and credits markers count; the playhead is inside a marker from its start up to
    // (not including) its end, except that a `final` credits marker runs to the end of the item;
    // skipping an ordinary marker seeks to its end, skipping a `final` credits marker finishes
    // the item; and a marker the viewer already skipped does not come back, because the seek
    // lands on a keyframe that is usually still inside it.
    function isFinal(marker) {
        var value = marker && marker["final"];
        return value === true || value === 1 || value === "1" || value === "true";
    }

    function key(marker) { return marker.type + ":" + Number(marker.startTimeOffset); }

    function markerAt(markers, positionMs, skipped) {
        var list = markers || [];
        for (var index = 0; index < list.length; index += 1) {
            var marker = list[index];
            if (!marker || (marker.type !== "intro" && marker.type !== "credits")) { continue; }
            var start = Number(marker.startTimeOffset);
            var end = Number(marker.endTimeOffset);
            if (!isFinite(start)) { continue; }
            var finalCredits = marker.type === "credits" && isFinal(marker);
            if (!finalCredits && !(isFinite(end) && end > start)) { continue; }
            if (positionMs >= start && (finalCredits || positionMs < end) &&
                    !(skipped && skipped[key(marker)])) {
                return marker;
            }
        }
        return null;
    }

    function prompt(marker) {
        if (!marker) { return null; }
        return {
            key: key(marker),
            type: marker.type,
            label: marker.type === "intro" ? "Skip Intro" : "Skip Credits",
            action: marker.type === "credits" && isFinal(marker) ? "finish" : "seek",
            target: Number(marker.endTimeOffset)
        };
    }

    // What to do at an intro or credits marker: "button" (show Skip), "auto" (skip at once) or "off".
    // Plex keeps no such account or server preference (plex.tv user profile and PMS /:/prefs carry
    // none; Plex apps keep it per client), so the TV's setting is the default and a title can
    // override it. Overrides live on this TV per server and show (or movie).
    var MODES = ["button", "auto", "off"];
    var OVERRIDES = "vemm-tizen-skip-overrides";
    function titleKey(serverId, item) {
        return String(serverId || "") + "/" + String(item.type === "episode" && item.grandparentRatingKey || item.ratingKey);
    }
    function overrides(storage) {
        var all = null;
        try { all = JSON.parse(storage.getItem(OVERRIDES) || "{}"); } catch (error) { all = null; }
        return all && typeof all === "object" && !Array.isArray(all) ? all : {};
    }
    // The title's own choice for "intro" or "credits", or null when it follows the default.
    function override(storage, serverId, item, type) {
        var saved = overrides(storage)[titleKey(serverId, item)];
        return saved && MODES.indexOf(saved[type]) !== -1 ? saved[type] : null;
    }
    // mode null returns the title to the default. Throws when the TV refuses to store it.
    function setOverride(storage, serverId, item, type, mode) {
        var all = overrides(storage);
        var name = titleKey(serverId, item);
        var entry = all[name] && typeof all[name] === "object" ? all[name] : {};
        if (MODES.indexOf(mode) !== -1) { entry[type] = mode; } else { delete entry[type]; }
        if (Object.keys(entry).length) { all[name] = entry; } else { delete all[name]; }
        storage.setItem(OVERRIDES, JSON.stringify(all));
    }
    function mode(type, defaults, saved) {
        return saved || (type === "intro" ? defaults.skipIntro : defaults.skipCredits) || "button";
    }

    return { markerAt: markerAt, prompt: prompt, key: key, override: override,
        setOverride: setOverride, mode: mode };
}));
