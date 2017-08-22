'use strict';

// Load modules

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Url = require('url');
var Hoek = require('hoek');

// Declare internals

var internals = {};

exports = module.exports = internals.Router = function () {
    function _class() {
        _classCallCheck(this, _class);

        this._existing = {};
        this._domains = {
            subs: {}
        };
    }

    _class.prototype.add = function add(url, node) {

        //                                                    1       2            3
        var parts = url.match(/^https?\:\/\/(?:www\.)?(?:(\*)\.)?([^\/]+)(?:\/(.*))?$/);
        if (!parts) {
            return;
        }

        var wildcard = !!parts[1];
        var domain = parts[2];
        var path = parts[3];

        var normalized = '' + (wildcard ? '*.' : '') + domain + '/' + path;
        if (this._existing[normalized]) {
            return;
        }

        this._existing[normalized] = true;

        var tree = this._domains;
        var segment = domain.split('.');
        for (var i = segment.length - 1; i >= 0; --i) {
            var part = segment[i];
            tree.subs[part] = tree.subs[part] || { subs: {}, paths: [] };
            tree = tree.subs[part];
        }

        tree.node = node;
        tree.wildcard = wildcard;

        if (!path || path === '*' || path.indexOf('*') === -1) {

            tree.any = true;
        } else {
            var escaped = Hoek.escapeRegex(path);
            var regex = '^/' + escaped.replace(/\\\*/g, '[^\\/]*') + '$';
            tree.paths.push(new RegExp(regex));
        }
    };

    _class.prototype.lookup = function lookup(url) {

        var uri = Url.parse(url);
        var parts = uri.hostname.split('.');
        if (parts[0] === 'www') {
            parts.splice(0, 1);
        }

        var tree = this._domains;
        for (var i = parts.length - 1; i >= 0; --i) {
            var part = parts[i];
            var segment = tree.subs[part];
            if (!segment) {
                if (i === 0 && tree.wildcard) {

                    break;
                }

                return null;
            }

            tree = segment;
        }

        if (!tree.node) {
            return null;
        }

        if (tree.any) {
            return tree.node;
        }

        for (var _i = 0; _i < tree.paths.length; ++_i) {
            if (uri.pathname.match(tree.paths[_i])) {
                return tree.node;
            }
        }

        return null;
    };

    return _class;
}();
