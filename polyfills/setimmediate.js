'use strict';

// Replacement for the `setimmediate` npm package (jszip dependency).
// The original ships an IE-era polyfill that creates <script> elements to
// schedule callbacks, which trips automated plugin scanners. Modern Chromium
// (Obsidian's runtime) has setImmediate via Node integration; even when it
// doesn't, setTimeout(fn, 0) is the correct macrotask substitute for jszip's
// "yield to the event loop" usage.
if (typeof globalThis.setImmediate === 'undefined') {
    globalThis.setImmediate = function setImmediate(fn) {
        var args = arguments.length > 1
            ? Array.prototype.slice.call(arguments, 1)
            : [];
        return setTimeout.apply(null, [fn, 0].concat(args));
    };
    globalThis.clearImmediate = function clearImmediate(handle) {
        clearTimeout(handle);
    };
}
