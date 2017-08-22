'use strict';

// Load modules

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Url = require('url');
var Content = require('content');
var Hoek = require('hoek');
var Items = require('items');
var Joi = require('joi');
var Wreck = require('wreck');
var Oembed = require('./oembed');
var Ogp = require('./ogp');
var Providers = require('../providers.json');
var Router = require('./router');
var Tags = require('./tags');
var Twitter = require('./twitter');
var Utils = require('./utils');

// Declare internals

var internals = {};

exports.oembed = { providers: Oembed.providers };

internals.schema = Joi.object({
    maxWidth: Joi.number().integer().min(1),
    maxHeight: Joi.number().integer().min(1),
    maxSize: Joi.number().integer().min(1).allow(false).default(false),
    providers: Joi.array().allow(true, false).default(true),
    whitelist: Joi.array().items(Joi.string()).min(1),
    preview: Joi.func().allow(true, false).default(true),
    css: Joi.string().allow(false),
    script: Joi.string().allow(false),
    redirect: Joi.string(),
    summary: Joi.boolean().default(false),
    tweet: Joi.boolean().default(false)
});

exports.Engine = function () {
    function _class(options) {
        var _this = this;

        _classCallCheck(this, _class);

        this.settings = Joi.attempt(options || {}, internals.schema);
        if (this.settings.providers === true) {
            this.settings.providers = Providers;
        }

        if (this.settings.providers) {
            this.settings.router = Oembed.providers(this.settings.providers);
        }

        if (this.settings.whitelist) {
            this._whitelist = new Router();
            this.settings.whitelist.forEach(function (url) {
                return _this._whitelist.add(url, true);
            });
        }

        if (this.settings.preview === true) {
            this.settings.preview = internals.preview;
        }
    }

    _class.prototype.describe = function describe(url, callback) {

        if (!this._whitelist || this._whitelist.lookup(url)) {

            return this._describe(url, callback);
        }

        return this._preview({ type: 'website', url: url }, Hoek.nextTick(callback));
    };

    _class.prototype._describe = function _describe(url, callback) {
        var _this2 = this;

        var req = null;
        var jar = {};

        var setup = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36'
            },
            redirects: 5,
            redirect303: true,
            redirected: function redirected(statusCode, location, redirectionReq) {

                req = redirectionReq;
            },
            beforeRedirect: function beforeRedirect(method, code, location, resHeaders, redirectOptions, next) {

                var formatCookies = function formatCookies() {

                    var header = '';
                    Object.keys(jar).forEach(function (name) {

                        header += '' + (header ? '; ' : '') + name + '=' + jar[name];
                    });

                    redirectOptions.headers = redirectOptions.headers || {};
                    redirectOptions.headers.cookie = header;
                    return next();
                };

                var cookies = resHeaders['set-cookie'];
                if (!cookies) {
                    return formatCookies();
                }

                cookies.forEach(function (cookie) {

                    var parts = cookie.split(';', 1)[0].split('=', 2);
                    jar[parts[0]] = parts[1];
                    return formatCookies();
                });
            }
        };

        req = Wreck.request('GET', url, setup, function (err, res) {

            if (err || res.statusCode !== 200 || !res.headers['content-type']) {

                req.abort();

                if (_this2.settings.router) {
                    Oembed.describe(url, null, _this2.settings, function (oembed) {

                        var description = { type: 'website', url: url };
                        internals.fill(description, oembed, ['site_name', 'thumbnail', 'embed'], 'oembed');
                        return _this2._preview(description, callback);
                    });

                    return;
                }

                return _this2._preview({ type: 'website', url: url }, callback);
            }

            var type = Content.type(res.headers['content-type']);
            if (type.isBoom) {
                return _this2._preview({ type: 'website', url: url }, callback);
            }

            if (type.mime === 'text/html') {
                Wreck.read(res, {}, function (err, payload) {

                    if (err) {
                        return _this2._preview({ type: 'website', url: url }, callback);
                    }

                    return exports.parse(payload.toString(), url, _this2.settings, function (description) {
                        return _this2._preview(description, callback);
                    });
                });

                return;
            }

            req.abort();

            if (type.mime.match(/^image\/\w+$/)) {
                var description = {
                    type: 'website',
                    url: url,
                    site_name: 'Image',
                    embed: {
                        type: 'photo',
                        url: url
                    },
                    sources: ['resource']
                };

                var contentLength = res.headers['content-length'];
                if (contentLength) {
                    description.embed.size = parseInt(contentLength, 10);
                }

                return _this2._preview(description, callback);
            }

            return _this2._preview({ type: 'website', url: url }, callback);
        });
    };

    _class.prototype._preview = function _preview(description, callback) {
        var _this3 = this;

        if (!description.site_name) {
            var uri = Url.parse(description.url);
            var parts = uri.hostname.split('.');
            description.site_name = parts.length >= 2 && parts[parts.length - 1] === 'com' ? parts[parts.length - 2].replace(/^\w/, function ($0) {
                return $0.toUpperCase();
            }) : uri.hostname;
        }

        if (!this.settings.preview && !this.settings.summary && !this.settings.tweet) {

            return callback(description);
        }

        internals.sizes(description, function () {

            description.summary = internals.summary(description, _this3.settings);

            var preview = function preview(next) {

                if (!_this3.settings.preview) {
                    return next();
                }

                _this3.settings.preview(description, _this3.settings, function (result) {

                    if (result) {
                        description.preview = result;
                    }

                    return next();
                });
            };

            var tweet = function tweet(next) {

                if (!_this3.settings.tweet) {
                    return next();
                }

                Twitter.tweet(description, function (result) {

                    if (result) {
                        description.tweet = result;
                    }

                    return next();
                });
            };

            Items.parallel.execute([preview, tweet], function (errIgnore, result) {

                if (!_this3.settings.summary) {
                    delete description.summary;
                }

                return callback(description);
            });
        });
    };

    return _class;
}();

