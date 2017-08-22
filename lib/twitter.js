'use strict';

// Load modules

var Entities = require('entities');
var Hoek = require('hoek');
var Items = require('items');
var Wreck = require('wreck');

// Declare internals

var internals = {
    tweetRegx: /^https?\:\/\/twitter\.com\/[^\/]+\/status\//
};

exports.isTweet = function (url) {

    return !!url.match(internals.tweetRegx);
};

/*
    card                    // The card type
    site                    // @username of website. Either twitter:site or twitter:site:id is required.
    site:id                 // Same as twitter:site, but the user’s Twitter ID. Either twitter:site or twitter:site:id is required.
    domain                  // Display name for the site.
    creator                 // @username of content creator (summary_large_image).
    creator:id              // Twitter user ID of content creator (summary, summary_large_image).
    description             // Description of content, maximum 200 characters, (summary, summary_large_image, player). Same as og:description.
    title                   // Title of content, max 70 characters, (summary, summary_large_image, player). Same as og:title.
    image                   // URL of image to use in the card. Image must be less than 1MB in size (summary, summary_large_image, player). Same as og:image.
    image:alt               // A text description of the image conveying the essential nature of an image to users who are visually impaired (summary, summary_large_image, player).

    player                  // HTTPS URL of player iframe (player).
    player:width            // Width of iframe in pixels (player).
    player:height           // Height of iframe in pixels (player).
    player:stream           // URL to raw video or audio stream (player).

    app:name:iphone         // Name of your iPhone app (app).
    app:id:iphone           // Your app ID in the iTunes App Store. Note: NOT your bundle ID (app).
    app:url:iphone          // Your app’s custom URL scheme. You must include “://” after your scheme name (app).

    app:name:ipad           // Name of your iPad optimized app (app).
    app:id:ipad             // Your app ID in the iTunes App Store (app).
    app:url:ipad            // Your app’s custom URL scheme (app).

    app:name:googleplay     // Name of your Android app (app).
    app:id:googleplay       // Your app ID in the Google Play Store (app).
    app:url:googleplay      // Your app’s custom URL scheme (app).
*/

exports.describe = function (tags) {

    var properties = {};
    for (var i = 0; i < tags.length; ++i) {
        var tag = tags[i];
        var key = tag.key;
        var sub = tag.sub;

        switch (key) {

            // Flat attributes

            case 'card':
            case 'description':
            case 'title':
            case 'domain':
                properties[key] = tag.value;
                break;

            // Id attributes

            case 'site':
            case 'creator':
                if (!sub || sub === 'id') {

                    properties.twitter = properties.twitter || {};
                    properties.twitter[key + (sub ? '_id' : '_username')] = tag.value;
                }
                break;

            // Single level object attributes

            case 'image':
            case 'player':
                if (!sub || ['width', 'height', 'stream', 'src', 'url', 'alt'].indexOf(sub) !== -1) {

                    if (sub === 'width' || sub === 'height') {

                        tag.value = parseInt(tag.value, 10);
                        if (isNaN(tag.value)) {
                            continue;
                        }
                    }

                    properties[key] = properties[key] || {};
                    properties[key][sub ? sub === 'src' ? 'url' : sub : 'url'] = tag.value;
                }
                break;

            // Two level object attributes

            case 'app':
                if (sub) {
                    var parts = sub.split(':');
                    var property = parts[0];
                    var device = parts[1];
                    if (['iphone', 'ipad', 'googleplay'].indexOf(device) !== -1 && ['name', 'id', 'url'].indexOf(property) !== -1) {

                        properties.app = properties.app || {};
                        properties.app[device] = properties.app[device] || {};
                        properties.app[device][property] = tag.value;
                    }
                }
                break;
        }
    }

    ['player', 'image'].forEach(function (key) {

        if (properties[key] && !properties[key].url) {

            delete properties[key];
        }
    });

    return properties;
};

//                                              1                  2        3                 4
internals.htmlRegx = /^<blockquote[^>]*><p[^>]*>(.+)<\/p>\&mdash\; (.+) \(\@([^)]+)\) <a[^>]*>(.+)<\/a><\/blockquote>/;

exports.tweet = function (description, next) {

    if (!exports.isTweet(description.url) || !description.embed || !description.embed.html) {

        return next();
    }

    var parts = description.embed.html.match(internals.htmlRegx);
    if (!parts) {
        return next();
    }

    var tcos = [];
    var content = parts[1].replace(/<br>/g, '\n').replace(/<a[^>]*>([^<]+)<\/a>/g, function ($0, $1) {

        var url = $1;
        if ($1.indexOf('https://t.co/') !== 0) {
            return url;
        }

        tcos.push({ url: url, pos: tcos.length });
        return '<<' + (tcos.length - 1) + '>>';
    });

    var tweet = {
        name: Entities.decodeHTML(parts[2]),
        username: Entities.decodeHTML(parts[3]),
        content: content,
        date: parts[4],
        links: {}
    };

    var avatar = description.avatar || description.image && description.image.url || null;
    if (avatar) {
        tweet.avatar = avatar;
    }

    if (description.image && avatar !== description.image.url) {

        tweet.image = description.image.url;
    }

    if (!tcos.length) {
        tweet.content = Entities.decodeHTML(tweet.content);
        return next(tweet);
    }

    var resolve = function resolve(tco, done) {

        internals.long(tco.url, function (headers) {

            var destination = headers.location || tco.url;
            tweet.content = Entities.decodeHTML(tweet.content.replace('<<' + tco.pos + '>>', destination));
            if (destination !== tco.url) {
                tweet.links[destination] = tco.url;
            }

            return done();
        });
    };

    Items.parallel(tcos, resolve, function () {
        return next(tweet);
    });
};

internals.long = function (url, callback) {

    Wreck.request('HEAD', url, {}, function (err, res) {

        if (err || res.statusCode >= 400) {

            return callback({});
        }

        Wreck.read(res, null, Hoek.ignore); // Flush out any payload
        return callback(res.headers);
    });
};
