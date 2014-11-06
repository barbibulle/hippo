"use strict";

var fs = require('fs');

function findMoofInTfra(payload, trackId, timestamp) {
    var version               = payload[0];
    var tfraTrackId           = payload.readUInt32BE(4);

    // stop now if this is for a different track
    if (tfraTrackId != trackId) return null;

    var lengthSizeOfTrafNum   = (payload[11]>>4)&3;
    var lengthSizeOfTrunNum   = (payload[11]>>2)&3;
    var lengthSizeOfSampleNum = (payload[11]   )&3;
    var entryCount            = payload.readUInt32BE(12);

    var offset = 16;
    var entrySize = 1+lengthSizeOfTrafNum+1+lengthSizeOfTrunNum+1+lengthSizeOfSampleNum;
    for (var i=0; i<entryCount; i++) {
        if (version == 0) {
            var moofTime   = payload.readUInt32BE(offset);
            var moofOffset = payload.readUInt32BE(offset+4);
            offset += 8;
        } else if (version == 1) {
            var moofTimeH   = payload.readUInt32BE(offset);
            var moofTimeL   = payload.readUInt32BE(offset+4);
            var moofOffsetH = payload.readUInt32BE(offset+8);
            var moofOffsetL = payload.readUInt32BE(offset+12);
            var moofTime    = moofTimeH*0x100000000+moofTimeL;
            var moofOffset  = moofOffsetH*0x100000000+moofOffsetL;
            offset += 16;
        } else {
            return null;
        }

        // return a result if we have found the time we're looking for
        if (moofTime == timestamp) {
            return moofOffset;
        }

        // move to the next entry
        offset += entrySize;
    }
}

function locateFragment(fd, moofOffset, boxOffset, callback) {
    fs.read(fd, new Buffer(8), 0, 8, boxOffset, function(err, bytesRead, payload) {
        if (err) {
            return callback(err, null);
        }

        if (bytesRead != 8) {
            return callback(new Error('short read'), null);
        }

        var boxSize = payload.readUInt32BE(0);
        var boxType = payload.readUInt32BE(4);
        if (boxSize < 8) {
            return callback(new Error('invalid format'), null);
        };

        if (boxType == 0x6d646174) {
            // found 'mdat'
            var moofEnd = boxOffset+boxSize-1;
            return callback(null, {start: moofOffset, end: moofEnd})
        } else {
            locateFragment(fd, moofOffset, boxOffset+boxSize, callback);
        }
    });
}

exports.findFragment = function(filename, trackId, timestamp, callback) {
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

                        // walk all boxes in the mfra container
                        var available = mfraSize-8;
                        var offset = 0;
                        while (available >= 8) {
                            var boxSize = mfra.readUInt32BE(offset);
                            var boxType = mfra.readUInt32BE(offset+4);
                            if (boxSize < 8 || boxSize > available) {
                                return done(new Error('invalid format'), null);
                            }
                            if (boxType == 0x74667261) {
                                var moofOffset = findMoofInTfra(mfra.slice(offset+8, offset+boxSize), trackId, timestamp);
                                if (moofOffset !== null) {
                                    return locateFragment(fd, moofOffset, moofOffset, done);
                                }
                            }

                            available -= boxSize;
                            offset    += boxSize;
                        }
                        return done(new Error('fragment not found in tfra'), null);
                    });
                });
            });
        });
    });
}
