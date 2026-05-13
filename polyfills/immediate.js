'use strict';

// Replacement for the `immediate` npm package (transitive via lie -> jszip).
// The original ships an IE-era polyfill that creates <script> elements to
// schedule microtasks, which trips automated plugin scanners. queueMicrotask
// is the native equivalent and is the correct primitive for lie's Promise
// microtask scheduler.
module.exports = function immediate(task) {
    queueMicrotask(task);
};
