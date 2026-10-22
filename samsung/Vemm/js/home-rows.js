(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmHomeRows = api; }
}(this, function () {
    "use strict";
    // Which Plex shelves Home shows and in what order, per profile and server: { order: [ids], hidden: [ids] }.
    // A shelf the saved choice has never seen is shown, after the ones that have a place.
    var prefix = "vemm-tizen-home-rows-";

    function idOf(hub) { return String(hub.hubIdentifier || hub.title || ""); }
    function key(profile, serverId) { return prefix + String(profile || "linked") + "-" + String(serverId); }
    function clean(value) {
        var ids = function (list) {
            return Array.isArray(list) ? list.filter(function (id, at) {
                return typeof id === "string" && list.indexOf(id) === at;
            }) : [];
        };
        return { order: ids(value && value.order), hidden: ids(value && value.hidden) };
    }
    function load(storage, storeKey) {
        try { return clean(JSON.parse(storage.getItem(storeKey))); } catch (error) { return clean(null); }
    }
    function save(storage, storeKey, choice) {
        try { storage.setItem(storeKey, JSON.stringify(clean(choice))); return true; } catch (error) { return false; }
    }
    // Every hub in the saved order (unseen ones last, in server order), each with whether it is shown.
    function arrange(hubs, choice) {
        var order = choice.order;
        var placed = hubs.map(function (hub, at) { return { hub: hub, at: at, rank: order.indexOf(idOf(hub)) }; });
        placed.sort(function (a, b) {
            if (a.rank === -1 && b.rank === -1) { return a.at - b.at; }
            if (a.rank === -1) { return 1; }
            if (b.rank === -1) { return -1; }
            return a.rank - b.rank;
        });
        return placed.map(function (entry) {
            return { hub: entry.hub, id: idOf(entry.hub), shown: choice.hidden.indexOf(idOf(entry.hub)) === -1 };
        });
    }
    // The hubs Home draws.
    function visible(hubs, choice) {
        return arrange(hubs, choice).filter(function (row) { return row.shown; }).map(function (row) { return row.hub; });
    }
    // The choice after the displayed rows (arrange's result) were reordered or toggled. Saved entries for shelves
    // not displayed now (an empty shelf today) are kept after the displayed ones.
    function choose(rows, previous) {
        var shownIds = rows.map(function (row) { return row.id; });
        return {
            order: shownIds.concat(previous.order.filter(function (id) { return shownIds.indexOf(id) === -1; })),
            hidden: rows.filter(function (row) { return !row.shown; }).map(function (row) { return row.id; })
                .concat(previous.hidden.filter(function (id) { return shownIds.indexOf(id) === -1; }))
        };
    }
    return { key: key, idOf: idOf, load: load, save: save, arrange: arrange, visible: visible, choose: choose };
}));
