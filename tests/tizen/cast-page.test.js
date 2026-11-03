"use strict";
// The cast page: one row of people along the bottom, whoever is chosen above it, and what they played on each title.
// Everything is synthetic; layout is a small stand-in for what the TV measures.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var people = require("../../samsung/Vemm/js/people.js");
var app = path.resolve(__dirname, "../../samsung/Vemm");
var LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, OK = 13, BACK = 10009;

function person(at, extra) {
    return Object.assign({ id: 900 + at, tagKey: "5d776827151a60001f24" + (1000 + at), tag: "Actor " + at, role: "Role " + at, thumb: "/face/" + at }, extra);
}

// Harness: the app's real page code over a fake server, with the rest timers held until a test lets them run.
function harness(setup) {
    setup = setup || {};
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), { url: "https://app.synthetic.invalid", runScripts: "outside-only" });
    var window = dom.window;
    var document = window.document;
    window.TextDecoder = TextDecoder;
    window.fetch = function () { assert.fail("The fake client must not use the network"); };
    window.URL.createObjectURL = function () { return "blob:synthetic"; };
    window.URL.revokeObjectURL = function () {};
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1080 });
    Object.defineProperty(window.Element.prototype, "scrollWidth", { configurable: true, get: function () { return this.children.length * 200; } });
    window.Element.prototype.getBoundingClientRect = function () {
        var parent = this.parentNode;
        var at = parent && parent.children ? Array.prototype.indexOf.call(parent.children, this) : 0;
        function rect(left, top, width, height) { return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height }; }
        if (/person-row/.test(this.className || "")) {
            var rows = document.querySelectorAll(".person-titles .person-row");
            return rect(0, 400 + 480 * Array.prototype.indexOf.call(rows, this), 1920, 400);
        }
        if (parent && /person-row/.test(parent.className || "")) { return rect(500 + at * 200 - parent.scrollLeft, 400, 190, 400); }
        return rect(0, 0, 0, 0);
    };
    var realTimeout = window.setTimeout.bind(window);
    var held = [];
    window.setTimeout = function (run, ms) {
        if (ms !== 350) { return realTimeout(run, ms); }
        var entry = { run: run };
        held.push(entry);
        return entry;
    };
    var realClear = window.clearTimeout.bind(window);
    window.clearTimeout = function (timer) {
        var at = held.indexOf(timer);
        if (at !== -1) { held.splice(at, 1); } else { realClear(timer); }
    };
    var calls = [];
    var cancels = { count: 0 };
    var gates = {};
    function answer(name, value) {
        if (!gates[name]) { return Promise.resolve(value); }
        return new Promise(function (resolve, reject) { gates[name].push({ resolve: function () { resolve(value); }, reject: reject }); });
    }
    var titles = setup.titles || {};
    var client = {
        serverId: "synthetic-server",
        cancelRequests: function () { cancels.count += 1; },
        getPerson: function (section, id, start) {
            calls.push("person " + id);
            if (setup.personFails) { return Promise.reject(new Error("Synthetic outage")); }
            var list = (setup.list && setup.list(id)) || [];
            return answer("person", { offset: start || 0, totalSize: list.length, Metadata: list.slice(start || 0, (start || 0) + 50) });
        },
        titleCredits: function (keys) {
            calls.push("credits " + keys.join(","));
            if (setup.creditsFail) { return Promise.reject(new Error("Synthetic outage")); }
            return answer("credits", keys.map(function (key) { return titles[key]; }).filter(Boolean));
        },
        getMetadata: function (id) { calls.push("metadata " + id); return Promise.resolve(titles[id] || { ratingKey: String(id), type: "movie", title: "Opened " + id }); },
        getRelated: function () { return Promise.resolve({ Hub: [] }); },
        image: function (imagePath, size) { calls.push("image " + imagePath + " " + size.width + "x" + size.height); return Promise.reject(new Error("no art")); },
        previewIndex: function () { return Promise.reject(new Error("none")); }
    };
    var account = setup.noAccount ? null : {
        cancelRequests: function () {},
        personProfile: function (tagKey) {
            calls.push("profile " + tagKey);
            return answer("profile", { Metadata: [setup.profile ? setup.profile(tagKey) : { summary: "Biography of " + tagKey, bornAt: "1961-04-12", birthPlace: "A Coastal Town" }] });
        },
        personCredits: function (tagKey) {
            calls.push("career " + tagKey);
            if (setup.careerFails) { return Promise.reject(new Error("Plex person information failed (HTTP 401).")); }
            return answer("career", setup.career ? setup.career(tagKey) : []);
        }
    };
    window.__synthetic = { client: client, account: account };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js", "js/session.js", "js/recents.js", "js/home-hero.js",
        "js/item-menu.js", "js/skip-markers.js", "js/account-preferences.js", "js/file-info.js", "js/search-ui.js", "js/people.js", "js/cast-ui.js", "js/preload.js", "js/episodes.js",
        "js/dev-mode.js", "js/reconnect.js", "js/track-memory.js", "js/ends-at.js", "js/i18n.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    var main = fs.readFileSync(path.join(app, "main.js"), "utf8");
    window.eval(main.slice(0, main.lastIndexOf('    addConnectForm("");')) +
        "accountToken = 'synthetic'; accountClient = window.__synthetic.account; currentClient = window.__synthetic.client; currentServerId = 'synthetic-server';\n" +
        "window.journey = { openCast: openCast, openPerson: openPerson, openDetail: openDetail, renderDetail: renderDetail, back: backView, forget: forgetDetails };\n}());");
    async function settle() {
        for (var turn = 0; turn < 6; turn += 1) {
            for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
            await new Promise(function (resolve) { realTimeout(resolve, 0); });
        }
    }
    return {
        window: window, document: document, journey: window.journey, calls: calls, cancels: cancels, settle: settle, gates: gates,
        press: function (code) { (document.activeElement || document).dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: code, bubbles: true, cancelable: true })); },
        // Everything that was waiting for the cursor to rest runs now.
        rest: async function () { var due = held.splice(0); due.forEach(function (entry) { entry.run(); }); await settle(); },
        waiting: function () { return held.length; },
        name: function () { return document.querySelector(".person-name").textContent; },
        peopleCards: function () { return Array.from(document.querySelectorAll(".cast-row .detail-person")); },
        rows: function () { return Array.from(document.querySelectorAll(".person-titles .person-row")); },
        cards: function (at) { return Array.from(this.rows()[at || 0].children); },
        caption: function (at, row) { return this.cards(row)[at].querySelector(".card-meta").textContent; },
        focused: function () { var a = document.activeElement; return a.vemmPerson ? a.vemmPerson.tag : a.vemmCard ? a.vemmCard.item.title : a.textContent; },
        reset: function () { calls.length = 0; },
        close: function () { window.close(); }
    };
}

