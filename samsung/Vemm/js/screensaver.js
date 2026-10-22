(function (root, factory) {
    var api = factory(root);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmScreensaver = api; }
}(this, function (root) {
    "use strict";

    // The TV's screensaver is off while keepAwake(true) (video is playing) and back to its default (on)
    // otherwise. Missing or failing APIs (other TVs, browsers) are ignored: playback never depends on this.
    // Only a change is sent; a failed call is retried by the next one.
    function create(options) {
        var current = null;
        return {
            keepAwake: function (awake) {
                awake = !!awake;
                if (awake === current) { return; }
                var common = (options && options.webapis || root.webapis || {}).appcommon;
                var states = common && common.AppCommonScreenSaverState;
                if (!common || typeof common.setScreenSaver !== "function" || !states) { return; }
                current = awake;
                try {
                    common.setScreenSaver(awake ? states.SCREEN_SAVER_OFF : states.SCREEN_SAVER_ON, function () {}, function () {
                        if (current === awake) { current = null; }
                    });
                } catch (error) { current = null; }
            }
        };
    }

    return { create: create, keepAwake: create().keepAwake };
}));
