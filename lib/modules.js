/**
 * Module dependencies
 */

var rework = require('rework');
var whitespace = require('./whitespace');
var resolve = require('path').resolve;
var dirname = require('path').dirname;

/**
 * Initialize the rework modules
 *
 * The modules object is a path/function pair that
 * tells rework-modules how to load a module. It's only requirement
 * is that it has an 'index' property:
 *
 *   {
 *     'index': function() { return 'body { background: red; }' }
 *     'my-other-module': function() { return fs.readFileSync('my-styles.css', 'utf8'); }
 *   }
 *
 * @param {Object} modules
 * @return {Rework}
 */

module.exports = function(modules, index) {
  var parser = new Parser(modules);
  var out = parser.load(index || 'index');
  parser.insertPlaceholders(out);
  return out;
};

/**
 * Parse a rework-module
 *
 * @param {Parser} parser
 * @param {String?} name
 * @api private
 */

function parse(parser, name) {
  return function(style) {
    parser.parse(style, name);
  };
}

/**
 * Create a parser object
 *
 * @param {Object} modules
 * @api private
 */

function Parser (modules) {
  this.modules = modules;
  this.requires = {};
  this.exports = {};
  this.locals = {};
  this.cache = {};
}

/**
 * Load content by name
 *
 * @param {String} name
 * @return {Rework}
 */

Parser.prototype.load = function(path, position, parent) {
  if (this.cache[path]) return this.cache[path];
  var fn = this.modules[path];

  // try it as a dependency
  if (!fn && parent) fn = this.modules[parent + '/deps/' + path];

  if (!fn) throw new ParseError('could not find module \'' + path + '\'', position);

  if (typeof fn === 'string') return this.load(fn);

  var source = fn.source || path;

  var processed = whitespace(fn());

  var out = rework(processed, {source: source})
    .use(parse(this, source));
  out.source = source;

  this.cache[path] = out;

  return out;
};

/**
 * Parse the css ast
 *
 * @param {AST} style
 * @param {String} name
 */

Parser.prototype.parse = function(style, source) {
  var self = this;
  var rules = [];
  style.rules.forEach(function(rule) {
    if (rule.type === 'keyframes') return self.parseKeyframes(rule, source, rules);
    if (rule.type === 'supports') self.parse(rule, source);
    if (rule.type === 'host') self.parse(rule, source);
    if (rule.type === 'media') self.parse(rule, source);
    if (rule.type === 'document') self.parse(rule, source);
    if (select(rule, ':require')) return self.parseRequire(rule, source, rules);
    if (select(rule, ':content')) return self.parseContent(rule, source, rules);
    if (select(rule, ':exports')) return self.parseExports(rule, source, rules);
    if (select(rule, ':locals')) return self.parseLocals(rule, source, rules);
    if (select(rule, '%')) return self.parsePlaceholders(rule, source, rules);
    self.parseVariables(rule, source, rules);
  });
  style.rules = rules;
};

/**
 * Parse require statements
 *
 * @param {Object} rule
 * @param {String} source
 */

Parser.prototype.parseRequire = function(rule, source) {
  var self = this;
  var deps = this.requires[source] = {};

  rule.declarations.forEach(function(dep) {
    var name = dep.property;
    var absolute = self.resolve(source, dep.value);
    deps['$' + name] = self.load(absolute, dep.position, source.split('/')[0]);
  });
};

/**
 * Resolve the path to a module
 *
 * @param {String} source
 * @param {String} target
 */

Parser.prototype.resolve = function(source, target) {
  if (target.indexOf('.') !== 0) return target;
  source = dirname('/' + source);
  return resolve(source, target).substr(1);
};

/**
 * Parse conent statements
 *
 * @param {Object} rule
 * @param {String} source
 * @param {Array} rules
 */

Parser.prototype.parseContent = function(rule, source, rules) {
  var deps = this.requires[source] || {};

  rule.declarations.forEach(function(content) {
    var name = content.value;
    var dep = deps[name];
    if (!dep) throw new ParseError('could not resolve content \'' + name + '\'', content.position);

    rules.push(comment('begin content from ' + dep.source + ' in ' + source));
    dep.obj.stylesheet.rules.forEach(function(depRule) {
      rules.push(depRule);
    });
    rules.push(comment('end content from ' + dep.source + ' in ' + source));
  });
};

/**
 * Parse exports statements
 *
 * @param {Object} rule
 * @param {String} source
 */

Parser.prototype.parseExports = function(rule, source) {
  var exps = this.exports[source] = {};
  var self = this;
  rule.declarations.forEach(function(exp) {
    // export a placeholder to the global namespace
    var prop = '$' + exp.property;
    if (exp.value.indexOf('%') === 0) {
      return exps[prop] = '%' + source + '|' + exp.value.substr(1);
    }
    // export a variable
    if (exp.value.indexOf('$') === 0) {
      // TODO add functionality to export variables from other packages
      var locals = self.locals[source] || {};
      var val = locals[exp.value];
      if (!val) throw new ParseError('cannot export undefined variable \'' + exp.value + '\'', exp.position);
      return exps[prop] = val;
    }
    // export a value
    exps[prop] = exp.value;
  });
};