function listed(item) {
    return { ratingKey: item.ratingKey, type: item.type || "movie", title: item.title, year: item.year, guid: "plex://movie/guid" + item.ratingKey, thumb: "/poster/" + item.ratingKey,
        // What /library/people/{id}/media really gives: a few names and no characters.
        Role: [{ tag: "Actor 1" }, { tag: "Actor 2" }] };
}

async function theOnePage() {
    var cast = []; for (var at = 1; at <= 40; at += 1) { cast.push(person(at)); }
    var film = { ratingKey: "50", type: "movie", title: "Synthetic Film", Role: cast, Director: [{ id: 880, tag: "Some Director", thumb: "/face/d" }, { id: 901, tag: "Actor 1" }] };
    var app = harness({ list: function () { return []; } });
    try {
        app.journey.openCast(film, app.window.__synthetic.client);
        await app.settle();
        assert(app.document.querySelector(".screen-cast"), "One page");
        assert.strictEqual(app.document.querySelector(".cast-grid"), null, "with no grid of people");
        assert.strictEqual(app.document.querySelectorAll(".cast-row").length, 1, "and one row of them");
        assert(app.document.querySelector(".app-shell").className.indexOf("detail-mode") !== -1, "using the whole screen");
        assert.strictEqual(app.peopleCards().length, 30, "A long cast is built a stretch at a time");
        assert.strictEqual(app.focused(), "Actor 1", "The cursor starts on the first person");
        assert.strictEqual(app.name(), "Actor 1", "who is shown above");
        assert.strictEqual(app.document.querySelector(".person-credit").textContent, "as Role 1", "with who they played");
        assert.strictEqual(app.peopleCards()[0].getAttribute("aria-current"), "true");
        assert(app.calls.indexOf("image /face/1 440x440") !== -1, "The whole photo is asked for at a size that suits it, not full size");
        var portrait = app.document.querySelector(".person-portrait");
        assert(portrait, "and has its own frame");

        // Holding Right asks for nothing; the person it stops on is drawn once it rests.
        app.reset();
        for (var step = 0; step < 6; step += 1) { app.press(RIGHT); }
        await app.settle();
        assert.strictEqual(app.focused(), "Actor 7");
        assert.deepStrictEqual(app.calls.filter(function (call) { return !/^image/.test(call); }), [], "Nothing is asked for people the cursor passes");
        assert.strictEqual(app.name(), "Actor 1", "and the page has not changed yet");
        await app.rest();
        assert.strictEqual(app.name(), "Actor 7", "Resting draws them");
        assert.strictEqual(app.calls.filter(function (call) { return /^person/.test(call); }).join(), "person 907", "and asks only for them");
        assert.strictEqual(app.peopleCards()[0].hasAttribute("aria-current"), false, "The mark moves");
        assert.strictEqual(app.peopleCards()[6].getAttribute("aria-current"), "true");

        // Back on the person already shown: nothing is due.
        app.reset();
        app.press(RIGHT);
        app.press(LEFT);
        assert.strictEqual(app.waiting(), 0, "Returning to the person shown cancels the wait");
        await app.rest();
        assert.deepStrictEqual(app.calls.filter(function (call) { return !/^image/.test(call); }), []);

        // Someone seen a moment ago draws from what is remembered.
        for (step = 0; step < 6; step += 1) { app.press(LEFT); }
        await app.rest();
        assert.strictEqual(app.name(), "Actor 1");
        assert.deepStrictEqual(app.calls.filter(function (call) { return !/^image/.test(call); }), [], "Going back to someone asks nothing");

        // Rows stop at their ends.
        app.press(LEFT);
        assert.strictEqual(app.focused(), "Actor 1", "The row stops at its first person");
        app.peopleCards()[29].focus();
        assert(app.peopleCards().length > 30, "Nearing the end builds more");
        app.peopleCards()[39].focus();
        app.press(RIGHT);
        assert.strictEqual(app.focused(), "Some Director", "The crew follow the cast");
        app.press(RIGHT);
        assert.strictEqual(app.focused(), "Some Director", "and the row stops at its last");
        assert.strictEqual(app.peopleCards().length, 41, "with everyone reachable");
        app.peopleCards()[0].focus();
        assert.strictEqual(app.peopleCards()[0].parentNode.scrollLeft, 0, "Its first person returns to its exact place");

        // Someone listed twice is one person, with both jobs.
        await app.rest();
        var both = app.peopleCards().filter(function (node) { return node.vemmPerson.id === 901; });
        assert.strictEqual(both.length, 1, "A person listed as actor and director has one card");
        assert.strictEqual(app.document.querySelector(".person-credit").textContent, "as Role 1");
        assert(!app.document.querySelector(".person-credit").textContent.indexOf("as "), "Their character comes first");
    } finally { app.close(); }

    // A person chosen on the details page opens the page on them, and crew never get a broken "as".
    var crewOnly = harness({ list: function () { return []; } });
    try {
        crewOnly.journey.openCast(film, crewOnly.window.__synthetic.client, film.Director[0]);
        await crewOnly.settle();
        assert.strictEqual(crewOnly.name(), "Some Director");
        assert.strictEqual(crewOnly.document.querySelector(".person-credit").textContent, "Director", "Crew show their job");
        assert.strictEqual(crewOnly.focused(), "Some Director");
    } finally { crewOnly.close(); }
}

