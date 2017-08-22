'use strict';

// Load modules

var Joi = require('joi');

// Declare internals

var internals = {
    subs: {
        image: 'url',
        audio: 'url',
        video: 'url',
        locale: 'primary'
    },
    tags: {
        article: ['published_time', 'modified_time', 'expiration_time', 'section', 'tag'], // author
        audio: ['url', 'secure_url', 'type'],
        book: ['isbn', 'release_date', 'tag'], // author
        description: true,
        determiner: true,
        image: ['url', 'secure_url', 'width', 'height', 'type'],
        locale: ['primary', 'alternate'],
        music: ['duration', 'release_date'], // album, album:disk, album:track, musician, song, song:disc, song:track, creator
        profile: ['first_name', 'last_name', 'username', 'gender'],
        restrictions: ['age', 'country:allowed', 'country:disallowed', 'content'],
        rich_attachment: true,
        see_also: true,
        site_name: true,
        title: true,
        ttl: true,
        type: true,
        updated_time: true,
        url: true,
        video: ['url', 'secure_url', 'width', 'height', 'type', 'tag', 'duration', 'release_date'] // actor, actor:role, director, writer, series
    },
    types: ['article', 'book', 'books.author', 'books.book', 'books.genre', 'business.business', 'fitness.course', 'game.achievement', 'music', 'music.album', 'music.playlist', 'music.radio_station', 'music.song', 'photo', 'place', 'product', 'product.group', 'product.item', 'profile', 'restaurant', 'restaurant.menu', 'restaurant.menu_item', 'restaurant.menu_section', 'restaurant.restaurant', 'video', 'video.episode', 'video.movie', 'video.other', 'video.tv_show', 'website']
};

internals.urlRule = Joi.string().uri({ scheme: ['http', 'https'] });

exports.describe = function (tags) {

    var properties = {};
    var last = null;
    for (var i = 0; i < tags.length; ++i) {
        var tag = tags[i];
        var key = tag.key;
        var sub = tag.sub;
        var value = tag.value;

        var objectKey = internals.subs[key];
        if (!sub) {
            sub = objectKey;
        } else if (['width', 'height', 'duration', 'age'].indexOf(sub) !== -1) {
            value = parseInt(value, 10);
            if (isNaN(value)) {
                last = null;
                continue;
            }
        }

        // Lookup tag

        var def = internals.tags[key];
        if (!def) {
            last = null;
            continue;
        }

        if (def === true) {
            if (sub) {
                last = null;
                continue;
            }
        } else if (def.indexOf(sub) === -1) {
            last = null;
            continue;
        }

        // Process tag

        if (sub === objectKey) {
            sub = undefined;
        }

        if (sub) {
            if (last === key && objectKey) {

                var object = properties[key];
                if (!object) {
                    last = null;
                    continue;
                }

                var prev = Array.isArray(object) ? object[object.length - 1] : object;
                if (prev[sub] && sub !== 'secure_url') {

                    prev[sub] = [].concat(prev[sub]);
                    prev[sub].push(value);
                } else {
                    if (sub === 'secure_url') {
                        sub = 'url';
                    }

                    prev[sub] = value;
                }
            }
        } else {
            if (objectKey) {
                var _value;

                value = (_value = {}, _value[objectKey] = value, _value);
            }

            if (properties[key]) {
                properties[key] = [].concat(properties[key]);
                properties[key].push(value);
            } else {
                properties[key] = value;
            }
        }

        last = key;
    }

    var found = !!Object.keys(properties).length;

    if (properties.type && properties.type.indexOf(':') !== -1) {

        properties.custom_type = properties.type;
        var parts = properties.custom_type.split(':');
        var lastPart = parts[parts.length - 1];
        properties.type = internals.types.indexOf(lastPart) !== -1 ? lastPart : 'custom';
    } else if (internals.types.indexOf(properties.type) === -1) {
        properties.type = 'website';
    }

    properties.sources = found ? ['ogp'] : [];

    if (properties.url) {
        var result = internals.urlRule.validate(properties.url);
        if (result.error) {
            delete properties.url;
        }
    }

    return properties;
};
