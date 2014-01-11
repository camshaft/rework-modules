/**
 * Module dependencies
 */

var ws = require('css-whitespace');

/**
 * Parse css whitespace if the string ends in a '}'
 */

module.exports = function whitespace(raw){
  var re = /([^}])$/;
  var test = re.exec(raw.trim());
  if (test && test[0]) return ws(raw);
  return raw;
};