async function whoTheyPlayed() {
    var actor = person(1);
    var twin = person(2, { tag: "Actor 1" });
    var items = [];
    for (var at = 0; at < 14; at += 1) { items.push({ ratingKey: String(100 + at), title: "Title " + at, year: 2000 + at }); }
    var titles = {};
    items.forEach(function (item, index) {
        // A namesake on every title: only the id counts.
        titles[item.ratingKey] = Object.assign({}, item, { Role: [{ id: twin.id, tag: twin.tag, role: "The Namesake" }, { id: actor.id, tag: actor.tag, role: "Character " + index }] });
    });
    titles["102"] = Object.assign({}, items[2], { Role: [], Director: [{ id: actor.id, tag: actor.tag }], Writer: [{ id: actor.id, tag: actor.tag }] });
    titles["103"] = Object.assign({}, items[3], { Role: [{ id: twin.id, tag: twin.tag, role: "The Namesake" }] });
    titles["104"] = Object.assign({}, items[4], { Role: [{ id: actor.id, tag: actor.tag }] });
    var own = { ratingKey: "100", type: "movie", title: "Title 0", Role: [actor, twin] };
    var app = harness({ titles: titles, list: function () { return items.map(listed); } });
    try {
        app.gates.credits = [];
        app.journey.openCast(own, app.window.__synthetic.client);
        await app.settle();
        // The page's own title goes last: "other content" comes first, and its character is known at once.
        var cards = app.cards();
        assert.strictEqual(cards[cards.length - 1].vemmCard.item.ratingKey, "100", "The page's own title comes last");
        assert.strictEqual(app.caption(cards.length - 1), "as Role 1", "and needs no read");
        assert.strictEqual(app.caption(0), "2001", "A line is there before the character is known");
        var meta = cards[0].querySelector(".card-meta");
        // Politely: near the screen only, a few at a time, one read at once.
        var reads = app.calls.filter(function (call) { return /^credits/.test(call); });
        assert.strictEqual(reads.length, 1, "One read at a time");
        assert.strictEqual(reads[0].split(",").length, 4, "of a few titles");
        assert.strictEqual(app.gates.credits.length, 1, "and the page did not wait for it");
        assert.strictEqual(app.name(), "Actor 1");
        // Answers replace the line in place.
        while (app.gates.credits.length) { app.gates.credits.shift().resolve(); await app.settle(); }
        assert.strictEqual(cards[0].querySelector(".card-meta"), meta, "The same line is replaced, so nothing can jump");
        assert.strictEqual(app.caption(0), "as Character 1", "The character from a title's full answer");
        assert.strictEqual(app.caption(1), "Director · Writer", "A job, with no broken as");
        assert.strictEqual(app.caption(2), "2003", "Not on that title's list: the namesake is not taken for them");
        assert.strictEqual(app.caption(3), "2004", "On the list with no character: nothing to say");
        var far = app.calls.filter(function (call) { return /^credits/.test(call); }).join();
        assert(far.indexOf("113") === -1, "Titles far along the row are not read: " + far);
        var before = app.calls.length;

        // Moving along the row reads the next ones only once it rests.
        app.rows()[0].scrollLeft = 2000;
        app.cards()[12].focus();
        await app.settle();
        assert.strictEqual(app.calls.length, before, "not while it moves");
        await app.rest();
        while (app.gates.credits.length) { app.gates.credits.shift().resolve(); await app.settle(); }
        assert(app.calls.slice(before).join().indexOf("113") !== -1, "and then the ones in view");
        assert.strictEqual(app.caption(12), "as Character 13");

        // Moving on from a person stops the reads for them: the next batch waits for the rest.
        var pausing = harness({ titles: titles, list: function () { return items.map(listed); } });
        try {
            pausing.gates.credits = [];
            pausing.journey.openCast({ ratingKey: "100", type: "movie", title: "Title 0", Role: [actor, person(3)] }, pausing.window.__synthetic.client);
            await pausing.settle();
            pausing.press(RIGHT);
            pausing.reset();
            pausing.gates.credits.shift().resolve();
            await pausing.settle();
            assert.strictEqual(pausing.calls.filter(function (call) { return /^credits/.test(call); }).length, 0, "A person being left is not read for");
        } finally { pausing.close(); }

        // A title read once answers for everyone on it.
        app.reset();
        app.peopleCards()[1].focus();
        await app.rest();
        assert.strictEqual(app.name(), "Actor 1", "The namesake is shown");
        assert.strictEqual(app.calls.filter(function (call) { return /^credits/.test(call); }).length, 0, "No title is read again");
        assert.strictEqual(app.caption(0), "as The Namesake", "and shows their own character");
    } finally { app.close(); }

    // A read that fails leaves the card as it was and says nothing.
    var failing = harness({ titles: titles, creditsFail: true, list: function () { return items.map(listed); } });
    try {
        failing.journey.openCast(own, failing.window.__synthetic.client);
        await failing.settle();
        assert.strictEqual(failing.caption(0), "2001");
        assert.strictEqual(failing.document.getElementById("status").className.indexOf("status-error"), -1, "A missing character is not an error");
        assert(failing.document.querySelector(".person-biography"), "and the rest of the page is there");
    } finally { failing.close(); }

    // Leaving: a late answer is ignored and no further read starts.
    var leaving = harness({ titles: titles, list: function () { return items.map(listed); } });
    try {
        leaving.gates.credits = [];
        leaving.journey.openCast(own, leaving.window.__synthetic.client);
        await leaving.settle();
        var cancelled = leaving.cancels.count;
        leaving.journey.openPerson(person(5), leaving.window.__synthetic.client);
        await leaving.settle();
        assert(leaving.cancels.count > cancelled, "Leaving cancels what is in flight");
        leaving.reset();
        leaving.gates.credits.shift().resolve();
        await leaving.settle();
        assert.strictEqual(leaving.calls.filter(function (call) { return /^credits/.test(call); }).join().indexOf("105"), -1, "and nothing more is read for the old page");
    } finally { leaving.close(); }

    // A late answer for someone left behind never lands on the person now shown.
    var late = harness({ list: function () { return []; } });
    try {
        late.gates.profile = [];
        late.journey.openCast({ ratingKey: "9", title: "Own", Role: [person(1), person(2)] }, late.window.__synthetic.client);
        await late.settle();
        late.press(RIGHT);
        await late.rest();
        assert.strictEqual(late.name(), "Actor 2");
        late.gates.profile.shift().resolve();
        await late.settle();
        assert.strictEqual(late.document.querySelector(".person-biography"), null, "The last person's biography is dropped");
        late.gates.profile.shift().resolve();
        await late.settle();
        assert(/1002$/.test(late.document.querySelector(".person-biography").textContent), "Theirs is drawn");
    } finally { late.close(); }

    // Back to the person shown before the next one's answer came: their rows are drawn once, not twice.
    var flip = harness({ list: function (id) { return [listed({ ratingKey: String(id), title: "Title of " + id, year: 2000 })]; } });
    try {
        flip.journey.openCast({ ratingKey: "9", title: "Own", Role: [person(1), person(2)] }, flip.window.__synthetic.client);
        await flip.settle();
        flip.gates.person = [];
        flip.press(RIGHT);
        await flip.rest();
        assert.strictEqual(flip.name(), "Actor 2");
        assert.strictEqual(flip.cards(0)[0].vemmCard.item.title, "Title of 901", "The last person's rows stay until the next person's arrive");
        flip.press(LEFT);
        await flip.rest();
        assert.strictEqual(flip.name(), "Actor 1");
        assert.strictEqual(flip.rows().length, 1, "One row");
        assert.strictEqual(flip.cards(0).length, 1, "with their one title");
        flip.gates.person.shift().resolve();
        await flip.settle();
        assert.strictEqual(flip.rows().length, 1, "and the late answer adds nothing");
        assert.strictEqual(flip.cards(0)[0].vemmCard.item.title, "Title of 901");
    } finally { flip.close(); }

    var plain = people.memory(2);
    plain.learn({ ratingKey: "1", Role: [{ id: 5, tag: "Same", role: "A" }, { tagKey: "abc", tag: "Same", role: "B" }] });
    assert.strictEqual(plain.of("1", { id: 5 }).character, "A", "By id");
    assert.strictEqual(plain.of("1", { id: 6, tagKey: "abc" }).character, "B", "or tagKey");
    assert.deepStrictEqual(plain.of("1", { id: 7, tag: "Same" }), {}, "never by name");
    assert.strictEqual(plain.of("2", { id: 5 }), null, "Nobody has read this one");
    plain.note("2", { id: 5 }, { character: "C" });
    assert.strictEqual(plain.of("2", { id: 5 }).character, "C", "A person's own filmography answers for them");
    plain.note("2", { id: 5 }, { jobs: ["Producer"] });
    plain.note("2", { id: 5 }, { jobs: ["Producer"] });
    assert.deepStrictEqual(plain.of("2", { id: 5 }).jobs, ["Producer"], "once");
    assert.strictEqual(plain.of("2", { id: 6 }), null, "and for nobody else");
    plain.learn({ ratingKey: "3" });
    assert.strictEqual(plain.of("1", { id: 5 }), null, "Only the most recent titles are kept");
    plain.forget();
    assert.strictEqual(plain.of("3", { id: 5 }), null);
}

