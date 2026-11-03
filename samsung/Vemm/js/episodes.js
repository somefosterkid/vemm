(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmEpisodes = api; }
}(this, function () {
    "use strict";
    // The order of a show's season tabs, and where its page rests when Plex's On Deck has no answer (a finished
    // show, or one watched out of order). Lists are what /children returns.

    // By number, with Specials (season 0) last.
    function seasonOrder(seasons) {
        function rank(season) { return Number(season.index) || 1e9; }
        return seasons.slice().sort(function (a, b) { return rank(a) - rank(b); });
    }

    // The furthest season with anything watched if it is unfinished, else the one after it; the first when none
    // has begun or all are done. Specials only when there is nothing else.
    function nextSeason(seasons) {
        var regular = seasons.filter(function (season) { return Number(season.index) !== 0; });
        if (!regular.length) { regular = seasons; }
        var furthest = -1;
        regular.forEach(function (season, at) { if (Number(season.viewedLeafCount) > 0) { furthest = at; } });
        var reached = regular[furthest];
        if (reached && Number(reached.viewedLeafCount) < Number(reached.leafCount)) { return reached; }
        return regular[furthest + 1] || regular[0] || null;
    }

    // The episode in progress, else the first after the furthest watched; the first when none is watched or all are.
    function nextEpisode(episodes) {
        var furthest = -1;
        var started = null;
        episodes.forEach(function (episode, at) {
            if (episode.viewOffset) { started = episode; }
            if (episode.viewCount) { furthest = at; }
        });
        return started || episodes[furthest + 1] || episodes[0] || null;
    }

    return { seasonOrder: seasonOrder, nextSeason: nextSeason, nextEpisode: nextEpisode };
}));
