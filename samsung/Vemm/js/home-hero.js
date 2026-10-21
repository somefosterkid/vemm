(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmHomeHero = api; }
}(this, function () {
    "use strict";
    // The Home banner pool. Like the LG client (rust-modules/data/src/pms.rs, "the rotating hero
    // pool") it draws from Continue Watching and the Recently Added rows only, matched on the
    // locale-independent hubIdentifier. It takes one item from each row in turn rather than
    // emptying the first row: Plex orders Home rows by library pin order, so filling row by row
    // gave the whole banner to Recently Added Movies whenever Movies is pinned above TV.
    var types = ["movie", "show", "episode"];

    function eligible(hub) {
        var id = String((hub && hub.hubIdentifier) || "");
        return id === "home.continue" || id === "home.ondeck" || id.indexOf("recent") !== -1;
    }

    // One banner slot per movie and per show: episodes count as their show.
    function identity(item) {
        if (item.type === "episode") {
            var show = item.grandparentRatingKey || item.grandparentTitle;
            return show ? "show:" + show : "";
        }
        return (item.type === "show" ? "show:" : "") + item.ratingKey;
    }

    function roundRobin(hubs, limit) {
        var picked = [];
        var seen = {};
        var cursors = hubs.map(function () { return 0; });
        var progressed = true;
        while (picked.length < limit && progressed) {
            progressed = false;
            for (var h = 0; h < hubs.length && picked.length < limit; h += 1) {
                var metadata = hubs[h].Metadata || [];
                while (cursors[h] < metadata.length) {
                    var item = metadata[cursors[h]];
                    cursors[h] += 1;
                    var key = item && item.ratingKey && types.indexOf(item.type) !== -1 ? identity(item) || item.ratingKey : "";
                    if (key && !seen[key]) {
                        seen[key] = true;
                        picked.push(item);
                        progressed = true;
                        break;
                    }
                }
            }
        }
        return picked;
    }

    return {
        pick: function (hubs, limit) {
            var list = Array.isArray(hubs) ? hubs.filter(Boolean) : [];
            var preferred = roundRobin(list.filter(eligible), limit);
            return preferred.length ? preferred : roundRobin(list, limit);
        }
    };
}));
