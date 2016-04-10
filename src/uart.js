var SerialPort = require("serialport").SerialPort;
var Promise = require('bluebird');
var debug = process.env.hasOwnProperty('MILIGHT_DEBUG') ? consoleDebug : function () {
};


const     DEFAULT_COMMAND_DELAY = 0,
          DEFAULT_COMMAND_REPEAT = 1,
          DEFAULT_DEVICE = '/dev/ttyAMA0',
          DEFAULT_BAUDRATE = 9600;

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

//
// Class MilightUARTController
//

/**
 *
 * @param options
 * @constructor
 */
var MilightUARTController = function (options) {
    options = options || {};

    this.device = options.device || DEFAULT_DEVICE;
    this._baudrate = options.baudrate || DEFAULT_BAUDRATE;
    this._delayBetweenCommands = options.delayBetweenCommands || DEFAULT_COMMAND_DELAY;
    this._commandRepeat = options.commandRepeat || DEFAULT_COMMAND_REPEAT;
    this._serialInit = Promise.resolve();
    this._lastRequest = this._createSerial();
    this._sendRequest = Promise.resolve();
    debug("Milight-Uart:" + JSON.stringify({
        dev: this.device,
        delayBetweenCommands: this._delayBetweenCommands,
        commandRepeat: this._commandRepeat
    }));
};

//
// Private member functions
//

MilightUARTController.prototype._createSerial = function () {
    var self = this;

    return Promise.settle([self._serialInit]).then(function () {

        return self._serialInit = new Promise(function (resolve, reject) {
            if (self.serial) {
                return resolve();
            }
            else {
                debug("Initializing SerialPort");

                try {
                  var serial = new SerialPort(self.device, {
                    baudrate: self._baudrate
                  }, true, function (error) {
                    if ( error ) {
                      debug('Milight: SerialPort failed to open: ' + error.message);
                      return reject(error);
                    } else {
                      self.serial = serial;
                      debug('Milight: SerialPort opened');
                      return resolve();

                    }
                  });
                } catch (err) {
                  debug('Milight: SerialPort constructor error: ' + err.message);
                }
            }
        });
    });
};


MilightUARTController.prototype._sendThreeByteArray = function (threeByteArray) {
  if (!threeByteArray instanceof Array) {
    return Promise.reject(new Error("Array argument required"));
  }
  var buffer = new Buffer(threeByteArray),
  self = this;

  return self._sendRequest = Promise.settle([self._sendRequest]).then(function () {

    return new Promise(function (resolve, reject) {
      self._createSerial().then(function () {
        self.serial.write(buffer, function () {
          self.serial.drain(function (err) {
            if (err) {
              debug("Milight: SerialPort.write error:" + err);
              return reject(err);
            }
            else {
              debug('Milight: SerialPort.write success; buffer=[' + buffer2hex(buffer) + ']');
              return Promise.delay(self._delayBetweenCommands).then(function () {
                return resolve();
              });
            }
          });

        });
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
MilightUARTController.prototype.sendCommands = function (varArgArray) {
    var stackedCommands = [],
        varArgs = arguments,
        self = this;

    return self._lastRequest = Promise.settle([self._lastRequest]).then(function () {

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
        return Promise.settle(stackedCommands);
    });
};


/**
 *
 * @param ms
 * @returns {*}
 */
MilightUARTController.prototype.pause = function (ms) {
    var self = this;
    ms = ms || 100;

    return self._lastRequest = Promise.settle([self._lastRequest]).then(function () {
        return Promise.delay(ms);
    });
};


/**
 *
 * @returns {*}
 */
MilightUARTController.prototype.close = function () {
    var self = this;

    return self._lastRequest = Promise.settle([self._lastRequest]).then(function () {
        if (self.serial) {
            self.serial.close(function () {
              delete self.serial;
              return Promise.resolve();
            });
        } else {
          return Promise.resolve();
        }
    });
};


module.exports = MilightUARTController;
