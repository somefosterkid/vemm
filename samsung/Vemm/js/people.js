(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmPeople = api; }
}(this, function () {
    "use strict";
    // Who played whom. A title's full answer has every person's id and character (Role) and job (Director, Writer,
    // Producer); a person's own list of titles (/library/people/{id}/media) has none of that. A person is known by the
    // server's id, or tagKey on a tag without one: never by name, since two people can share a name.
    var JOBS = ["Director", "Writer", "Producer"];

    function keyOf(tag) { return tag.id || tag.tagKey; }

    // { character, jobs } for everyone on a title, and nothing else: a long-running show lists 200 people.
    function creditsOn(title) {
        var found = Object.create(null);
        function credit(tag) {
            var key = keyOf(tag);
            if (!key) { return {}; }
            if (!found[key]) { found[key] = {}; }
            return found[key];
        }
        (title.Role || []).forEach(function (tag) {
            var entry = credit(tag);
            if (tag.role) { entry.character = tag.role; }
        });
        JOBS.forEach(function (job) {
            (title[job] || []).forEach(function (tag) {
                var entry = credit(tag);
                entry.jobs = (entry.jobs || []).concat(job);
            });
        });
        return found;
    }

    function creditIn(found, person) { return found[person.id] || found[person.tagKey] || null; }

    // What the most recent titles say. A title read whole answers for everyone, with {} for someone it does not list;
    // a person's filmography answers only for that person, so of() stays null for anyone else (nobody knows yet).
    function memory(limit) {
        var titles = Object.create(null);
        var order = [];
        function slot(key) {
            if (!titles[key]) {
                titles[key] = { credits: Object.create(null), whole: false };
                order.push(String(key));
                if (order.length > limit) { delete titles[order.shift()]; }
            }
            return titles[key];
        }
        return {
            learn: function (title) {
                if (!title || !title.ratingKey) { return; }
                var entry = slot(title.ratingKey);
                entry.credits = creditsOn(title);
                entry.whole = true;
            },
            note: function (key, person, credit) {
                var entry = slot(key);
                var id = keyOf(person);
                if (entry.whole || !id) { return; }
                var known = entry.credits[id] || (entry.credits[id] = {});
                if (credit.character && !known.character) { known.character = credit.character; }
                (credit.jobs || []).forEach(function (job) {
                    if ((known.jobs || []).indexOf(job) === -1) { known.jobs = (known.jobs || []).concat(job); }
                });
            },
            of: function (key, person) {
                var entry = titles[key];
                return entry ? creditIn(entry.credits, person) || (entry.whole ? {} : null) : null;
            },
            forget: function () { titles = Object.create(null); order = []; }
        };
    }

    return { creditsOn: creditsOn, creditIn: creditIn, memory: memory };
}));
