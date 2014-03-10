"use strict";

var fs = require('fs');

function parseBoxes(payload, callback) {
    var available = payload.length;
    var offset = 0;
    while (available >= 8) {
        var boxSize = payload.readUInt32BE(offset);
        var boxType = payload.readUInt32BE(offset+4);
        if (boxSize < 8 || boxSize > available) return;
        callback(boxType, boxSize-8, payload.slice(offset+8, offset+boxSize));
        available -= boxSize;
        offset    += boxSize;
    }
}

function parseTfra(payload) {
    var tfra = { entries:[] };

    var version               = payload[0];
        tfra.trackId          = payload.readUInt32BE(4);
    var lengthSizeOfTrafNum   = (payload[11]>>4)&3;
    var lengthSizeOfTrunNum   = (payload[11]>>2)&3;
    var lengthSizeOfSampleNum = (payload[11]   )&3;
    var entryCount            = payload.readUInt32BE(12);

    var offset = 16;
    var entrySize = 1+lengthSizeOfTrafNum+1+lengthSizeOfTrunNum+1+lengthSizeOfSampleNum;
    for (var i=0; i<entryCount; i++) {
        tfra.entries[i] = {};
        var entry = tfra.entries[i];

        if (version == 0) {
            entry.time       = payload.readUInt32BE(offset);
            entry.moofOffset = payload.readUInt32BE(offset+4);
            offset += 8;
        } else if (version == 1) {
            var timeH       = payload.readUInt32BE(offset);
            var timeL       = payload.readUInt32BE(offset+4);
            var moofOffsetH = payload.readUInt32BE(offset+8);
            var moofOffsetL = payload.readUInt32BE(offset+12);
            entry.time = timeH*0x100000000+timeL;
            entry.moofOffset = moofOffsetH*0x100000000+moofOffsetL;
            offset += 16;
        } else {
            return null;
        }

        offset += entrySize;
    }

    return tfra;
}

exports.parse = function(filename, callback) {
    fs.open(filename, 'r', function(err, fd) {
        if (err) return callback(err, null);

        function done(err, value) {
            fs.close(fd, function(e, x) {
                callback(err, value);
            })
        }

        fs.fstat(fd, function(err, stats) {
            if (err) {
                return done(err, null);
            }
            if (stats.size <16) {
                // not enough data
                return done(new Error('file too small'), null);
            }
            fs.read(fd, new Buffer(16), 0, 16, stats.size-16, function(err, bytesRead, mfro) {
                if (err) {
                    return done(err, null);
                }

                // check that we read everything
                if (bytesRead != 16) {
                    return done(new Error('short read'), null);
                }

                // check that the size is 16
                if (mfro.readUInt32BE(0) != 0x00000010) {
                    return done(new Error('mfro box size is not 16'), null);
                }

                // check that the type is 'mfro'
                if (mfro.readUInt32BE(4) != 0x6d66726f) {
                    return done(new Error('box type is not mfro'), null);
                }

                // get the size of the 'mfra' box
                var mfraSize = mfro.readUInt32BE(12);

                // sanity check
                if (mfraSize > stats.size) {
                    return done(new Error('mfraSize too large'), null);
                }

                fs.read(fd, new Buffer(8), 0, 8, stats.size-mfraSize, function(err, bytesRead, mfraHeader) {
                    if (err) {
                        return done(err, null);
                    }

                    // check that we read everything
                    if (bytesRead != 8) {
                        return done(new Error('short read'), null);
                    }

                    // check the type
                    if (mfraHeader.readUInt32BE(4) != 0x6d667261) {
                        return done(new Error('box type is not mfra'), null);
                    }

                    // get the box size
                    mfraSize = mfraHeader.readUInt32BE(0);
                    if (mfraSize < 8 || mfraSize > stats.size) {
                        return done(new Error('invalid mfra box size'), null);
                    }

                    // read the mfra box
                    fs.read(fd, new Buffer(mfraSize-8), 0, mfraSize-8, stats.size-mfraSize+8, function(err, bytesRead, mfra) {
                        if (err) {
                            return done(err, null);
                        }

                        // check that we read everything
                        if (bytesRead != mfraSize-8) {
                            return done(new Error('cannot read the entire box'), null);
                        }

                        // walk all boxes in the container
                        var tfras = [];
                        parseBoxes(mfra, function(boxType, boxSize, boxPayload) {
                            if (boxType == 0x74667261) {
                                var tfra = parseTfra(boxPayload);
                                if (tfra) {
                                    tfras.push(tfra);
                                }
                            }
                        });
                        return done(null, tfras);
                    });
                });
            });
        });
    });
}