async function rowsOfTitles() {
    var actor = person(1);
    var items = [{ ratingKey: "200", title: "Held One", year: 2001 }, { ratingKey: "201", title: "Held Two", year: 2002 }];
    function credit(index, role, year) {
        return { role: role, Metadata: { ratingKey: "catalogue" + index, type: "movie", title: "Elsewhere " + index, year: year, thumb: "https://metadata-static.plex.tv/poster/" + index } };
    }
    var longCareer = [{ role: "From Career", Metadata: { ratingKey: "guid200", type: "movie", title: "Held One", year: 2001 } }];
    for (var at = 0; at < 70; at += 1) { longCareer.push(credit(at, at === 1 ? undefined : "Part " + at, at === 2 ? undefined : 1990)); }
    var groups = [
        { title: "Actor", type: "actor", Credit: longCareer.concat([{ order: 1 }]) },
        { title: "Producer", type: "producer", Credit: [{ role: "Executive Producer", Metadata: { ratingKey: "crew1", title: "Made One" } }, { Metadata: { ratingKey: "crew2", title: "Made Two", year: 2020 } },
            { Metadata: { ratingKey: "guid201", title: "Held Two" } }] },
        { type: "appeared", Credit: [{ role: "Self", Metadata: { ratingKey: "seen1", title: "Seen One" } }] },
        { title: "Empty" }
    ];
    var app = harness({ titles: { 200: Object.assign({}, items[0]), 201: Object.assign({}, items[1]) }, list: function () { return items.map(listed); }, career: function () { return groups; } });
    var visited = [];
    try {
        app.journey.openCast({ ratingKey: "9", title: "Own", Role: [actor, person(2)] }, app.window.__synthetic.client);
        await app.settle();
        var headings = Array.from(app.document.querySelectorAll(".person-titles .detail-section-title")).map(function (node) { return node.textContent; });
        assert.deepStrictEqual(headings, ["On this server", "Actor", "Producer", "Credits"], "A row for each kind of title, and none for an empty group");
        assert(app.document.querySelector(".person-titles .media-card .poster"), "The app's normal cards, with posters");
        assert.strictEqual(app.document.querySelector(".title-tile"), null, "not the old list");
        assert.strictEqual(app.cards(0).length, 2);
        assert.strictEqual(app.caption(0, 0), "as From Career", "A filmography names the character for a title on this server");
        assert.strictEqual(app.caption(1, 0), "Producer", "and the job for a crew credit with no role of its own");
        assert.strictEqual(app.calls.filter(function (call) { return /^credits/.test(call); }).length, 0, "with no title read");
        assert(app.cards(1).every(function (node) { return !/^Held/.test(node.vemmCard.item.title); }), "A title on this server is not repeated");
        assert.strictEqual(app.cards(1).length, 30, "A long filmography is built a stretch at a time");
        assert.strictEqual(app.caption(0, 1), "as Part 0", "as Character");
        assert.strictEqual(app.caption(1, 1), "1990", "no role: the year");
        assert.strictEqual(app.caption(2, 1), "as Part 2", "no year either way");
        assert.strictEqual(app.caption(0, 2), "Executive Producer", "A job has no as");
        assert.strictEqual(app.caption(1, 2), "2020", "Crew with no role: the year");
        assert.strictEqual(app.caption(0, 3), "as Self", "An appearance is a character");
        assert.strictEqual(app.cards(1)[0].vemmCard.item.ratingKey, undefined, "A catalogue title has no actions on this server");

        // Artwork near the screen only; the row far below waits.
        var images = app.calls.filter(function (call) { return /^image .*240x360/.test(call); });
        assert(images.some(function (call) { return /\/poster\/200/.test(call); }), "Posters come at the card's size");
        var farCard = app.cards(1)[25];
        assert.strictEqual(farCard.vemmFar, true, "A poster more than a screen along waits");
        assert.strictEqual(app.cards(3)[0].vemmFar, true, "A row more than half a screen below the page waits");
        app.rows()[1].scrollLeft = 3000;
        app.cards(1)[20].focus();
        app.window.setTimeout(function () {}, 0);
        await new Promise(function (resolve) { setTimeout(resolve, 120); });
        await app.settle();
        assert.strictEqual(farCard.vemmFar, false, "and is fetched as the row nears it");

        // Up and Down: Read more, the rows, the people; with no wrap and no steps along a row.
        var box = app.document.querySelector(".person-biography");
        assert(box, "A biography");
        assert.strictEqual(app.document.querySelector(".person-more button"), null, "Short: no Read more");
        var peopleCard = app.peopleCards()[0];
        peopleCard.focus();
        app.press(DOWN);
        assert.strictEqual(app.document.activeElement, peopleCard, "Down on the people stays");
        app.press(UP);
        assert.strictEqual(app.focused(), "Held One", "Up reaches the first row, where it rests");
        app.press(RIGHT);
        assert.strictEqual(app.focused(), "Held Two");
        app.press(RIGHT);
        assert.strictEqual(app.focused(), "Held Two", "A row stops at its end");
        app.press(UP);
        assert.strictEqual(app.focused(), "Held Two", "Up stops at the top");
        app.press(DOWN);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[1], "Down reaches the next row");
        var track = app.document.querySelector(".person-track");
        Object.defineProperty(app.rows()[2].parentNode, "offsetTop", { configurable: true, value: 960 });
        var rowsBox = app.document.querySelector(".person-rows");
        rowsBox.scrollTop = 40;
        app.press(DOWN);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[2]);
        assert(/-960px/.test(track.style.transform), "The rows move as one, so the row in focus shows");
        assert.strictEqual(rowsBox.scrollTop, 0, "and the browser's own scroll of the box is undone");
        app.press(DOWN);
        app.press(DOWN);
        assert.strictEqual(app.document.activeElement, peopleCard, "Below the last row are the people");
        app.press(UP);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[3], "Up returns to the row that was showing");
        app.press(LEFT);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[3], "A row's first item stays put");
        app.press(UP);
        app.press(UP);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[1], "A row is entered where the cursor left it");

        // OK on a title: its page, then Back to the same person and card.
        app.press(DOWN);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[2]);
        app.press(UP);
        app.press(UP);
        assert.strictEqual(app.focused(), "Held Two");
        var card = app.document.activeElement;
        app.reset();
        card.click();
        await app.settle();
        assert(app.document.querySelector(".screen-detail"), "OK opens the title's details page");
        visited = app.calls.filter(function (call) { return /^metadata/.test(call); });
        assert.deepStrictEqual(visited, ["metadata 201"]);
        app.reset();
        app.press(BACK);
        await app.settle();
        assert(app.document.querySelector(".screen-cast"), "Back returns to the cast page");
        assert.strictEqual(app.name(), "Actor 1", "on the same person");
        assert.strictEqual(app.focused(), "Held Two", "and the same card");
        assert.strictEqual(app.caption(1, 0), "Producer", "A job drawn again is still said once");
        assert.strictEqual(app.calls.filter(function (call) { return /^(person|profile|career)/.test(call); }).length, 0, "with nothing asked again");

        // A title elsewhere: a search for it, and Back returns to it.
        app.press(DOWN);
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[1]);
        app.rows()[1].scrollLeft = 3000;
        app.cards(1)[20].focus();
        var elsewhere = app.document.activeElement;
        var at2 = Array.prototype.indexOf.call(elsewhere.parentNode.children, elsewhere);
        var scrolled = elsewhere.parentNode.scrollLeft;
        assert(scrolled > 0, "It is far along its row");
        elsewhere.click();
        await app.settle();
        assert(app.document.querySelector(".screen-search"), "A title not on this server opens a search for it");
        app.press(BACK);
        await app.settle();
        assert.strictEqual(Array.prototype.indexOf.call(app.document.activeElement.parentNode.children, app.document.activeElement), at2, "Back returns to its card");
        assert.strictEqual(app.document.activeElement.parentNode, app.rows()[1]);
        assert.strictEqual(app.rows()[1].scrollLeft, scrolled, "with the row where it was");

        // Back from the people row itself: one level up.
        app.peopleCards()[1].focus();
        await app.rest();
        assert.strictEqual(app.name(), "Actor 2");
    } finally { app.close(); }

    // A long list is read through every page, and a title on any page counts as on this server.
    var long = [];
    for (at = 0; at < 120; at += 1) { long.push({ ratingKey: String(1000 + at), title: "Long " + at, year: 2000 }); }
    var paged = harness({ list: function () { return long.map(listed); }, career: function () {
        return [{ title: "Actor", type: "actor", Credit: [{ role: "Late", Metadata: { ratingKey: "guid1119", title: "Long 119" } }, { role: "Away", Metadata: { ratingKey: "absent", title: "Away" } }] }];
    } });
    try {
        paged.journey.openPerson(person(1), paged.window.__synthetic.client);
        await paged.settle();
        assert.strictEqual(paged.calls.filter(function (call) { return /^person/.test(call); }).length, 3, "Three pages of titles");
        assert.strictEqual(paged.rows().length, 2, "with one title elsewhere");
        assert.strictEqual(paged.cards(1).length, 1);
        assert.strictEqual(paged.cards(0).length, 30, "and the long row built a stretch at a time");
        paged.cards(0)[25].focus();
        var grown = paged.cards(0);
        assert.strictEqual(grown.length, 60, "growing as the cursor nears its end");
    } finally { paged.close(); }
}

