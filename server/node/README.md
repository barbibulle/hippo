Hippo Media Server
==================

Introduction
------------

The Hippo Media Server is a simple, standalone HTTP server designed to simplify the delivery of MPEG DASH and Smooth Streaming media.
MPEG DASH and Smooth Streaming are both protocols for HTTP-based adaptive streaming. With adaptive Streaming, a media presentation is served to streaming clients as a sequence of small *media segments* (each segment containing typically 2 to 10 seconds of audio or video). 
Each segment is accessed over HTTP with an individual URL. In order to serve an adaptive streaming presentation with a regular HTTP server like Apache, Nginx or other populare HTTP servers, one needs to split the original media files into small individual files, one for each segment, so that they can be accessed through separate URLs. This can be very difficult to manage.
The Hippo Media Server implements a simple URL virtualization scheme: instead of mapping each URL to a file in the server's filesystem, each URL consists of a pattern, which is parsed by the server when it handles a request, and from which it can locate the appropriate *portion* of a file in the filesystem. This way, a single media file containing the media data for the segments can be represented as discrete URLs.

Installing and Running the Server
---------------------------------

### Prerequisites
The Hippo Media Server is written as a NodeJS application. You need to install NodeJS version 0.8.x or above in order to run it. You can obtain a NodeJS distribution for your platform from the [NodeJS project page](http://www.nodejs.org). You will also need the ensure that the Node Package Manager (NPM) is installed and functional.

### Installation
After you have downloaded the Hippo Media Server distribuion, you will need to install/update the node module dependencies:
From a command-line shell, working from the directory when the main script `hippo.js` is (`<download-location>/server/node` directory), run:
```
npm install
```
You should see `npm` install the dependencies under `node_modules` 

### Running from a command-line shell
Simply invoke the `node` runtime passing it the path to the `hippo.js` file from this distribution, optionaly followed by command-line arguments.

### Configuration with Command-line arguments
The server can be configured through command-line arguments. Launching the server with the `-h` command-line argument will print out a list of supported command line arguments and options:

```
Usage: hippo.js [options]

  Options:

    -h, --help                          output usage information
    -V, --version                       output the version number
    -p, --port [port]                   Listen on port number [port] (default 8000))
    -c, --config [filename]             Config file
    -l, --log-level [log-level]         Logging level (between 0 and 10, default=1)
    -o, --log-output [log-output-file]  Log output file name (default=stdout)
    -r, --file-root [directory-path]    Path to root directory where streams are located (default=./streams)
    -u, --url-root [url-root]           Root URL path at which files are exposed (default=/)
    -x, --no-cross-domain               Do not serve a crossdomain.xml file
    -d, --debug                         Debug mode
```

Example:
Serve all streams located below /var/media/streams, exposed below the root of the server's URL space (http://<server-name>:8000/)
```
node hippo.js -r /var/media/streams
```
So, for instance, if a directory `video1` is located under `/var/media/streams`, contains a manifest file named `stream.msm`, and the server DNS name is myserver.com, the MPEG DASH URL (if there is a DASH client manifest under `video1`) would be `http://myserver.com/video1/stream.msm/mpd` and the Smooth Streaming URL (if there is a Smooth Streaming client manifest under `video1`) would be `http://myserver.com/video1/stream.msm/Manifest`
 
### Configuration with a Server Configuration File

Using the `--config` command-line argument, you can pass the name of a JSON file containing setting for the server. Most of what can be configured through command-line arguments can also be configured through this config file. When the same configuration parameter is specified both in a configuration file and through a command-line argument, it is the command-line argument that takes precedence.


Preparing Files for the Server
------------------------------

The Hippo Media Server exposes media streams over HTTP, based on a Media Server Manifest for each stream. A Media Server Manifest is a short JSON file that tells the server what it needs to know about the stream, including what file in the filesystem contains the media data, what media tracks to server, what URL patterns to use for the stream, as well as a few other stream configuration parameters. The convention is to use the `.msm` file extension for Media Server Manifest files, but that is not mandatory.
The best filesystem layout for streams is to have one directory per stream. Each stream directory contains a `.msm` file (you can call it `stream.msm` for example), along with all the necessary media files and client manifest(s). 
For example, you could have in a directory `movie1` a single-bitrate MPEG DASH stream, where the media is in the file `movie.mp4`, the init segment in the file `init.mp4` and the MPEG DASH MPD in the file `stream.mpd`. You would create a file named `stream.msm` in the same directory with references to `movie.mp4`, `init.mp4` and `stream.mpd`. Refer to the section on Media Stream Manifest file syntax for details of what the `stream.msm` file would contain.

Creating Media Stream Manifest files
------------------------------------

While its is relatively simple to create Media Stream Manifest files by hand with a text editor when prototyping and experimenting, those files are typically generated by a program or script in a content production workflow.
The most convenient way to generate those files automatically while at the same time preparing your audio and video sources for MPEG DASH ro Smooth Streaming is to use the `mp4-dash.py` tool from the [Bento4 distribution](http://www.bento4.com). Using the `--hippo` option on the command line will generate a Media Stream Manifest file automatically. Please refer to the Bento4 documentation for details.


Media Stream Manifest Syntax
----------------------------

A Media Stream Manifest is the *anchor point* of a stream. It tells the server where to find the media segments and how to expose them through HTTP URLs.
A Media Stream Manifest is a JSON file that contains a top level object with some mandatory members and some optional members.

#### Top Level Object

Member         | Mandatory? | Type   | Value
-------------- | ---------  | ------ | ------
media          |     Y      | Array  | One or more Media Objects. Each Media Object represents an audio or video track
dashManifest   |     N      | Object | A DashManifest object
smoothManifest |     N      | Object | A SmoothManigest object

#### Media Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | ------- | -----
trackId       |     Y      | Integer | MP4 Track ID (in MP4 files, track IDs start at 1!)
mediaSegments |     Y      | Object  | A MediaSegments object
initSegment   |     Y/N    | Object  | An InitSegment object (this is only required for MPEG DASH streams)

#### MediaSegments Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | ------- | -----
urls          |     Y      | Array   | One or more UrlPattern Object(s)
file          |     Y      | String  | filename of the MP4 file containing the media

Even though the `urls` array may contain more than one `UrlPattern` object, it typically only contains just one. The only reason to use more than one would be if there should be several alternative URLs mapping to the same segments.

#### InitSegment Object (MPEG DASH only)

Member        | Mandatory? | Type    | Value
------------- | ---------- | ------- | -----
url           |     N      | String  | Name of the init segment in the URL. [If this is not specified, the filename is used]
file          |     Y      | String  | filename of the file containing the init segment

#### UrlPattern Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | ------- | -----
pattern       |     Y      | String  | Regular expression containing one or more *capture groups*
fields        |     Y      | Array   | Array of strings, one for each capture group in the pattern, providing a name for each group

#### DashManifest Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | ------- | -----
file          |     N      | String  | Name of the file containing an MPEG DASH MPD
url           |     N      | String  | Basename of the MPD in the URL (default: 'mpd')

#### SmoothManifest Object

Member        | Mandatory? | Type    | Value
------------- | ---------- | ------- | -----
file          |     N      | String  | Name of the file containing a Smooth Streaming client manifest (.ismc)


In regular expressions, a capture group is enclosed in `()`, so remember to escape `(` and `)` characters if they appear in your URLs. Also, remember to properly escape `\` characters in your regular expressions, because single `\` characters are used as escape marker in JSON. For example, the regular expression `QualityLevels\((\d+)\)/Fragments\(audio_en=(\d+)\)` would be represented as the JSON string `"QualityLevels\\((\\d+)\\)/Fragments\\(audio_en=(\\d+)\\)"` in your file, and would match the URL part `QualityLevels(1000)/Fragments(audio_en=1234)`

Example of a minimal single-bitrate MPEG DASH / Smooth Streaming Media Stream Manifest, with a single audio track and a single video track:

```
{
  "media": [{
    "trackId": 1,
    "mediaSegments": {
      "urls": [{
        "pattern": "QualityLevels\\(279981\\)/Fragments\\(video=(\\d+)\\)",
        "fields": ["time"]
      }],
      "file": "video_freund_fragmented.mp4"
    },
    "initSegment": {
      "file": "init-01-01.mp4"
    }
  },{
    "trackId": 2,
    "mediaSegments": {
      "urls": [{
        "pattern": "QualityLevels\\(132530\\)/Fragments\\(audio_fr=(\\d+)\\)",
        "fields": ["time"]
        }],
      "file": "video_freund_fragmented.mp4"
    },
    "initSegment": {
      "file": "init-01-02.mp4"
    }
  }]
}
```

Default URL/File Mappings
---------------------

Unless specified otherwise through command-line arguments and/or a configuration file, the default setting is as follows.

* The URL path `<path-to-msm-file>/Manifest` maps to the file named `stream.ismc` (if it exists) in the same directory as the .msm file.
* The URL path `<path-to-msm-file>/mpd` maps to the file name `stream.mpd` (if it exists) in the same directory as the .msm file. 

For example, if the server has a filesystem directory `/var/streams/video1` that contains a Media Server Manifest `stream.msm`, a Smooth Streaming client manifest `stream.ismc` and an MPEG DASH MPD `stream.mpd` (as well as the media files), and the server is run with a URL root `/myvideostreams` (specified using the `--url-root` option or a config file) and a file root `/var/streams` (specified using the `--file-root` options or a config file), with a DNS name `myserver.com`, then the Smooth Streaming URL would be:
`http://myserver.com/myvideostreams/video1/stream.msm/Manifest`
and the MPEG DASH URL would be: 
`http://myserver.com/myvideostreams/video1/stream.msm/mpd`
