"use strict";
var assert = require("assert");
var api = require("../../samsung/Vemm/js/plex-api");
var calls = [];
var account = api.createAccountClient({
    token: "synthetic-account-token",
    fetch: function (url, options) {
        calls.push({ url: url, options: options });
        return Promise.resolve({
            ok: true, status: 200,
            json: function () {
                return Promise.resolve({ MediaContainer: url.endsWith("/credits") ?
                    { CreditGroup: [{ title: "Acting", Credit: [{ Metadata: {
                        ratingKey: "5d776827151a60001f24ab18", title: "Catalogue title"
                    } }] }] } : { Metadata: [{ summary: "Synthetic biography" }] } });
            }
        });
    }
});
async function run() {
    var tag = "5d776827151a60001f24ab18";
    var profile = await account.personProfile(tag);
    assert.strictEqual(profile.Metadata[0].summary, "Synthetic biography");
    var groups = await account.personCredits(tag);
    assert.strictEqual(groups[0].Credit[0].Metadata.ratingKey, tag);
    calls.forEach(function (call) {
        assert(call.url.startsWith("https://discover.provider.plex.tv/library/people/"));
        assert.strictEqual(call.options.headers["X-Plex-Token"], "synthetic-account-token");
        assert.strictEqual(call.options.redirect, "error");
        assert(!call.url.includes("token"));
    });
    await assert.rejects(account.personProfile("https://synthetic.invalid"), /catalogue identifier/);
    assert.strictEqual(calls.length, 2);
    var server = api.createClient({
        baseUrl: "https://server.synthetic.invalid",
        token: "synthetic-server-token",
        fetch: function (url, options) {
            var parsed = new URL(url);
            assert.strictEqual(parsed.pathname, "/library/people/921/media");
            assert.strictEqual(parsed.searchParams.get("X-Plex-Container-Start"), "50");
            assert.strictEqual(options.headers["X-Plex-Token"], "synthetic-server-token");
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: [], offset: 50, totalSize: 50 } });
            } });
        }
    });
    await server.getPerson(null, 921, 50);

    var index = api.localCatalogueIndex([
        { type: "movie", guid: "plex://movie/5d776827151a60001f24ab18", ratingKey: 41 },
        { type: "show", guid: "plex://show/5d9c08804eefaa001f5df5fc", ratingKey: "42" },
        { type: "episode", guid: "plex://episode/ep1", ratingKey: "43" },
        { type: "movie", ratingKey: "44" }
    ]);
    assert.strictEqual(api.matchCredit(index, "5d776827151a60001f24ab18"), "41");
    assert.strictEqual(api.matchCredit(index, "5d9c08804eefaa001f5df5fc"), "42");
    assert.strictEqual(api.matchCredit(index, "ep1"), null);
    assert.strictEqual(api.matchCredit(index, ""), null);
    assert.strictEqual(api.matchCredit(index, "toString"), null);

    // Several titles' people in one read, without what a caption has no use for.
    var asked = [];
    var credited = api.createClient({
        baseUrl: "https://server.synthetic.invalid",
        token: "synthetic-server-token",
        fetch: function (url) {
            asked.push(new URL(url));
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: [{ ratingKey: "7", Role: [{ id: 921, role: "Synthetic Role" }] }] } });
            } });
        }
    });
    var titles = await credited.titleCredits(["7", "8"]);
    assert.strictEqual(asked.length, 1, "One read");
    assert.strictEqual(asked[0].pathname, "/library/metadata/7,8", "for all of them");
    assert(/Media/.test(asked[0].searchParams.get("excludeElements")), "without the files");
    assert(!/Role|Director|Writer|Producer/.test(asked[0].searchParams.get("excludeElements")), "but with the people");
    assert.strictEqual(titles[0].Role[0].role, "Synthetic Role");
    assert.throws(function () { credited.titleCredits(["7", "1/../2"]); }, /invalid media identifier/, "Only this server's own keys are read");
    console.log("Tizen person biography/catalogue/local identity and paging tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
