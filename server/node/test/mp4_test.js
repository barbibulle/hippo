mp4 = require('./mp4.js');

mp4.parse(process.argv[2], function(err, mp4File) {
    console.log(err, mp4File);
});