exports.parse = function (document, url, options, next) {

    Tags.parse(document, url, function (tags, oembedLink) {

        // Parse tags

        var description = Ogp.describe(tags.og); // Use Open Graph as base
        var twitter = Twitter.describe(tags.twitter);

        // Obtain and parse OEmbed description

        Oembed.describe(url, oembedLink, options, function (oembed) {

            // Combine descriptions

            description.url = internals.url(description.url) || internals.url(oembed.url) || url;

            internals.fill(description, oembed, ['site_name'], 'oembed');
            internals.fill(description, twitter, ['description', 'title', 'image'], 'twitter');
            internals.fill(description, tags.meta, ['description', 'author', 'icon', 'avatar'], 'resource');

            Utils.copy(oembed, description, ['thumbnail', 'embed'], 'oembed');
            Utils.copy(twitter, description, ['app', 'player', 'twitter'], 'twitter');

            if (description.sources.length) {
                description.sources = Hoek.unique(description.sources);
            } else {
                delete description.sources;
            }

            return next(description);
        });
    });
};

internals.urlRx = /^https?\:\/\/.+/;

internals.url = function (url) {

    if (!url || !url.match(internals.urlRx)) {

        return null;
    }

    return url;
};

internals.fill = function (description, from, fields, source) {

    var used = false;
    fields.forEach(function (field) {

        if (!description[field] && from[field]) {

            description[field] = from[field];
            used = true;
        }
    });

    if (used) {
        description.sources = description.sources || [];
        description.sources.push(source);
    }
};

internals.summary = function (description, options) {

    var summary = {
        url: options.redirect ? '' + options.redirect + encodeURIComponent(description.url) : description.url,
        title: description.title || description.url,
        description: description.description,
        icon: description.icon ? description.icon.smallest : undefined
    };

    if (description.site_name !== 'Image') {
        summary.site = description.site_name;
    }

    var image = internals.image(description, options);
    if (image) {
        summary.image = image;
    }

    return summary;
};

internals.preview = function (description, options, callback) {

    var summary = description.summary;
    var html = '\n        <!DOCTYPE html>\n        <html>\n            <head>\n                ' + (description.title ? '<title>' + description.title + '</title>' : '') + '\n                ' + (options.css ? '<link rel="stylesheet" href="' + options.css + '">' : '') + '\n                ' + (options.script ? '<script type="text/javascript" charset="utf-8" src="' + options.script + '"></script>' : '') + '\n            </head>\n            <body>\n                <div class=\'metaphor-embed' + (description.site_name === 'Image' ? ' metaphor-embed-image-embed' : '') + '\'>\n                    <div class=\'metaphor-embed-header\'>\n                        ' + (summary.icon ? '<img class="metaphor-embed-header-icon" src="' + summary.icon + '"/>' : '<div class="metaphor-embed-header-icon-missing"></div>') + '\n                        ' + (summary.site ? '<div class="metaphor-embed-header-site">' + summary.site + '</div>' : '') + '\n                        <a class="metaphor-embed-header-link" href="' + summary.url + '" target="_blank">\n                            <div class="metaphor-embed-header-title">' + summary.title + '</div>\n                        </a>\n                    </div>\n                    <div class=\'metaphor-embed-body ' + (!!summary.description ? 'has-description' : 'no-description') + ' ' + (!!summary.image ? 'has-image' : 'no-image') + '\'>\n                        <div class="metaphor-embed-body-description">\n                            ' + (summary.description || '') + '\n                        </div>\n                        ' + (summary.image ? '<div class="metaphor-embed-body-image-wrapper"><img class="metaphor-embed-body-image" src="' + summary.image + '"/></div>' : '<div class="metaphor-embed-body-image-missing"></div>') + '\n                    </div>\n                </div>\n            </body>\n        </html>';

    return callback(html.replace(/\n\s+/g, ''));
};

internals.image = function (description, options) {

    var images = internals.images(description);
    if (!images.length) {
        return '';
    }

    if (!options.maxSize) {
        return images[0].url;
    }

    for (var i = 0; i < images.length; ++i) {
        var image = images[i];
        if (image.size && image.size <= options.maxSize) {

            return image.url;
        }
    }

    return '';
};

internals.images = function (description) {

    var images = [];

    if (description.thumbnail) {
        images.push(description.thumbnail);
    }

    if (description.embed && description.embed.type === 'photo') {

        images.push(description.embed);
    }

    if (description.image) {
        images = images.concat(description.image);
    }

    return images;
};

internals.sizes = function (description, callback) {

    var each = function each(image, next) {

        if (image.size) {
            return next();
        }

        Wreck.request('HEAD', image.url, {}, function (err, res) {

            if (err) {
                return next();
            }

            var contentLength = res.headers['content-length'];
            if (contentLength) {
                image.size = parseInt(contentLength, 10);
            }

            Wreck.read(res, null, next); // Flush out any payload
        });
    };

    var images = internals.images(description);
    Items.parallel(images, each, callback);
};
