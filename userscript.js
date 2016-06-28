// ==UserScript==
// @name         Soundcloud Controller
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Control soundcloud/spotify instances from any tab or browser
// @author       Henry Arneson
// @match        *://*/*
// @exclude      *://github.com/*
// @exclude      *://gist.github.com/*
// @grant        none
// @require      https://cdn.pubnub.com/pubnub-3.14.4.js
// @require      http://code.jquery.com/jquery-latest.js
// @require      http://ajax.googleapis.com/ajax/libs/jqueryui/1.11.1/jquery-ui.min.js
// ==/UserScript==
/* jshint -W097 */
'use strict';

// Your code here...
this.$ = this.jQuery = jQuery.noConflict(true);

var SUB_KEY = "sub-c-728fc9d6-eeeb-11e5-872f-02ee2ddab7fe";
var PUB_KEY = "pub-c-4d512ef2-a84a-472d-a931-6c3aa8280e01";
var database = {};
var mediaControls = {};
var themeColor = "#84bd00";

var progressUpdateInterval;

var isSoundcloud = function () {
    return (location.hostname === 'soundcloud.com');
};

var isSpotify = function () {
    return (location.hostname === 'play.spotify.com');
};

var toSeconds = function (s) {
    var ss = s.split(":");
    return (+ss[0])*60 + (+ss[1]);
};

var execCommand = function (cmd) {
    if (JSON.stringify(mediaControls) == '{}') {
        var playControls = null;

        if (isSoundcloud()) playControls = $(".playControls__playPauseSkip")[0].children;
        else if (isSpotify()) playControls = $("#app-player").contents().find("#controls").find('button');

        mediaControls = {
            prev: playControls[0],
            playPause: playControls[1],
            next: playControls[2]
        };
    }

    mediaControls[cmd].click();
};

var isPlaying = function(){
    if (isSoundcloud()){
        return $(".playControls__playPauseSkip").children().eq(1).hasClass('playing');
    } else if (isSpotify()) {
        return $("#app-player").contents().find("#play-pause").hasClass('playing');
    }
};

var updateDatabase = function (database) {
    var databaseClone = $.extend(true, {}, database);

    database = {};

    try {
        if (isSoundcloud()) {

            database.art = $(".playControls__soundBadge").find('a.sc-media-image').find('span').css('background-image').replace('t50x50', 't200x200');
            database.songTitle = $(".playbackSoundBadge__title").attr('title');
            database.playing = isPlaying();
            database.themeColor = '#f50';
           // var songLengthSplit = $(".playbackTimeline__duration").children().eq(1).html().split(':'); // clean this up
            database.songLength = toSeconds($(".playbackTimeline__duration").children().eq(1).html());
            database.songProgress = null;

        } else if (isSpotify()) {
            var iframeContents = $("#app-player").contents();

            database.art = iframeContents.find("#cover-art").find("div.sp-image-img").css('background-image');
            database.songTitle = iframeContents.find("#track-name").find('a').html();
            database.playing = isPlaying();
            database.themeColor = '#84bd00';
            database.songLength = toSeconds(iframeContents.find("#track-length").html());
            database.songProgress = null;

        }
    } catch (err) {}

    var hasChanged = JSON.stringify(database) != JSON.stringify(databaseClone);

    return [database, hasChanged];

};

var getSongProgress = function() {
    if (isSoundcloud()) return toSeconds($(".playbackTimeline__timePassed").children().eq(1).html());
    else if (isSpotify()) return toSeconds($("#app-player").contents().find("#track-current").html());
};

var getStartTime = function() {
    return parseInt(new Date().getTime() / 1000) - getSongProgress();
};

var songTimeListener = function () {
    // assuming playing
    var startTime = 0;

    window.setInterval(function(){
        var newStartTime = getStartTime();

        if (startTime != newStartTime && isPlaying()) {
            console.log('time changed!!!');
            startTime = newStartTime;
            var db = updateDatabase({})[0];
            db.songProgress = getSongProgress();
            send(pubnub, 'data', db);
        }
    }, 1000);

};

var increaseProgressBar = function() {
    $("#SCC-progress").val($("#SCC-progress").val() + 1);
};

var updateDom = function (database) {
    artDiv.css('background-image', database.art);
    title.html(database.songTitle);

    var iconText = '';

    try {clearInterval(progressUpdateInterval);}
    catch(e){}

    if (database.playing) {
        iconText = 'pause';
        progressUpdateInterval = setInterval(function(){increaseProgressBar();}, 1000);
    } else {
        iconText = 'play_arrow';
    }
    playPause.find('i').html(iconText);

    themeColor = database.themeColor;
    //mainContainer.css('border-top-color', themeColor);

    progressBar.attr('max', database.songLength);
    if (database.songProgress !== null) progressBar.val(database.songProgress);

    progressBar.removeClass('sc');
    if (themeColor.toLowerCase() == "#f50") progressBar.addClass('sc');
};

setInterval(function () {
    var newData = updateDatabase(database);

    database = newData[0];

    var hasChanged = newData[1];

    if (hasChanged) send(pubnub, 'data', database);

}, 300);




var send = function (pub, channel, data) {
    pub.publish({
        channel: channel,
        message: {
            'data': data
        }
    });
};


var pubnub = PUBNUB({
    subscribe_key: SUB_KEY,
    publish_key: PUB_KEY,
    ssl: true
});

pubnub.subscribe({
    channel: 'command',
    callback: function (m) {
        if (isSoundcloud() || isSpotify()) execCommand(m.data);
    },
    error: function (err) {
        console.log(err);
    }
});

