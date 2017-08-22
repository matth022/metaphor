'use strict';

// Load modules


// Declare internals

var internals = {};

exports.parse = function (payload) {

    try {
        return JSON.parse(payload.toString());
    } catch (err) {
        return null;
    }
};

exports.copy = function (from, to, keys, source) {

    to = to || {};
    var used = false;
    keys.forEach(function (key) {

        if (from[key]) {
            to[key] = from[key];
            used = true;
        }
    });

    if (used && source) {

        to.sources.push(source);
    }

    return to;
};
