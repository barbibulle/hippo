"use strict";

var http      = require('http');
var fs        = require('fs');
var path      = require('path');
var send      = require('send');
var url       = require('url');
var jsonlint  = require('jsonlint');
var mp4       = require('./mp4.js');

function httpError(response, statusCode, message) {
    response.statusCode = statusCode;
    response.end(message);
}

function httpNotFound(response) {
    httpError(response, 404, 'Not Found');
}

function httpInternalError(response) {
    httpError(response, 500, 'Internal Error');
}

function readManifest(root, relativePath, callback) {
    var head = relativePath;
    var tail = '';
    var slashPos = relativePath.indexOf('/');
    if (slashPos > 0) {
        head = relativePath.substring(0, slashPos);
        tail = relativePath.substring(slashPos+1);
    }

    var filename = path.join(root, head);
    fs.stat(filename, function(err, stat) {
        if (err || !stat.isFile()) {
            if (tail) {
                return readManifest(filename, tail, callback);
            } else {
                return callback('not found', null, null);
            }
        }
        fs.readFile(filename, { encoding: 'utf-8' }, function(err, data) {
            callback(err, filename, tail, data);
        });
    });
}

function processRequest(request, response, serverManifestFilename, subpath, data) {
    try {
        var manifest = JSON.parse(data);
    } catch (err) {
        try {
            manifest = jsonlint.parse(data);
        } catch (err) {
            console.error(err);
            return httpInternalError(response);
        }
    }
    if (manifest.dashManifest) {
        if (subpath == (manifest.dashManifest.url || "mpd")) {
            response.setHeader('Content-Type', 'application/dash+xml');
            send(request, manifest.dashManifest.file)
                .root(path.dirname(serverManifestFilename))
                .pipe(response);
            return;
        }
    }
    if (manifest.smoothManifest) {
        if (subpath == (manifest.smoothManifest.url || "Manifest")) {
            response.setHeader('Content-Type', 'application/vnd.ms-sstr+xml');
            send(request, manifest.smoothManifest.file)
                .root(path.dirname(serverManifestFilename))
                .pipe(response);
            return;
        }
    }

    for (var i=0; i<manifest.media.length; i++) {
        for (var j=0; j<manifest.media[i].mediaSegments.urls.length; j++) {
            var match = subpath.match(manifest.media[i].mediaSegments.urls[j].pattern);
            if (match) {
                var fields = manifest.media[i].mediaSegments.urls[j].fields;
                var requestFields = {};
                if (fields && match.length-1 >= fields.length) {
                    for (var x=0; x<fields.length; x++) {
                        requestFields[fields[x]] = match[x+1];
                    }
                }

                // parse the MP4 file to get the index
                mp4.parse(path.join(path.dirname(serverManifestFilename), manifest.media[i].mediaSegments.file), function(err, mp4Index) {
                    if (err) {
                        console.error(err);
                        return httpNotFound(response);
                    }
                    if (mp4Index) {
                        // look for the requested track ID
                        for (var x=0; x<mp4Index.length; x++) {
                            if (mp4Index[x].trackId == manifest.media[i].trackId) {
                                // look for the entry by time
                                for (var z=0; z<mp4Index[x].entries.length; z++) {
                                    if (mp4Index[x].entries[z].time == requestFields.time) {
                                        // found it!
                                        var startOffset = mp4Index[x].entries[z].moofOffset;
                                        var endOffset;
                                        if (z < mp4Index[x].entries.length-1) {
                                            // not the last segment
                                            endOffset = mp4Index[x].entries[z+1].moofOffset;
                                        }
                                        var sendOptions = {start: startOffset, end: endOffset};
                                        send(request, manifest.media[i].mediaSegments.file, sendOptions)
                                            .root(path.dirname(serverManifestFilename))
                                            .pipe(response);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                    return httpNotFound(response);
                });
                return;
            }
        }
        match = subpath.match(manifest.media[i].initSegment.url || manifest.media[i].initSegment.file);
        if (match) {
            response.setHeader('Content-Type', 'video/mp4');
            send(request, manifest.media[i].initSegment.file)
                .root(path.dirname(serverManifestFilename))
                .pipe(response);
            return;
        }
    }

    return httpNotFound(response);
}

module.exports = function(config) {
    return function(request, response) {
        // only HEAD and GET requests are allowed
        if (request.method != 'GET' && request.method != 'HEAD') {
            return httpError(response, 405, 'Method Not Allowed');
        }

        // parse the request URL
        var parsedUrl = url.parse(request.url);
        if (config.debug) {
            console.log("REQUEST for:", parsedUrl.pathname);
        }

        // check for cross domain policy requests
        if (config.crossDomain && parsedUrl.pathname == "/crossdomain.xml") {
            response.setHeader('Content-Type', 'text/xml');
            response.end('<?xml version="1.0"?><cross-domain-policy><allow-access-from domain="*" /></cross-domain-policy>');
            return;
        }

        // check that the request is under the URL root
        if (parsedUrl.pathname.indexOf(config.urlRoot) != 0) {
            return httpNotFound(response);
        }
        var relativePath = parsedUrl.pathname.substring(config.urlRoot.length)
        var filePath = path.resolve(path.normalize(path.join(config.fileRoot, relativePath)));

        // check that the resolved file path is under the file root
        if (filePath.indexOf(config.fileRoot) != 0) {
            console.error("ERROR: file not under root");
            return httpNotFound(response);
        }
        relativePath = filePath.substring(config.fileRoot.length+1);

        // find anchor point for the manifest name
        readManifest(config.fileRoot, relativePath, function(err, serverManifest, path, data) {
            if (err) {
                if (config.debug) {
                    console.error('ERROR:', err);
                }
                return httpNotFound(response);
            }
            return processRequest(request, response, serverManifest, path, data);
        });
    }
}