pubnub.subscribe({
    channel: 'data',
    callback: function (m) {
        updateDom(m.data);
    },
    error: function (err) {
        console.log(err);
    }
});

//send(pubnub, 'command', playPause')

//// KEYBOARD SHOW/HIDE ////

var codeToChar = {
    65: 'a',
    83: 's',
    68: 'd',
    72: 'h',
    18: 'alt',
    16: 'shift'
};

var keyMap = {
    65: function () {prev.click();},
    83: function () {playPause.click();},
    68: function () {next.click();},
    72: function () {mainContainer.fadeToggle(400);}
};

var altPressed = false;
var shiftPressed = false;

$(document).keydown(function (key) {
    if (key.keyCode == 16) {
        shiftPressed = true;
    } else if (key.keyCode == 18) {
        altPressed = true;
    } else if (!$('input').is(':focus') && key.keyCode in keyMap) {
        if (altPressed) keyMap[key.keyCode]();
    }
});

$(document).keyup(function (key) {
    if (key.keyCode == 16) {
        shiftPressed = false;
    } else if (key.keyCode == 18) {
        altPressed = false;
    }
});



//// DOM STUFF ////
var artWidthHeight = '150px';

var mainContainer = $("<div/>", {
        "id": "SCC-mainContainer"
    })
    .css({
        position: 'fixed',
        display: 'none',
        //'border-top-width': '4px',
        //'border-top-style': 'solid',
        //'border-top-color': themeColor,
        'z-index': '9999999999',
        top: '10px',
        right: '10px',
        width: '500px',
//        height: '200px',
        height: artWidthHeight,
        color: 'black',
        'background-color': 'white',
        'box-shadow': '0 8px 17px 0 rgba(0,0,0,0.2),0 6px 20px 0 rgba(0,0,0,0.19)',
        //'border-radius': '4px'
    });


var artDiv = $("<div/>", {
        "id": "SCC-artDiv"
    })
    .css({
        'background-image': "none",
        'background-size': artWidthHeight,
        'width': artWidthHeight,
        'height': artWidthHeight,
        //'margin-top': '25px',
        //'margin-left': '25px'
    })
    .appendTo(mainContainer);

var soundTitle = $("<div/>", {
        "id": "SCC-soundTitleContainer"
    })
    .css({
        position: 'absolute',
        top: '25px',
        left: '170px',
        width: '200px',
        'font-size': '14px'
    })
    .appendTo(mainContainer);



var title = $("<span/>", {
        "id": "SCC-title"
    })
    .html("Title")
    /*.css({
        color: '#333',
        margin: '0',
        'font-size': '16px'
    })*/
    .appendTo(soundTitle);

var progressDiv = $("<div/>", {
        "id": "SCC-progressDiv"
})
.css({
    position: 'absolute',
    width: '310px',
    bottom: '25px',
    left: '170px'
})
.appendTo(mainContainer);

var progressBar = $("<progress/>", {
    "id": "SCC-progress"
})
.css({
    width: '100%',
    height: '3px'
})
.attr('max', '100')
.attr('themeColor', '#f50')
.val('0')
.appendTo(progressDiv);

var progressCss = `
<style>
#SCC-progress {
    -webkit-appearance: none;
    appearance: none;
}

#SCC-progress::-webkit-progress-bar {
    background: #ccc;
}

#SCC-progress::-webkit-progress-value {
    background: ` + themeColor + `;
    transition: all .5s linear;
}

#SCC-progress.sc::-webkit-progress-value {
    background: #f50;
}
</style>
`



var controlsDiv = $("<div/>", {
        "id": "SCC-controls"
    })
    .css({
        position: 'absolute',
        //bottom: '25px',
        //right: '75px',
        top: '25px',
        right: '20px',
        //height: '50px'
    })
    .appendTo(mainContainer);

var prev = $("<a/>", {
        "id": "SCC-prev",
        "class": "SCC-commandButton",
        "data-command": "prev"
    })
    .append('<i class="material-icons">skip_previous</i>')
    .appendTo(controlsDiv);

var playPause = $("<a/>", {
        "id": "SCC-playPause",
        "class": "SCC-commandButton",
        "data-command": "playPause"
    })
    .append('<i class="material-icons">play_arrow</i>')
    .appendTo(controlsDiv);

var next = $("<a/>", {
        "id": "SCC-next",
        "class": "SCC-commandButton",
        "data-command": "next"
    })
    .append('<i class="material-icons">skip_next</i>')
    .appendTo(controlsDiv);

mainContainer.draggable();

mainContainer.find("i.material-icons").css({
    'font-size': '30px'
});


var insertHtml = function () {
    $("head").append('<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">');
    $(':root').append("<style>a.SCC-commandButton, a.SCC-commandButton:hover, a.SCC-commandButton:active { all: initial; * { all: unset; } }</style>");
    $(':root').append(progressCss);
    mainContainer.appendTo($("html"));

    $(".SCC-commandButton")
        .css({
            color: 'black',
            'text-decoration': 'none',
            cursor: 'pointer',
            border: 'none'
        })

        .mousedown(function () {
            $(this).css('color', themeColor);
        })
        .mouseup(function () {
            $(this).css('color', 'black');
        })

        .click(function () {
            send(pubnub, 'command', $(this).attr('data-command'));
        });

    $(".SCC-commandButton").css('color', 'inherit');

    $("#SCC-playPause").click(function () {
        var icon = $(this).children().eq(0);
        if (icon.html() == 'play_arrow') icon.html('pause');
        else if (icon.html() == 'pause') icon.html('play_arrow');
    });

};

insertHtml();
songTimeListener();