async function readMoreAndPersonPage() {
    var longText = "A long biography. ".repeat(40);
    var app = harness({ list: function () { return []; }, profile: function () { return { summary: longText, bornAt: "1961-04-12", birthPlace: "A Coastal Town", diedAt: "2021-01-30" }; } });
    Object.defineProperty(app.window.Element.prototype, "scrollHeight", { configurable: true, get: function () { return /person-biography/.test(this.className) ? 400 : 0; } });
    Object.defineProperty(app.window.Element.prototype, "clientHeight", { configurable: true, get: function () { return /person-biography/.test(this.className) ? 120 : 0; } });
    try {
        app.journey.openCast({ ratingKey: "9", title: "Own", Role: [person(1)] }, app.window.__synthetic.client);
        await app.settle();
        var facts = Array.from(app.document.querySelectorAll(".person-fact")).map(function (node) { return node.textContent; });
        assert.deepStrictEqual(facts, ["Born 1961-04-12", "A Coastal Town", "Died 2021-01-30"]);
        var more = app.document.querySelector(".person-more button");
        assert(more, "A biography too long for its lines has Read more");
        app.press(UP);
        assert.strictEqual(app.document.activeElement, more, "above the people when there are no titles");
        app.press(LEFT);
        app.press(RIGHT);
        assert.strictEqual(app.document.activeElement, more, "Nothing lies beside it");
        more.click();
        assert.strictEqual(app.document.querySelector(".overview-text").textContent, longText, "The whole text");
        app.press(BACK);
        assert.strictEqual(app.document.activeElement, more, "Back closes it and returns there");
        assert(app.document.querySelector(".screen-cast"), "on the same page");
    } finally { app.close(); }

    // Someone with no biography keeps the page's shape, and says so.
    var quiet = harness({ list: function () { return []; }, profile: function () { return {}; } });
    try {
        quiet.journey.openCast({ ratingKey: "9", title: "Own", Role: [person(1)] }, quiet.window.__synthetic.client);
        await quiet.settle();
        assert.strictEqual(quiet.document.querySelector(".person-more button"), null);
        assert.strictEqual(quiet.document.querySelector(".person-no-biography").textContent, "No biography available.");
        assert.strictEqual(quiet.document.querySelector(".empty-state").textContent, "No available items in this view.");
        assert.strictEqual(quiet.focused(), "Actor 1", "The cursor stays on the person");
        quiet.press(UP);
        quiet.press(OK);
        assert.strictEqual(quiet.focused(), "Actor 1", "with nowhere to go");
    } finally { quiet.close(); }

    // A person from search: the same page without the row, the cursor on their first title.
    var searched = harness({ list: function () { return [listed({ ratingKey: "300", title: "Found", year: 1999 })]; }, titles: { 300: { ratingKey: "300", Role: [{ id: 901, role: "Lead" }] } } });
    try {
        searched.journey.openPerson(person(1), searched.window.__synthetic.client);
        await searched.settle();
        assert(searched.document.querySelector(".screen-person"));
        assert.strictEqual(searched.document.querySelector(".cast-row"), null, "No row of people");
        assert.strictEqual(searched.focused(), "Found", "The cursor is on their first title");
        assert.strictEqual(searched.caption(0), "as Lead", "with who they played");
        assert.strictEqual(searched.document.querySelector(".person-credit").textContent, "", "No title of the page's own to name a character for");
        searched.document.activeElement.click();
        await searched.settle();
        searched.press(BACK);
        await searched.settle();
        assert.strictEqual(searched.focused(), "Found", "Back returns to it");
    } finally { searched.close(); }

    // No plex.tv link: titles only, with nothing said about what is missing.
    var alone = harness({ noAccount: true, list: function () { return [listed({ ratingKey: "300", title: "Found", year: 1999 })]; } });
    try {
        alone.journey.openPerson(person(1), alone.window.__synthetic.client);
        await alone.settle();
        assert.strictEqual(alone.document.querySelector(".person-biography"), null);
        assert.strictEqual(alone.document.getElementById("status").textContent, "");
        assert.strictEqual(alone.rows().length, 1);
    } finally { alone.close(); }

    // plex.tv refused: the server's titles still show, and the character is read from them instead.
    var refused = harness({ careerFails: true, list: function () { return [listed({ ratingKey: "300", title: "Found", year: 1999 })]; }, titles: { 300: { ratingKey: "300", Role: [{ id: 901, role: "Lead" }] } } });
    try {
        refused.journey.openPerson(person(1), refused.window.__synthetic.client);
        await refused.settle();
        assert.strictEqual(refused.caption(0), "as Lead");
        assert.strictEqual(refused.document.getElementById("status").className.indexOf("status-error"), -1, "It is not an error");
    } finally { refused.close(); }

    // The server's list failing is an error, with a way to try again that asks again.
    var broken = harness({ personFails: true });
    try {
        broken.journey.openCast({ ratingKey: "9", title: "Own", Role: [person(1)] }, broken.window.__synthetic.client);
        await broken.settle();
        assert(broken.document.getElementById("status").className.indexOf("status-error") !== -1, "The failure shows");
        var retry = broken.document.querySelector(".route-retry");
        assert(retry, "with Retry");
        broken.press(UP);
        assert.strictEqual(broken.document.activeElement, retry, "which the cursor can reach");
        broken.reset();
        retry.click();
        await broken.settle();
        assert.strictEqual(broken.calls.filter(function (call) { return /^person/.test(call); }).length, 1, "and asks again");
    } finally { broken.close(); }

    // Forgetting (playing or marking something): the next visit asks again, so watched marks are right.
    var again = harness({ list: function () { return []; } });
    try {
        var title = { ratingKey: "9", title: "Own", Role: [person(1)] };
        again.journey.openCast(title, again.window.__synthetic.client);
        await again.settle();
        again.reset();
        again.journey.openCast(title, again.window.__synthetic.client);
        await again.settle();
        assert.strictEqual(again.calls.filter(function (call) { return /^person/.test(call); }).length, 0, "Remembered");
        again.journey.forget();
        again.journey.openCast(title, again.window.__synthetic.client);
        await again.settle();
        assert.strictEqual(again.calls.filter(function (call) { return /^person/.test(call); }).length, 1, "Forgotten");
    } finally { again.close(); }
}

