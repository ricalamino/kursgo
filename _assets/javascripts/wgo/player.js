(function(WGo){

"use strict";

var FileError = function(path, code) {
	this.name = "FileError";

    if(code == 1) this.message = "File '"+path+"' is empty.";
	else if(code == 2) this.message = "Network error. It is not possible to read '"+path+"'.";
	else this.message = "File '"+path+"' hasn't been found on server.";
};

FileError.prototype = new Error();
FileError.prototype.constructor = FileError;

WGo.FileError = FileError;

// ajax function for loading of files
var loadFromUrl = WGo.loadFromUrl = function(url, callback) {
	
	var xmlhttp = new XMLHttpRequest();
	xmlhttp.onreadystatechange = function() {
		if (xmlhttp.readyState == 4) {
			if(xmlhttp.status == 200) {
				if(xmlhttp.responseText.length == 0) {
					throw new FileError(url, 1);
				}
				else {
					callback(xmlhttp.responseText);
				}
			}
			else {
				throw new FileError(url);
			}
		}
	}
	
	try {
		xmlhttp.open("GET", url, true);
		xmlhttp.send();	
	}
	catch(err) {
		throw new FileError(url, 2);
	}
	
};

// basic updating function - handles board changes
var update_board = function(e) {
	// update board's position
	if(e.change) this.board.update(e.change);
	
	// remove old markers from the board
	if(this.temp_marks) this.board.removeObject(this.temp_marks);
	
	// init array for new objects
	var add = [];
	
	this.notification();
	
	// add current move marker
	if(e.node.move && this.config.markLastMove) {
		if(e.node.move.pass) this.notification(WGo.t((e.node.move.c == WGo.B ? "b" : "w")+"pass"));
		else add.push({
			type: "CR",
			x: e.node.move.x, 
			y: e.node.move.y
		});
	}
	
	// add variation letters
    if (this.config.showVariations !== false || this.config.showNextMove) {
        if (e.node.children.length > 1 || this.config.showNextMove) {
            for (var i = 0; i < e.node.children.length; i++) {
                if (e.node.children[i].move && !e.node.children[i].move.pass) {
                    add.push({
                        type: "LB",
                        text: String.fromCharCode(65 + i),
                        x:    e.node.children[i].move.x,
                        y:    e.node.children[i].move.y,
                        c:    "rgba(0,32,128,0.8)"
                    });
                }
            }
        }
    }
	
	// add other markup
	if(e.node.markup) {
		for(var i in e.node.markup) {
			for(var j = 0; j < add.length; j++) {
				if(e.node.markup[i].x == add[j].x && e.node.markup[i].y == add[j].y) {
					add.splice(j,1);
					j--;
				}
			}
		}
		add = add.concat(e.node.markup);
	}
	
	// add new markers on the board
	this.temp_marks = add;
	this.board.addObject(add);
};

// preparing board
var prepare_board = function(e) {
	// set board size
	this.board.setSize(e.kifu.size);
	
	// remove old objects
	this.board.removeAllObjects();
	
	// activate wheel
	if(this.config.enableWheel) this.setWheel(true);
};

// detecting scrolling of element - e.g. when we are scrolling text in comment box, we want to be aware. 
var detect_scrolling = function(node, bp) {
	if(node == bp.element || node == bp.element) return false;
	else if(node._wgo_scrollable || (node.scrollHeight > node.offsetHeight)) return true;
	else return detect_scrolling(node.parentNode, bp);
};

// mouse wheel event callback, for replaying a game
var wheel_lis = function(e) {
	var delta = e.wheelDelta || e.detail*(-1);
	
	// if there is scrolling in progress within an element, don't change position
	if(detect_scrolling(e.target, this)) return true;
	
	if(delta < 0) {
		this.next();
		if(this.config.lockScroll && e.preventDefault) e.preventDefault();
		return !this.config.lockScroll;
	}
	else if(delta > 0) {
		this.previous();
		if(this.config.lockScroll && e.preventDefault) e.preventDefault();
		return !this.config.lockScroll;
	}
	return true;
};

// keyboard click callback, for replaying a game
var key_lis = function(e) {
	if(document.querySelector(":focus")) return true;
	
	switch(e.keyCode) {
		case 39: this.next(); break;
		case 37: this.previous(); break;
		//case 40: this.selectAlternativeVariation(); break;
		default: return true;
	}
	if(this.config.lockScroll && e.preventDefault) e.preventDefault()
	return !this.config.lockScroll;
};

// function handling board clicks in normal mode
var board_click_default = function(x,y) {
    if (this.config.noClick) return false;
	if(!this.kifuReader || !this.kifuReader.node) return false;

    var c = this.kifuReader.game.turn,
        moveValidityStatus = this.kifuReader.game.play(x, y, c, true),
        kifuPathIndex = -1;

    if (typeof moveValidityStatus == 'number') {
        quickDispatchEvent.call(this, "illegal", { error: moveValidityStatus });
        return false;
    }

    // try to find if the move is included in kifu
    this.kifuReader.node.children.forEach(function (child, index) {
        if (child.move.x == x && child.move.y == y) {
            kifuPathIndex = index;
            return false;
        }
    }, this);

    // if move in kifu - play it
    if (kifuPathIndex > -1) {
        this.next(kifuPathIndex);
        quickDispatchEvent.call(this, "played");

    // if move is not in kifu
    } else if (this.config.showNotInKifu) {

        appendNodeAndPlay.call(this, new WGo.KNode({
            move: {
                x: x,
                y: y,
                c: c
            }
        }));
        quickDispatchEvent.call(this, "played");

    } else {
        quickDispatchEvent.call(this, "notinkifu");
        return false; // no auto-respond is supported in this case
    }

    if (this.config.autoRespond) {

        // if there is response in kifu
        if (this.kifuReader.node.children.length) {
            delay.call(this, function () {
                this.next(0);
                quickDispatchEvent.call(this, "responded");

                if (!this.kifuReader.node.children.length) {
                    quickDispatchEvent.call(this, "nomoremoves");
                }
            }, this.config.responseDelay);

        } else {

            var response = null;

            if (kifuPathIndex === -1) {
                // find children with pas, if found, get next move as a response
                this.kifuReader.node.parent.children.forEach(function (child) {
                    if (child.move.pass) {
                        response = child.children[0];
                        return false;
                    }
                }, this);
            }

            if (response) {
                delay.call(this, function () {
                    appendNodeAndPlay.call(this, response);
                    quickDispatchEvent.call(this, "responded");

                    if (!response.children.length) {
                        quickDispatchEvent.call(this, "nomoremoves");
                    }
                }, this.config.responseDelay);
            } else {
                quickDispatchEvent.call(this, "noresponse");
                quickDispatchEvent.call(this, "nomoremoves");
            }
        }

    } else if (this.config.autoPass) {
        delay.call(this, function () {
            appendNodeAndPlay.call(this, new WGo.KNode({
                move: {
                    pass: true
                }
            }));
            quickDispatchEvent.call(this, "responded");
            quickDispatchEvent.call(this, "nomoremoves");
        }, this.config.responseDelay);
    }
};

/**
 * Quick event dispatcher
 * @param {String} event
 * @param {Object} [extraParams]
 */
function quickDispatchEvent(event, extraParams) {
    var params = {
        type: event,
        target: this,
        node: this.kifuReader.node,
        position: this.kifuReader.getPosition(),
        path: this.kifuReader.path,
        change: this.kifuReader.change
    };

    if (extraParams) {
        for (var p in extraParams) {
            if (extraParams.hasOwnProperty(p)) {
                params[p] = extraParams[p];
            }
        }
    }

    this.dispatchEvent(params);
}

function appendNodeAndPlay(node) {
    this.kifuReader.node.appendChild(node);
    this.next(this.kifuReader.node.children.length - 1);
}

function delay(callback, delay) {
    var self = this,
        prevNoClickState = this.config.noClick;

    if (delay > 0) {
        self.config.noClick = true;
        setTimeout(function () {
            self.config.noClick = prevNoClickState;
            callback.call(self);
        }, delay);
    } else {
        callback.call(self);
    }
}

// coordinates drawing handler - adds coordinates on the board
/*var coordinates = {
	grid: {
		draw: function(args, board) {
			var ch, t, xright, xleft, ytop, ybottom;
			
			this.fillStyle = "rgba(0,0,0,0.7)";
			this.textBaseline="middle";
			this.textAlign="center";
			this.font = board.stoneRadius+"px "+(board.font || "");
			
			xright = board.getX(-0.75);
			xleft = board.getX(board.size-0.25);
			ytop = board.getY(-0.75);
			ybottom = board.getY(board.size-0.25);
			
			for(var i = 0; i < board.size; i++) {
				ch = i+"A".charCodeAt(0);
				if(ch >= "I".charCodeAt(0)) ch++;
				
				t = board.getY(i);
				this.fillText(board.size-i, xright, t);
				this.fillText(board.size-i, xleft, t);
				
				t = board.getX(i);
				this.fillText(String.fromCharCode(ch), t, ytop);
				this.fillText(String.fromCharCode(ch), t, ybottom);
			}
			
			this.fillStyle = "black";
		}
	}
}*/

/**
 * We can say this class is abstract, stand alone it doesn't do anything. 
 * However it is useful skelet for building actual player's GUI. Extend this class to create custom player template.
 * It controls board and inputs from mouse and keyboard, but everything can be overriden.
 *
 * Possible configurations:
 *  - sgf: sgf string (default: undefined)
 *  - json: kifu stored in json/jgo (default: undefined)
 *  - sgfFile: sgf file path (default: undefined)
 *  - board: configuration object of board (default: {})
 *  - enableWheel: allow player to be controlled by mouse wheel (default: true)
 *  - lockScroll: disable window scrolling while hovering player (default: true),
 *  - enableKeys: allow player to be controlled by arrow keys (default: true),
 *  - markLastMove: marks the last move with a circle (default: true),
 *
 * @param {object} config object if form: {key1: value1, key2: value2, ...}
 */

var Player = function(config) {
	this.config = config;
	
	// add default configuration
	for(var key in Player.default) if(this.config[key] === undefined && Player.default[key] !== undefined) this.config[key] = Player.default[key];
	
	this.element = document.createElement("div");
	this.board = new WGo.Board(this.element, this.config.board);
	
	this.init();
	this.initGame();
};

Player.prototype = {
	constructor: Player,
	
	/**
	 * Init player. If you want to call this method PlayerView object must have these properties: 
	 *  - player - WGo.Player object
	 *  - board - WGo.Board object (or other board renderer)
	 *  - element - main DOMElement of player
	 */
	 
	init: function() {
		// declare kifu
		this.kifu = null;
		
		// creating listeners
		this.listeners = {
			kifuLoaded: [prepare_board.bind(this)],
			update: [update_board.bind(this)],
			frozen: [],
			unfrozen: [],
		};
		
		if(this.config.kifuLoaded) this.addEventListener("kifuLoaded", this.config.kifuLoaded);
		if(this.config.update) this.addEventListener("update", this.config.update);
		if(this.config.frozen) this.addEventListener("frozen", this.config.frozen);
		if(this.config.unfrozen) this.addEventListener("unfrozen", this.config.unfrozen);
        if(this.config.notinkifu) this.addEventListener("notinkifu", this.config.notinkifu);
        if(this.config.nomoremoves) this.addEventListener("nomoremoves", this.config.notinkifu);
		
		this.board.addEventListener("click", board_click_default.bind(this));
		this.element.addEventListener("click", this.focus.bind(this));
		
		this.focus();
	},
	
	initGame: function() {
		// try to load game passed in configuration
		if(this.config.sgf) {
			this.loadSgf(this.config.sgf, this.config.move);
		}
		else if(this.config.json) {
			this.loadJSON(this.config.json, this.config.move);
		}
		else if(this.config.sgfFile) {
			this.loadSgfFromFile(this.config.sgfFile, this.config.move);
		}

	},
	
	/**
	 * Create update event and dispatch it. It is called after position's changed.
	 *
	 * @param {string} op an operation that produced update (e.g. next, previous...)
	 */
	
	update: function(op) {
		if(!this.kifuReader || !this.kifuReader.change) return;
		
		var ev = {
			type: "update",
			op: op,
			target: this,
			node: this.kifuReader.node,
			position: this.kifuReader.getPosition(),
			path: this.kifuReader.path,
			change: this.kifuReader.change
		};
		
		//if(!this.kifuReader.node.parent) ev.msg = this.getGameInfo();

		this.dispatchEvent(ev);
	},

    /**
     * Resets player
     */
    reset: function () {
        this.kifuReader.goTo(0);
        this.update();
    },
	
	/**
	 * Prepare kifu for replaying. Event 'kifuLoaded' is triggered.
	 *
	 * @param {WGo.Kifu} kifu object
	 * @param {Array} path array
	 */
	
	loadKifu: function(kifu, path) {
		this.kifu = kifu;

		// kifu is replayed by KifuReader, it manipulates a Kifu object and gets all changes
		this.kifuReader = new WGo.KifuReader(this.kifu, this.config.rememberPath, this.config.allowIllegalMoves);
		
		// fire kifu loaded event
		this.dispatchEvent({
			type: "kifuLoaded",
			target: this,
			kifu: this.kifu,
		});
		
		// handle permalink
		/*if(this.config.permalinks) {
			if(!permalinks.active) init_permalinks();
			if(permalinks.query.length && permalinks.query[0] == this.view.element.id) {
				handle_hash(this);
			}
		}*/
		
		// update player - initial position in kifu doesn't have to be an empty board
		this.update("init");
		
		if(path) {
			this.goTo(path);
		}
		
		/*if(this.kifu.nodeCount === 0) this.error("");
		else if(this.kifu.propertyCount === 0)*/

	},
	
	/**
	 * Load go kifu from sgf string.
	 *
	 * @param {string} sgf
	 */
	 
	loadSgf: function(sgf, path) {
		try {
			this.loadKifu(WGo.Kifu.fromSgf(sgf), path);
		}
		catch(err) {
			this.error(err);
		}
	},
	
	/**
	 * Load go kifu from JSON object.
	 */
	
	loadJSON: function(json, path) {
		try {
			this.loadKifu(WGo.Kifu.fromJGO(json), path);
		}
		catch(err) {
			this.error(err);
		}
	},
	
	/**
	 * Load kifu from sgf file specified with path. AJAX is used to load sgf content. 
	 */
	
	loadSgfFromFile: function(file_path, game_path) {
		var _this = this;
		try {
			loadFromUrl(file_path, function(sgf) {
				_this.loadSgf(sgf, game_path);
			});
		}
		catch(err) {
			this.error(err);
		}
	},
	
	/**
	 * Implementation of EventTarget interface, though it's a little bit simplified.
	 * You need to save listener if you would like to remove it later.
	 *
	 * @param {string} type of listeners
	 * @param {Function} listener callback function
	 */

	addEventListener: function(type, listener) {
		this.listeners[type] = this.listeners[type] || [];
		this.listeners[type].push(listener);
	},
	
	/**
	 * Remove event listener previously added with addEventListener.
	 *
	 * @param {string} type of listeners
	 * @param {Function} listener function
	 */
	
	removeEventListener: function(type, listener) {
		if(!this.listeners[type]) return;
		var i = this.listeners[type].indexOf(listener);
		if(i != -1) this.listeners[type].splice(i,1);
	},
	
	/**
	 * Dispatch an event. In default there are two events: "kifuLoaded" and "update"
	 * 
	 * @param {string} evt event
	 */
	 
	dispatchEvent: function(evt) {
		if(!this.listeners[evt.type]) return;
		for(var l in this.listeners[evt.type]) this.listeners[evt.type][l](evt);
	},
	
	/**
	 * Output function for notifications.
 	 */
	
	notification: function(text) {
		if(console) console.log(text);
	},
	
	/**
	 * Output function for helps.
 	 */
	
	help: function(text) {
		if(console) console.log(text);
	},
	
	/**
	 * Output function for errors. TODO: reporting of errors - by cross domain AJAX
	 */
	
	error: function(err) {
		if(!WGo.ERROR_REPORT) throw err;
		
		if(console) console.log(err);
	
	},
	
	/**
	 * Play next move.
	 * 
	 * @param {number} i if there is more option, you can specify it by index
	 */
	
	next: function(i) {
		if(this.frozen || !this.kifu) return;
		
		try {
			this.kifuReader.next(i);
			this.update();
		}
		catch(err) {
			this.error(err);
		}
	},
	
	/**
	 * Get previous position.
	 */
	
	previous: function() {
		if(this.frozen || !this.kifu) return;
		
		try{
			this.kifuReader.previous();
			this.update();
		}
		catch(err) {
			this.error(err);
		}
	},

	/**
	 * Play all moves and get last position.
	 */
	
	last: function() {
		if(this.frozen || !this.kifu) return;
		
		try {
			this.kifuReader.last();
			this.update();
		}
		catch(err) {
			this.error(err);
		}
	},
	
	/**
	 * Get a first position.
	 */
	
	first: function() {
		if(this.frozen || !this.kifu) return;
		
		try {
			this.kifuReader.first();
			this.update();
		}
		catch(err) {
			this.error(err);
		}
	},

	/**
	 * Go to a specified move.
	 * 
	 * @param {number|Array} move number of move, or path array
	 */
	
	goTo: function(move) {
		if(this.frozen || !this.kifu) return;
		var path;
		if(typeof move == "function") move = move.call(this);
		
		if(typeof move == "number") {
			path = WGo.clone(this.kifuReader.path);
			path.m = move || 0;
		}
		else path = move;
		
		try {
			this.kifuReader.goTo(path);
			this.update();
		}
		catch(err) {
			this.error(err);
		}
	},
	
	/**
	 * Get information about actual game(kifu)
	 *
	 * @return {Object} game info
	 */
	 
	getGameInfo: function() {
		if(!this.kifu) return null;
		var info = {};
		for(var key in this.kifu.info) {
			if(WGo.Kifu.infoList.indexOf(key) == -1) continue;
			if(WGo.Kifu.infoFormatters[key]) {
				info[WGo.t(key)] = WGo.Kifu.infoFormatters[key](this.kifu.info[key]);
			}
			else info[WGo.t(key)] = WGo.filterHTML(this.kifu.info[key]);
		}
		return info;
	},
	
	/**
	 * Freeze or onfreeze player. In frozen state methods: next, previous etc. don't work.
	 */
	
	setFrozen: function(frozen) {
		this.frozen = frozen;
		this.dispatchEvent({
			type: this.frozen ? "frozen" : "unfrozen",
			target: this,
		});
	},
	
	/**
	 * Append player to given element.
	 */
	
	appendTo: function(elem) {
		elem.appendChild(this.element);
	},
	
	/**
	 * Get focus on the player
	 */
	
	focus: function() {
		if(this.config.enableKeys) this.setKeys(true);
	},
	
	/**
	 * Set controlling of player by arrow keys.
	 */
	 
	setKeys: function(b) {
		if(b) {
			document.onkeydown = key_lis.bind(this);
		}
		else {
			document.onkeydown = null;
		}
	},
	
	/**
	 * Set controlling of player by mouse wheel.
	 */
	
	setWheel: function(b) {
		if(!this._wheel_listener && b) {
			this._wheel_listener = wheel_lis.bind(this);
			var type = (document.onmousewheel !== undefined) ? "mousewheel" : "DOMMouseScroll";
			this.element.addEventListener(type, this._wheel_listener);
		}
		else if(this._wheel_listener && !b) {
			var type = (document.onmousewheel !== undefined) ? "mousewheel" : "DOMMouseScroll";
			this.element.removeEventListener(type, this._wheel_listener);
			delete this._wheel_listener;
		}
	}, 
	
	/**
	 * Toggle coordinates around the board.
	 */
	 
	setCoordinates: function(b) {
		if(!this.coordinates && b) {
			this.board.setSection(-0.5, -0.5, -0.5, -0.5);
			this.board.addCustomObject(WGo.Board.coordinates);
		}
		else if(this.coordinates && !b) {
			this.board.setSection(0, 0, 0, 0);
			this.board.removeCustomObject(WGo.Board.coordinates);
		}
		this.coordinates = b;
	}
};

Player.default = {
	sgf: undefined,
	json: undefined,
	sgfFile: undefined,
    problemSgf: undefined,
    problemSgfFile: undefined,
	move: undefined,
	board: {},
	enableWheel: true,
	lockScroll: true,
	enableKeys: true,
	rememberPath: true,
	kifuLoaded: undefined,
	update: undefined,
	frozen: undefined,
	unfrozen: undefined,
	allowIllegalMoves: false,
	markLastMove: true,
    showVariations: true,
    showNextMove: false,
    autoRespond: false,
    autoPass: false,
    showNotInKifu: false,
    notinkifu: undefined,
    nomoremoves: undefined,
    responseDelay: 400,
    noClick: false
};

WGo.Player = Player;

//--- i18n support ------------------------------------------------------------------------------------------

/**
 * For another language support, extend this object with similiar object.
 */
 
var player_terms = {
	"about-text": "<h1>WGo.js Player 2.0</h1>"
				+ "<p>WGo.js Player is extension of WGo.js, HTML5 library for purposes of game of go. It allows to replay go game records and it has many features like score counting. It is also designed to be easily extendable.</p>"
				+ "<p>WGo.js is open source licensed under <a href='http://en.wikipedia.org/wiki/MIT_License' target='_blank'>MIT license</a>. You can use and modify any code from this project.</p>"
				+ "<p>You can find more information at <a href='http://wgo.waltheri.net/player' target='_blank'>wgo.waltheri.net/player</a></p>"
				+ "<p>Copyright &copy; 2013 Jan Prokop</p>",
	"black": "Black",
	"white": "White",
	"DT": "Date",
	"KM": "Komi",
	"HA": "Handicap",
	"AN": "Annotations",
	"CP": "Copyright",
	"GC": "Game comments",
	"GN": "Game name",
	"ON": "Fuseki",
	"OT": "Overtime",
	"TM": "Basic time",
	"RE": "Result",
	"RO": "Round",
	"RU": "Rules",
	"US": "Recorder",
	"PC": "Place",
	"EV": "Event",
	"SO": "Source",
	"none": "none",
	"bpass": "Black passed."
};

for(var key in player_terms) WGo.i18n.en[key] = player_terms[key];

}(WGo));
