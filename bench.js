'use strict';

var Bench = require('bench');
var Metaphor = require('.');
var Wreck = require('wreck');

var parse = function parse(document) {

    // Grab the head

    var head = document.match(/<head[^>]*>([\s\S]*)<\/head\s*>/);
    if (!head) {
        return [];
    }

    // Remove scripts

    var scripts = head[1].split('</script>'); //     '<script>a</script>something<script>a</script>' -> ['<script>a', 'something<script>a', '']
    var chunks = [];
    scripts.forEach(function (chunk) {

        var pos = chunk.indexOf('<script');
        if (pos !== -1) {
            chunk = chunk.slice(0, pos);
        }

        chunks.push(chunk);
    });

    // Find meta tags

    var elements = [];
    chunks.forEach(function (chunk) {

        var parts = chunk.split('<meta ');
        for (var i = 1; i < parts.length; ++i) {
            elements.push(parts[i].slice(0, parts[i].indexOf('>')));
        }
    });

    var tags = [];
    for (var i = 0; i < elements.length; ++i) {
        var element = elements[i];
        var parsed = element.match(/\s*property\s*=\s*"og:([^":]*)(?:\:([^"]*))?"\s+content\s*=\s*"([^"]*)\s*"/);
        if (parsed) {
            tags.push({ key: parsed[1], sub: parsed[2], value: parsed[3] });
        }
    }

    return tags;
};

var document = void 0;

exports.compare = {
    metaphor: function metaphor(done) {

        Metaphor.parse(document, done);
    },
    custom: function custom(done) {

        parse(document);
        return done();
    }
};

Wreck.get('https://twitter.com/dalmaer/status/726624422237364226', {}, function (ignoreErr1, res, payload) {

    document = payload.toString();
    console.log(Metaphor.parse(document));
    parse(document, function (ignoreErr2, tags) {

        console.log(tags);
        Bench.runMain();
    });
});

