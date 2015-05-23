'use strict';

var bencode = require('bencode');
var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');

// comments store, {infohash: [ ...comments ]}
var store = {};

/** @constructor */
function ut_comment(wire) {
  /* jshint -W040 */
  EventEmitter.call(this);

  this._wire = wire;

  // Are we send reqeuest for comments?
  this._requested = false;
}

inherits(ut_comment, EventEmitter);

ut_comment.prototype.name = 'ut_comment';

ut_comment.prototype.onHandshake = function (infoHash) {
  this._infoHash = infoHash.toString('hex');
};

ut_comment.prototype.onExtendedHandshake = function(handshake) {
  if (!handshake.m || !handshake.m.ut_comment) {
    return this.emit('warning', new Error('Peer does not support ut_comment'));
  }

  this._sendRequest();
  this._handle = setInterval(this._sendRequest.bind(this), 20*60*1000);

  this._wire.on('finish', function(){
    if ( this._handle ) {
      clearInterval(this._handle);
      this._handle = null;
    }
  }.bind(this));
};

ut_comment.prototype.onMessage = function(msg) {
  var dict;

  try {
    dict = bencode.decode( msg );
  } catch(e) {
    return this.emit('error', e);
  }

  switch (dict.msg_type) {
    case 0:
      this._onRequest( dict.num );
      break;
    case 1:
      this._onComment( dict.comments );
      break;
    default:
      return;
  }
};

ut_comment.prototype.comment = function(rating, comment) {
  if (rating > 5 || rating < 0) {
    return false;
  }

  store[ this._infoHash ] = store[ this._infoHash ] || [];

  store[ this._infoHash ].push({
    owner:"",
    text: comment,
    like: rating,
    timestamp: Date.now()
  });

  return true;
};

/** stop request comments */
ut_comment.prototype.cansel = function() {
  if ( this._handle ) {
    clearInterval(this._handle);
    this._handle = null;
  }
};

/** @private */
ut_comment.prototype._onRequest = function( num ) {
  this._requested = true;
  this._num = num;

  var comments = store[ this._infoHash ];
  comments = Array.isArray( comments ) ? comments : [];

  if ( comments.length > num ) {
    comments = comments.slice( -num );
  }

  comments.forEach(function(cm){
    cm.timestamp = Date.now() - cm.timestamp;
  });

  this._sendComments( comments );
};

/** @private */
ut_comment.prototype._onComment = function( comments ) {
  if ( !this._requested ) {
      return this.emit('warning', new Error('Peer send comments before request'));
  }

  if ( !comments.length ) {
    return;
  }

  comments.forEach(function(cm) {
    cm.timestamp = Date.now() - cm.timestamp;
    this.emit('comment', cm);
  }, this);
};

/** @private */
ut_comment.prototype._send = function(dict) {
  this._wire.extended('ut_comment', bencode.encode(dict));
};

/** @private */
ut_comment.prototype._sendRequest = function() {
  var filter = new Buffer(64);
  filter.fill(0);

  this._wire.extended('ut_comment', bencode.encode( {msg_type:0, num: 20, filter: filter.toString('binary')} ));
};

/** @private */
ut_comment.prototype._sendComments = function(comments) {
  this._wire.extended('ut_comment', bencode.encode( {msg_type:1, comments:comments} ));
};

ut_comment.comment = function(ih, rating, comment) {
  if (rating > 5 || rating < 0) {
    return false;
  }

  var infohash = Buffer.isBuffer(ih) ? ih.toString('hex') : ih;

  if ( infohash.length != 40 ) {
    return false;
  }

  store[ infohash ] = store[ infohash ] || [];

  store[ infohash ].push({
    owner:"",
    text: comment,
    like: rating,
    timestamp: Date.now()
  });

  return true;
};

module.exports = ut_comment;
