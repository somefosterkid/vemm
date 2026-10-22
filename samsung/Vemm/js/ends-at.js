(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmEndsAt = api; }
}(this, function () {
    "use strict";

    // The clock time at which something remainingMs long ends if it starts at `now` (a Date, default the TV's
    // clock): "10:42 PM" for English, "22:42" for the 24-hour languages.
    function time(remainingMs, language, now) {
        var end = new Date((now || new Date()).getTime() + Math.max(0, remainingMs || 0));
        var hours = end.getHours();
        var minutes = ("0" + end.getMinutes()).slice(-2);
        if (language !== "en") { return ("0" + hours).slice(-2) + ":" + minutes; }
        return (hours % 12 || 12) + ":" + minutes + (hours < 12 ? " AM" : " PM");
    }

    return { time: time };
}));
