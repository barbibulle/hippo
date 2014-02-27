#! /usr/bin/env node

"use strict";

// modules
var fs        = require('fs');
var path      = require('path');
var jsonlint  = require('jsonlint');
var options   = require('commander');
var http      = require('http');
var accesslog = require('access-log');

// parse the command line options
options
    .version('0.1.0')
    .option('-p, --port [port]', 'Listen on port number [port] (default 8000))', 8000)
    .option('-c, --config [filename]', 'Config file')
    .option('-l, --log-level [log-level]', 'Logging level (between 0 and 10, default=1)', 1)
    .option('-o, --log-output [log-output-file]', 'Log output file name (default=stdout)')
    .option('-r, --file-root [directory-path]', 'Path to root directory where streams are located (default=./)', '')
    .option('-u, --url-root [url-root]', 'Root URL path at which files are exposed (default=/)', '/')
    .option('-x, --no-cross-domain', 'Do not serve a crossdomain.xml file', false)
    .option('-d, --debug', 'Debug mode')
    .parse(process.argv);

// load the server config
var configFile = options.config;
if (configFile && configFile.indexOf('/') != 0) {
    configFile = './'+configFile;
}

// parse the config file
var config = {};
if (configFile && fs.existsSync(configFile)) {
    try {
        var configData = fs.readFileSync(configFile, {encoding: 'utf8'});
    } catch (err) {
        console.error('ERROR: cannot load config file', configFile);
        console.error(err);
        process.exit(1);
    }
    try {
        config = jsonlint.parse(configData);
    } catch (err) {
        console.error('ERROR: cannot parse config file', configFile);
        console.error(err);
        process.exit(1);
    }
}

if (config.fileRoot == undefined) {
    config.fileRoot = options.fileRoot;
}
config.fileRoot = path.resolve(config.fileRoot);
try {
    if (!fs.statSync(config.fileRoot).isDirectory()) {
        console.error('ERROR: root path', config.fileRoot, 'is not a directory');
        process.exit(1);
    }
} catch (err) {
    console.error('ERROR: root path', config.fileRoot, 'does not exist');
    process.exit(1);
}

if (config.urlRoot == undefined) {
    config.urlRoot = '/';
}
if (config.urlRoot.indexOf('/') != 0) {
    config.urlRoot = '/'+config.urlRoot;
}
if (config.listenPort == undefined) {
    config.listenPort = options.port;
}
if (config.logLevel == undefined) {
    config.logLevel = options.logLevel;
}
if (config.debug == undefined) {
    config.debug    = options.debug;
}
if (config.crossDomain == undefined) {
    config.crossDomain = !options.noCrossDomain;
}
// show some of the config data
if (config.debug) {
    console.log("CONFIG:", config);
}

var server = require('./lib/server')(config);
http.createServer(function(request, response) {
    accesslog(request, response);
    server(request, response);
}).listen(config.listenPort);