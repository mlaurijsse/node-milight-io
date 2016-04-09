var Promise = require('bluebird'),
    dgram = require('dgram'),
    debug = process.env.hasOwnProperty('MILIGHT_DEBUG') ? consoleDebug : function () {
    };

const
    DEFAULT_IP = '255.255.255.255',
    DEFAULT_PORT = 8899,
    DEFAULT_COMMAND_DELAY = 30,
    DEFAULT_COMMAND_REPEAT = 3;

//
// Local helper functions
//

function buffer2hex(buffer) {
    var result = [];
    for (var i = 0; i < buffer.length; i++) {
        result.push('0x' + buffer[i].toString(16));
    }
    return result;
}


function consoleDebug() {
    console.log.apply(this, arguments);
}

function settlePromise(aPromise) {
    return aPromise.reflect();
}

function settlePromises(promisesArray) {
    return Promise.all(promisesArray.map(function(promise) {
        return promise.reflect()
    }));
}

//
// Class MilightController
//

/**
 *
 * @param options
 * @constructor
 */
var MilightController = function (options) {
    options = options || {};

    this.ip = options.ip || DEFAULT_IP;
    this._broadcastMode = this.ip === DEFAULT_IP;
    this.port = options.port || DEFAULT_PORT;
    this._delayBetweenCommands = options.delayBetweenCommands || DEFAULT_COMMAND_DELAY;
    this._commandRepeat = options.commandRepeat || DEFAULT_COMMAND_REPEAT;
    this._socketInit = Promise.resolve();
    this._lastRequest = this._createSocket();
    this._sendRequest = Promise.resolve();
    debug("Milight:" + JSON.stringify({
        ip: this.ip,
        port: this.port,
        delayBetweenCommands: this._delayBetweenCommands,
        commandRepeat: this._commandRepeat
    }));
};

//
// Private member functions
//

MilightController.prototype._createSocket = function () {
    var self = this;

    return settlePromise(self._socketInit).then(function () {

        return self._socketInit = new Promise(function (resolve, reject) {
            if (self.clientSocket) {
                return resolve();
            }
            else {
                debug("Initializing Socket");
                var socket = dgram.createSocket('udp4');

                if (self._broadcastMode) {
                    socket.bind(function () {
                        socket.setBroadcast(true);
                        self.clientSocket = socket;
                        debug("Milight: Initializing Socket (broadcast mode) completed");
                        return resolve();
                    });
                }
                else {
                    self.clientSocket = socket;
                    debug("Milight: Initializing Socket done");
                    return resolve();
                }
            }
        });
    });
};


MilightController.prototype._sendThreeByteArray = function (threeByteArray) {
    if (!threeByteArray instanceof Array) {
        return Promise.reject(new Error("Array argument required"));
    }
    var buffer = new Buffer(threeByteArray),
        self = this;

    return self._sendRequest = settlePromise(self._sendRequest).then(function () {

        return new Promise(function (resolve, reject) {
            self._createSocket().then(function () {
                self.clientSocket.send(buffer,
                     0,
                     buffer.length,
                     self.port,
                     self.ip,
                     function (err, bytes) {
                        if (err) {
                            debug("UDP socket error:" + err);
                            return reject(err);
                        }
                        else {
                            debug('Milight: bytesSent=' + bytes + ', buffer=[' + buffer2hex(buffer) + ']');
                            return Promise.delay(self._delayBetweenCommands).then(function () {
                                return resolve();
                            });
                        }
                    }
                );
            }).catch(function (error) {
                return reject(error);
            });
        });
    });
};

//
// Public member functions
//

/**
 *
 * @param varArgArray
 * @returns {*}
 */
MilightController.prototype.sendCommands = function (varArgArray) {
    var stackedCommands = [],
        varArgs = arguments,
        self = this;

    return self._lastRequest = settlePromise(self._lastRequest).then(function () {

        for (var r = 0; r < self._commandRepeat; r++) {
            for (var i = 0; i < varArgs.length; i++) {
                if (!varArgs[i] instanceof Array) {
                    return Promise.reject(new Error("Array arguments required"));
                }
                else {
                    var arg = varArgs[i];
                    if (((arg.length) > 0) && (arg[0] instanceof Array)) {
                        for (var j = 0; j < arg.length; j++) {
                            stackedCommands.push(self._sendThreeByteArray(arg[j]));
                        }
                    }
                    else {
                        stackedCommands.push(self._sendThreeByteArray(arg));
                    }
                }
            }
        }
        return settlePromises(stackedCommands)
    });
};


/**
 *
 * @param ms
 * @returns {*}
 */
MilightController.prototype.pause = function (ms) {
    var self = this;
    ms = ms || 100;

    return self._lastRequest = settlePromise(self._lastRequest).then(function () {
        return Promise.delay(ms);
    });
};


/**
 *
 * @returns {*}
 */
MilightController.prototype.close = function () {
    var self = this;

    return self._lastRequest = settlePromise(self._lastRequest).then(function () {
        if (self.clientSocket) {
            self.clientSocket.close();
            delete self.clientSocket;
        }
        return Promise.resolve();
    });
};


module.exports = MilightController;
