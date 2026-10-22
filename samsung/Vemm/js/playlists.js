(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPlaylists = api; }
}(this, function () {
    "use strict";
    var VIDEO = ["movie", "episode", "clip"];

    // "video", "audio" or "photo"; anything else is not offered for playing.
    function kind(playlist) {
        var type = playlist && playlist.playlistType;
        return type === "video" || type === "audio" || type === "photo" ? type : "";
    }

    function selectedIndex(queue) {
        var items = queue && queue.items || [];
        for (var i = 0; i < items.length; i += 1) {
            if (String(items[i].playQueueItemID) === String(queue.itemId)) { return i; }
        }
        return -1;
    }

    // The item after the selected one in a playlist's play queue, or null at the end.
    function successor(queue) {
        var at = selectedIndex(queue);
        var next = at >= 0 && queue.items[at + 1];
        return next && /^[0-9]+$/.test(String(next.ratingKey)) && VIDEO.indexOf(next.type) !== -1 ? next : null;
    }

    // The server sends a window of the queue; more is needed once the selected item is near its end.
    function needsMore(queue) {
        var at = selectedIndex(queue);
        return at >= 0 && at >= queue.items.length - 2 && queue.items.length < queue.total;
    }

    // The same queue with one of its own items selected.
    function advance(queue, next) {
        return { id: queue.id, itemId: String(next.playQueueItemID), items: queue.items, total: queue.total, playlist: queue.playlist };
    }

    return { kind: kind, selectedIndex: selectedIndex, successor: successor, needsMore: needsMore, advance: advance };
}));