async function theStylesheet() {
    var css = fs.readFileSync(path.join(app, "css/style.css"), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
    function rule(selector) {
        var match = new RegExp("(?:^|\\})\\s*" + selector.replace(/[.\[\]"=]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(css);
        assert(match, "No rule for " + selector);
        return match[1];
    }
    assert(/object-fit:\s*contain/.test(rule(".person-portrait")), "The photo is shown whole");
    assert(!/50%/.test(rule(".person-portrait")), "not in a circle");
    assert(/white-space:\s*normal/.test(rule(".person-row .card-title,\n.person-row .card-meta")), "Titles wrap rather than cut to a few letters");
    assert(/height/.test(rule(".person-row .card-title")) && /height/.test(rule(".person-row .card-meta")), "Each line has its height reserved");
    assert(!/-webkit-box/.test(rule(".cast-row .detail-person")) && /position:\s*relative/.test(rule(".cast-row .detail-person")),
        "The person's photo is placed by hand: a button is no flex container on the older engines");
    [".person-panel", ".person-side", ".person-main", ".person-rows", ".person-track", ".cast-people", ".person-row .media-card", ".person-row .poster"].forEach(function (selector) {
        assert(!/filter|backdrop/.test(rule(selector)), selector + " draws with no filter or blur");
    });
}

(async function () {
    await theOnePage();
    await whoTheyPlayed();
    await rowsOfTitles();
    await readMoreAndPersonPage();
    await theStylesheet();
    console.log("Tizen cast page, person page, who they played and rows of titles: passed");
}()).catch(function (error) { console.error(error); process.exitCode = 1; });
