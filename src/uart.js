var SerialPort = require("serialport").SerialPort;


const     DEFAULT_COMMAND_DELAY = 30,
          DEFAULT_COMMAND_REPEAT = 3,
          DEFAULT_DEVICE = '/dev/ttyS0';

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
// Class MiLightUARTController
//

/**
 *
 * @param options
 * @constructor
 */
var MiLightUARTController = function (options) {
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

MiLightUARTController.prototype._createSerial = function () {
    var self = this;

    return Promise.settle([self._serialInit]).then(function () {

        return self._serialInit = new Promise(function (resolve, reject) {
            if (self.serial) {
                return resolve();
            }
            else {
                debug("Initializing SerialPort");
                var serial = new SerialPort(this.device, {
                  baudrate: this._baudrate
                }, false);

                serial.open(function (error) {
                  if ( error ) {
                    debug('Milight: SerialPort failed to open: ' + error);
                    return reject(error);
                  } else {
                    self.serial = serial;
                    debug('Milight: SerialPort opened');
                    return resolve();

                  }
                });
            }
        });
    });
};


MiLightUARTController.prototype._sendThreeByteArray = function (threeByteArray) {
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
MiLightUARTController.prototype.sendCommands = function (varArgArray) {
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
MiLightUARTController.prototype.pause = function (ms) {
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
MiLightUARTController.prototype.close = function () {
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
