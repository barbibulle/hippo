Hippo Media Server
==================

Introduction
------------

The Hippo Media Server is a simple, standalone HTTP server designed to simplify the delivery of MPEG DASH and Smooth Streaming media.
MPEG DASH and Smooth Streaming are both protocols for HTTP-based adaptive streaming. With adaptive Streaming, a media presentation is served to streaming clients as a sequence of small *media segments* (each segment containing typically 2 to 10 seconds of audio or video). 
Each segment is accessed through an individual URL. In order to serve an adaptive streaming presentation with a regular HTTP server like Apache or Nginx, one needs to split the original media files into small individual files, one for each segment, so that they can be accessed through separate URLs. This can be very difficult to manage.
The Hippo Media Server implements a simple URL virtualization scheme: instead of mapping each URL to a file in the server's filesystem, each URL consists of a pattern, which is parsed by the server when it handles a request, from which the server can locate the appropriate *portion* of a file in the filesystem. This way, a single media file containing the media data for the segments can be represented as discrete URLs.

Running the Server
------------------

### Prerequisites

The Hippo Media Server is written as a NodeJS module. You need to install NodeJS version 0.8.x or above in order to run it. You can obtain a NodeJS distribution for your platform from the [NodeJS project page](http://www.nodejs.org).

### Running from a command-line shell
Simply invoke the `node` runtime passing it the path to the `hippo.js` file from this distribution.

### Configuration with Command-line arguments
The server can be configured through command-line arguments. Launching the server with the `-h` command-line argument will print out a list of supported command line arguments and options:

```
Usage: hippo.js [options]

  Options:

    -h, --help                          output usage information
    -V, --version                       output the version number
    -p, --port [port]                   Listen on port number [port] (default 8000))
    -c, --config [filename]             Config file (default hippo-config.json)
    -l, --log-level [log-level]         Logging level (between 0 and 10, default=1)
    -o, --log-output [log-output-file]  Log output file name (default=stdout)
    -r, --file-root [directory-path]    Path to root directory where streams are located (default=./streams)
    -u, --url-root [url-root]           Root URL path at which files are exposed (default=/)
    -x, --no-cross-domain               Do not serve a crossdomain.xml file
    -d, --debug                         Debug mode
```

Example:
```
node hippo.js -r /var/media/streams
```

### Configuration with a Server Configuration File

Using the `--config` command-line argument, you can pass the name of a JSON file containing setting for the server. Most of what can be configured through command-line arguments can also be configured through this config file. When the same configuration parameter is specified both in a configuration file and through a command-line argument, it is the command-line argument that takes precedence.


Preparing Files for the Server
------------------------------

The Hippo Media Server exposes media streams over HTTP, based on a Media Server Manifest for each stream. A Media Server Manifest is a short JSON file that tells the server what it needs to know about the stream, including what file in the filesystem contains the media data, what media tracks to server, what URL patterns to use for the stream, as well as a few other stream configuration parameters. The convention is to use the `.msm` file extension for Media Server Manifest files, but that is not mandatory.
The best filesystem layout for streams is to have one directory per stream. Each stream directory contains a `.msm` file (you can call it `stream.msm` for example), along with all the necessary media files and client manifest(s). 
For example, you could have in a directory `movie1` a single-bitrate MPEG DASH stream, where the media is in the file `movie.mp4`, the init segment in the file `init.mp4` and the MPEG DASH MPD in the file `stream.mpd`. You would create a file named `stream.msm` in the same directory with references to `movie.mp4`, `init.mp4` and `stream.mpd`. Refer to the section on Media Stream Manifest file syntax for details of what the `stream.msm` file would contain.

Media Stream Manifest
---------------------

A Media Stream Manifest is the *anchor point* of a stream. It tells the server where to find the media segments and how to expose them through HTTP URLs.
A Media Stream Manifest is a JSON file that contains a top level object with some mandatory members and some optional members.

#### Top Level Object

Member | Mandatory? | Type  | Value
------ | ---------  | ----- | ------
media  |     Y      | Array | One or more Media Objects. Each Media Object represents an audio or video track

#### Media Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | -----   | -----
id            |     N      | String  | Identifier for the track
mediaSegments |     Y      | Object  | A MediaSegments Object
initSegment   |     Y/N    | Object  | An InitSegment Object (this is only required for MPEG DASH streams)
trackId       |     Y      | Integer | MP4 Track ID (in MP4 files, track IDs start at 1!)

#### MediaSegments Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | -----   | -----
urls          |     Y      | Array   | One or more UrlPattern Object(s)
file          |     Y      | String  | filename of the MP4 file containing the media

#### InitSegment Object (MPEG DASH only)

Member        | Mandatory? | Type    | Value
------------- | ---------- | -----   | -----
url           |     N      | String  | Name of the init segment in the URL. [If this is not specified, the filename is used]
file          |     Y      | String  | filename of the file containing the init segment

#### UrlPattern Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | -----   | -----
pattern       |     Y      | String  | Regular expression containing one or more *capture groups*
fields        |     Y      | Array   | Array of strings, one for each capture group in the pattern, providing a name for each group

In regular expressions, a capture group is enclosed in `()`, so remember to escape `(` and `)` characters if they appear in your URLs. Also, remember to properly escape `\` characters in your regular expressions, because single `\` characters are used as escape marker in JSON. For example, the regular expression `QualityLevels\((\d+)\)/Fragments\(audio_en=(\d+)\)` would be represented as the JSON string `"QualityLevels\\((\\d+)\\)/Fragments\\(audio_en=(\\d+)\\)"` in your file, and would match the URL part `QualityLevels(1000)/Fragments(audio_en=1234)`

Example of a minimal single-bitrate MPEG DASH / Smooth Streaming Media Stream Manifest, with a single audio track and a single video track:
```
{
	"media": [
		{
			"id": "audio.en",
			"mediaSegments": {
			    "urls": [
			        {
			            "pattern": "QualityLevels\\((\\d+)\\)/Fragments\\(audio_en=(\\d+)\\)",
			            "fields":  ["bandwidth", "time"]
			        }
			    ],
			    "file": "frag.mp4"
			},
			"initSegment": {
			    "file": "init-01-01.mp4"
			},
			"trackId": 1
		},
		{
			"id": "video.1",
			"mediaSegments": {
			    "urls": [
			        {
			            "pattern": "QualityLevels\\((\\d+)\\)/Fragments\\(video=(\\d+)\\)",
			            "fields":  ["bandwidth", "time"]
				    }
			    ],
			    "file": "frag.mp4"
			},
			"initSegment": {
				"file": "init-01-02.mp4"
			},
			"trackId": 2
		}
	]
}
```