/**
 * Parse locals statements
 *
 * @param {Object} rule
 * @param {String} source
 */

Parser.prototype.parseLocals = function(rule, source) {
  var self = this;
  var locals = this.locals[source] = {};

  rule.declarations.map(function(local) {
    locals['$' + local.property] = self.substituteValues(local.value, source, local.position);
  });
};

/**
 * Parse placeholder statements
 *
 * @param {Object} rule
 * @param {String} source
 * @param {Array} rules
 */

Parser.prototype.parsePlaceholders = function(rule, source, rules) {
  var placeholders = this.placeholders = (this.placeholders || []);
  rule.selectors = rule.selectors.map(function(selector) {
    return '%' + source + '|' + selector.substr(1);
  });
  placeholders.push(rule);
};

/**
 * Inserts all parsed placeholders
 *
 * @param {Rework} out
 */

Parser.prototype.insertPlaceholders = function(out) {
  if (!this.placeholders) return;
  var style = out.obj.stylesheet;
  style.rules = this.placeholders.concat(style.rules);
};

/**
 * Parse variable statements
 *
 * @param {Object} rule
 * @param {String} source
 * @param {Array} rules
 */

Parser.prototype.parseVariables = function(rule, source, rules) {
  var self = this;

  // handle rules with no declarations
  if (!rule.declarations) return rules.push(rule);

  rule.declarations.forEach(function(dec) {
    // it's a local placeholder
    if (dec.value.indexOf('%') === 0) return dec.value = '%' + source + '|' + dec.value.substr(1);
    // it's a variable
    dec.value = self.substituteValues(dec.value, source, dec.position);
  });
  rules.push(rule);
};

/**
 * Substitue variable values
 *
 * @param {String} content
 * @param {String} source
 * @param {Object} position
 * @api private
 */

Parser.prototype.substituteValues = function(content, source, position) {
  var self = this;
  return content.replace(/\$([-.\w/]+)/g, function(_, name) {
    return self.resolveValue('$' + name, source, position);
  });
};

/**
 * Parse keyframe statements
 */

Parser.prototype.parseKeyframes = function(rule, source, rules) {
  var self = this;
  var frames = [];
  rule.keyframes.forEach(function(frame) {
    self.parseVariables(frame, source, frames);
  });
  rule.keyframes = frames;
  rules.push(rule);
};

/**
 * Resolve a variable's value
 *
 * @param {String} key
 * @param {String} source
 * @param {Object} position
 */

Parser.prototype.resolveValue = function(key, source, position) {
  return ~key.indexOf('/')
    ? this.resolveExported(key, source, position)
    : this.resolveLocal(key, source, position);
};

/**
 * Resolve a local variable
 *
 * @param {String} key
 * @param {String} source
 * @param {Object} position
 */

Parser.prototype.resolveLocal = function(key, source, position) {
  var locals = this.locals[source] || {};
  var val = locals[key];
  if (!val) throw new ParseError('could not resolve variable \'' + key + '\'', position);
  return val;
};

/**
 * Resolve an exported variable
 *
 * @param {String} key
 * @param {String} source
 * @param {Object} position
 */

Parser.prototype.resolveExported = function(key, source, position) {
  var parts = key.split('/');

  var required = parts[0];
  var requires = this.requires[source] || {};
  var resolved = requires[required];
  if (!resolved) throw new ParseError('\'' + required + '\'' + ' has not been required', position);

  var imported = '$' + parts[1];
  var exports = this.exports[resolved.source] || {};
  var exported = exports[imported];
  if (!exported) throw new ParseError('\'' + key + '\' has not been exported', position);

  return exported;
};

/**
 * Match the rule's selector on prefix
 *
 * @param {Object} rule
 * @param {String} prefix
 * @return {Boolean}
 */

function select(rule, prefix) {
 return rule.selectors && rule.selectors[0] && rule.selectors[0].indexOf(prefix) === 0;
}

/**
 * Create a comment
 *
 * @param {String} text
 * @param {String} source
 * @return {Object}
 */

function comment(text, source) {
  return {
    type: 'comment',
    comment: text,
    position: {source: source}
  };
}

/**
 * Create a parse error with source/line-number/col-number
 *
 * @param {String} message
 * @param {Object} position
 */

function ParseError(message, position) {
  this.name = 'ParseError';
  this.message = position
    ? message + ' at ' + position.source + ':' + position.start.line + ':' + position.start.column
    : message;
}
ParseError.prototype = Error.prototype;
