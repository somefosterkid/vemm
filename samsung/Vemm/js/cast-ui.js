(function (root) {
    "use strict";
    // One page for the people on a title: a row of them along the bottom, and above it whoever is chosen, with their
    // photo, details, biography and titles. A person found by search gets the same page without the row.
    // Nothing is asked for a person the cursor only passes over: their part of the page is drawn when it rests (REST).
    // Character names are never waited for: they come from the page's own title, a remembered one or the person's
    // filmography, and otherwise from reading the titles near the screen, a few at a time (readCharacters).
    var REST = 350;
    var CARDS_AT_ONCE = 30;
    var READ_AT_ONCE = 4;
    var PEOPLE_KEPT = 12;

    function position(node) { return Array.prototype.indexOf.call(node.parentNode.children, node); }

    root.VemmCastUi = {
        create: function (options) {
            var element = options.element;
            var translate = options.translate;
            var screen = options.screen;
            var credits = root.VemmPeople.memory(100);
            var kept = [];

            function creditLine(credit) {
                if (!credit) { return ""; }
                if (credit.character) { return translate("as {character}", { character: credit.character }); }
                return (credit.jobs || []).map(function (job) { return translate(job); }).join(" · ");
            }

            // What the server and plex.tv say of a person, as each arrives, and kept: going back to someone asks nothing.
            // Each read ends in a value; null when it could not be had, and then the person is asked again next time.
            function lookUp(client, person) {
                var id = String(person.id || person.tagKey || person.tag);
                var found = kept.filter(function (entry) { return entry.client === client && entry.id === id; })[0];
                if (found) { return found; }
                var entry = { client: client, id: id, reads: {} };
                function read(field, promise, value) {
                    entry.reads[field] = promise.then(function (answer) {
                        entry[field] = value(answer);
                        return entry[field];
                    }).catch(function (error) {
                        kept = kept.filter(function (other) { return other !== entry; });
                        if (field === "titles") { entry.failure = error; } else { options.log(options.errorText(error)); }
                        entry[field] = null;
                        return null;
                    });
                }
                read("titles", person.id ? options.allPages(function (start) { return client.getPerson(null, person.id, start); }) : Promise.resolve([]),
                    function (list) { return list; });
                var account = options.account();
                if (account && person.tagKey) {
                    read("profile", account.personProfile(person.tagKey), function (container) { return (container.Metadata || [])[0] || {}; });
                    read("career", account.personCredits(person.tagKey), function (groups) { return groups; });
                } else {
                    entry.profile = null;
                    entry.career = null;
                }
                kept = [entry].concat(kept).slice(0, PEOPLE_KEPT);
                return entry;
            }

            // view: { client, title, people, person, place }, kept for Back: the person and place change as the viewer moves.
            function page(view) {
                var client = view.client;
                var generation = options.begin(view.people ? "cast" : "person", client, function () { page(view); }, leave, step);
                var shown = null;
                var answers = 0;
                var failed = false;
                var rows = [];
                var titlesRow = null;
                var trackRow = null;
                var peopleRow = null;
                var shownCard = null;
                var readMore = null;
                var backButton = null;
                var landing = false;
                var restTimer = null;
                var readTimer = null;
                var reading = false;
                var read = {};
                // A person's rows stay until the next person's arrive, so the page does not blink.
                var rowsCurrent = false;

                var panel = element("div", "person-panel");
                var side = element("div", "person-side");
                var portrait = element("img", "person-portrait");
                portrait.alt = "";
                side.appendChild(portrait);
                var facts = element("div", "person-facts");
                side.appendChild(facts);
                var main = element("div", "person-main");
                var nameLine = element("h2", "person-name");
                var creditLineNode = element("p", "person-credit");
                var about = element("div", "person-about");
                var moreBox = element("div", "person-more");
                var rowsBox = element("div", "person-rows");
                var track = element("div", "person-track");
                rowsBox.appendChild(track);
                [nameLine, creditLineNode, about, moreBox, rowsBox].forEach(function (node) { main.appendChild(node); });
                panel.appendChild(side);
                panel.appendChild(main);
                screen.appendChild(panel);

                function current() { return generation === options.generation(); }

                // A long row is built a stretch at a time, ahead of the cursor. moved: the row's own use of a focus change.
                function fill(row, entries, make, start, moved) {
                    var drawn = 0;
                    function grow(count) {
                        entries.slice(drawn, drawn + count).forEach(function (entry) { make(row, entry); });
                        drawn = Math.min(entries.length, drawn + count);
                    }
                    grow(Math.max(CARDS_AT_ONCE, start + 10));
                    row.addEventListener("focus", function (event) {
                        row.vemmEntry = event.target;
                        if (drawn < entries.length && position(event.target) > drawn - 10) { grow(CARDS_AT_ONCE); }
                        if (moved) { moved(event.target); }
                        options.scheduleArt();
                    }, true);
                }

                // The rows of titles move as one, the focused row at the top of their box. While that glides the row is
                // still out of view, so the browser scrolls the box to the focus as well; that is undone.
                function focusInRow(row, target) {
                    if (row !== peopleRow && rows.indexOf(row) !== -1) {
                        trackRow = row;
                        var y = row.parentNode.offsetTop;
                        track.style.webkitTransform = track.style.transform = y ? "translate3d(0," + (-y) + "px,0)" : "";
                    }
                    target.focus();
                    rowsBox.scrollTop = 0;
                }

                function restore(row) {
                    var place = view.place;
                    view.place = null;
                    row.scrollLeft = place.scroll;
                    focusInRow(row, row.children[place.at] || row.firstChild);
                }

                function addRow(rowName, heading, entries, make, moved) {
                    var section = element("section", "person-titles");
                    section.appendChild(element("h3", "detail-section-title", heading));
                    var row = element("div", "shelf-row person-row");
                    row.vemmName = rowName;
                    var returning = view.place && view.place.row === rowName;
                    fill(row, entries, make, returning ? view.place.at : 0, moved);
                    section.appendChild(row);
                    track.appendChild(section);
                    rows.push(row);
                    if (returning) { restore(row); return row; }
                    if (landing && peopleRow && document.activeElement && document.activeElement.parentNode === peopleRow) {
                        landing = false;
                        focusStop(row);
                    } else if (!peopleRow && document.activeElement === screen) { focusStop(row); }
                    return row;
                }

                function replaceRows() {
                    rowsCurrent = true;
                    rows.forEach(function (row) {
                        Array.prototype.forEach.call(row.children, function (node) { node.vemmArt.image.vemmFar = true; });
                    });
                    rows = [];
                    titlesRow = null;
                    trackRow = null;
                    while (track.firstChild) { track.removeChild(track.firstChild); }
                    track.style.webkitTransform = track.style.transform = "";
                }

                function captionOf(item) {
                    var known = credits.of(item.ratingKey, shown);
                    if (!known) {
                        var remembered = options.recall(client, item.ratingKey);
                        if (remembered) { credits.learn(remembered.item); known = credits.of(item.ratingKey, shown); }
                    }
                    return creditLine(known) || String(item.year || "");
                }

                function fillCaptions() {
                    if (!titlesRow) { return; }
                    Array.prototype.forEach.call(titlesRow.children, function (node) {
                        var text = captionOf(node.vemmCard.item);
                        if (node.vemmMeta.textContent !== text) { node.vemmMeta.textContent = text; }
                    });
                }

                // The titles near the screen that nothing has answered for, one read at a time. Leaving cancels it (clear).
                function readCharacters() {
                    readTimer = null;
                    if (!current() || reading || restTimer !== null || !titlesRow) { return; }
                    var width = window.innerWidth || 1280;
                    var keys = [];
                    Array.prototype.forEach.call(titlesRow.children, function (node) {
                        var key = node.vemmCard.item.ratingKey;
                        if (keys.length === READ_AT_ONCE || read[key] || credits.of(key, shown)) { return; }
                        var box = node.getBoundingClientRect();
                        if (box.left < 1.5 * width && box.right > -0.5 * width) { keys.push(key); }
                    });
                    if (!keys.length) { return; }
                    reading = true;
                    keys.forEach(function (key) { read[key] = true; });
                    client.titleCredits(keys).then(function (titles) {
                        titles.forEach(credits.learn);
                    }).catch(function () { /* the card keeps its year */ }).then(function () {
                        reading = false;
                        if (!current()) { return; }
                        fillCaptions();
                        readCharacters();
                    });
                }

                function readSoon() {
                    clearTimeout(readTimer);
                    readTimer = setTimeout(readCharacters, REST);
                }

                function drawTitles(list, entry) {
                    replaceRows();
                    if (!list) {
                        failed = true;
                        options.status(options.errorText(entry.failure), true);
                        return;
                    }
                    var own = view.title && String(view.title.ratingKey);
                    function isOwn(item) { return String(item.ratingKey) === own; }
                    var items = list.filter(function (item) { return !isOwn(item); }).concat(list.filter(isOwn));
                    if (!items.length) { return; }
                    titlesRow = addRow("titles", translate("On this server"), items, function (row, item) {
                        options.card(row, item, client, null, { lazy: true, caption: captionOf(item) });
                    }, readSoon);
                    options.syncArt();
                }

                // A title on this server is already in the row above: its credit gives that card its caption. The rest
                // get a row for each job, with what the person did on them.
                function drawCareer(groups, entry) {
                    var person = shown;
                    var local = entry.titles && window.PlexApi.localCatalogueIndex(entry.titles);
                    (groups || []).forEach(function (group, at) {
                        var crew = group.type && group.type !== "actor" && group.type !== "appeared";
                        var others = [];
                        (group.Credit || []).forEach(function (line) {
                            if (!line.Metadata) { return; }
                            var key = local && window.PlexApi.matchCredit(local, line.Metadata.ratingKey);
                            if (!key) { others.push(line); return; }
                            var job = line.role || group.title;
                            if (crew && job) { credits.note(key, person, { jobs: [job] }); }
                            else if (!crew && line.role) { credits.note(key, person, { character: line.role }); }
                        });
                        if (!others.length) { return; }
                        addRow("career" + at, group.title || translate("Credits"), others, function (row, line) {
                            var title = line.Metadata;
                            // No ratingKey on the item: this card has no actions of its own, and what the catalogue
                            // calls its ratingKey is not this server's.
                            options.card(row, { title: title.title, year: title.year, thumb: title.thumb }, client, null, {
                                lazy: true,
                                caption: (crew ? line.role : line.role && translate("as {character}", { character: line.role })) || String(title.year || ""),
                                open: function () { options.visit(function () { options.openSearch(title.title); }); }
                            });
                        });
                    });
                    options.syncArt();
                    fillCaptions();
                    readCharacters();
                }

                function drawProfile(profile) {
                    if (!profile) { return; }
                    [profile.bornAt && translate("Born {date}", { date: profile.bornAt }), profile.birthPlace,
                        profile.diedAt && translate("Died {date}", { date: profile.diedAt })].forEach(function (fact) {
                        if (fact) { facts.appendChild(element("p", "person-fact", fact)); }
                    });
                    if (!profile.summary) {
                        about.appendChild(element("p", "person-no-biography", translate("No biography available.")));
                        return;
                    }
                    var text = element("p", "synopsis person-biography", profile.summary);
                    about.appendChild(text);
                    // Only a biography too long for its lines has more to read.
                    if (text.scrollHeight > text.clientHeight) {
                        var person = shown;
                        readMore = options.button(moreBox, "Read more", function () {
                            options.overview({ title: person.tag, summary: profile.summary }, readMore);
                        });
                        readMore.className = "detail-pill";
                    }
                }

                function answered() {
                    answers -= 1;
                    if (answers) { return; }
                    if (!failed) { options.status(""); }
                    if (!rows.length && !failed) {
                        rowsBox.appendChild(element("p", "empty-state", translate("No available items in this view.")));
                        // A person with nothing to show keeps a way back.
                        if (!peopleRow && !readMore) { backButton = options.button(rowsBox, "Back", options.back); }
                    }
                    if (options.restoring() || document.activeElement === screen) { options.focus(); }
                }

                function show(person) {
                    shown = view.person = person;
                    rowsCurrent = false;
                    landing = false;
                    failed = false;
                    read = {};
                    if (shownCard) { shownCard.removeAttribute("aria-current"); }
                    shownCard = null;
                    if (peopleRow) {
                        Array.prototype.forEach.call(peopleRow.children, function (node) {
                            if (node.vemmPerson === person) { shownCard = node; }
                        });
                        if (shownCard) { shownCard.setAttribute("aria-current", "true"); }
                    }
                    nameLine.textContent = person.tag || translate("Person");
                    creditLineNode.textContent = view.title ? creditLine(credits.of(view.title.ratingKey, person)) : "";
                    readMore = null;
                    backButton = null;
                    [facts, about, moreBox].forEach(function (node) { while (node.firstChild) { node.removeChild(node.firstChild); } });
                    Array.prototype.slice.call(rowsBox.children).forEach(function (node) { if (node !== track) { rowsBox.removeChild(node); } });
                    // A new picture for each person, so a late answer for the last one finds nothing to draw on. The row's
                    // small one stands in until it comes.
                    var image = element("img", "person-portrait");
                    image.alt = "";
                    var face = shownCard && shownCard.vemmArt.image;
                    image.src = face && face.getAttribute("data-artwork-state") === "loaded" ? face.src : options.placeholder();
                    portrait.vemmFar = true;
                    side.replaceChild(image, portrait);
                    portrait = image;
                    options.queueImage(image, client, person.thumb, { width: 440, height: 440 }, undefined, undefined, true);

                    options.status("Loading...");
                    var entry = lookUp(client, person);
                    answers = 3;
                    function here() { return current() && shown === person; }
                    function arrive(field, draw) {
                        if (entry[field] !== undefined) { draw(entry[field], entry); answered(); return; }
                        entry.reads[field].then(function (answer) {
                            if (here()) { draw(answer, entry); answered(); }
                        });
                    }
                    arrive("titles", function (list) {
                        drawTitles(list, entry);
                        arrive("career", drawCareer);
                    });
                    arrive("profile", drawProfile);
                }

                function choose(person) {
                    clearTimeout(restTimer);
                    restTimer = null;
                    if (person !== shown) {
                        view.place = null;
                        show(person);
                    }
                }

                function focusStop(stop) {
                    focusInRow(stop, stop.tagName === "BUTTON" ? stop : stop.vemmEntry || stop.firstChild);
                }

                // OK or Up on a person goes to what is theirs, now or when it arrives.
                function enter(person) {
                    choose(person);
                    var above = stops().filter(function (stop) { return stop !== peopleRow; });
                    var target = trackRow || rows[0] || above[0];
                    if (rowsCurrent && target) { focusStop(target); } else { landing = true; }
                }

                // Down the page: Read more, the rows of titles, then the row of people. Every other key is the row's own.
                function stops() {
                    var retry = screen.querySelector(".route-retry");
                    return (readMore ? [readMore] : []).concat(rows, retry ? [retry] : [], backButton ? [backButton] : [], peopleRow ? [peopleRow] : []);
                }

                function step(active, key) {
                    if (key === 37 || key === 39) { return true; }
                    var row = active.parentNode;
                    if (peopleRow && row === peopleRow) {
                        if (key === 38) { enter(active.vemmPerson); }
                        return true;
                    }
                    var all = stops();
                    var at = all.indexOf(rows.indexOf(row) !== -1 ? row : active);
                    var next = at < 0 ? all[0] : all[at + (key === 40 ? 1 : -1)];
                    if (next) { focusStop(next); }
                    return true;
                }

                // Clearing the page ends here, before anything is removed: Back returns to this place.
                function leave() {
                    clearTimeout(restTimer);
                    clearTimeout(readTimer);
                    var active = document.activeElement;
                    var row = active && active.parentNode;
                    view.place = row && row.vemmName ? { row: row.vemmName, at: position(active), scroll: row.scrollLeft } : null;
                    view.peopleScroll = peopleRow ? peopleRow.scrollLeft : 0;
                }

                var returningTo = view.place && view.place.row;
                if (view.title) { credits.learn(view.title); }
                // A cast page puts the cursor back itself (view.place); the other pages count controls as usual.
                if (view.people || view.place) { options.restored(); }
                if (view.people) {
                    var label = element("div", "cast-label");
                    label.appendChild(element("p", "cast-label-title", translate("Cast & Crew")));
                    label.appendChild(element("p", "cast-label-of", view.title.title || ""));
                    side.appendChild(label);
                    var strip = element("section", "cast-people");
                    peopleRow = element("div", "detail-cast-row cast-row person-row");
                    peopleRow.vemmName = "people";
                    fill(peopleRow, view.people, function (row, person) {
                        var known = credits.of(view.title.ratingKey, person) || {};
                        options.personCard(row, person, client, known.character || (known.jobs || []).map(function (job) { return translate(job); }).join(" · "), true,
                            function () { enter(person); }).vemmPerson = person;
                    }, returningTo === "people" ? view.place.at : view.people.indexOf(view.person), function (node) {
                        clearTimeout(restTimer);
                        restTimer = null;
                        if (node.vemmPerson !== shown) { restTimer = setTimeout(function () { choose(node.vemmPerson); }, REST); }
                        else { readCharacters(); }
                    });
                    strip.appendChild(peopleRow);
                    screen.appendChild(strip);
                    peopleRow.scrollLeft = view.peopleScroll || 0;
                }
                if (!peopleRow) { options.parkFocus(); }
                show(view.person);
                options.syncArt();
                if (peopleRow) {
                    peopleRow.vemmEntry = shownCard;
                    if (returningTo === "people") { restore(peopleRow); }
                    // The person holds the cursor until the row it is going back to arrives.
                    else if (!returningTo || view.place) { (shownCard || peopleRow.firstChild).focus(); }
                }
            }

            return {
                // Everyone on a title once, whatever they did on it.
                cast: function (title, client, people, person) {
                    var seen = {};
                    var unique = people.filter(function (entry) {
                        var key = entry.id || entry.tagKey || entry.tag;
                        if (seen[key]) { return false; }
                        seen[key] = entry;
                        return true;
                    });
                    var chosen = person && seen[person.id || person.tagKey || person.tag];
                    page({ client: client, title: title, people: unique, person: chosen || unique[0] });
                },
                person: function (person, client) { page({ client: client, person: person }); },
                forget: function () { kept = []; credits.forget(); }
            };
        }
    };
}(this));
