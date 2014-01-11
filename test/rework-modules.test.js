/**
 * Module dependencies
 */

var should = require('should');

var parser = require('..');

var fs = require('fs');
var path = require('path');
var join = path.join;
var read = fs.readFileSync;

readdir('test/cases');

function readdir(dir) {
  var modules = {};
  fs.readdirSync(dir).forEach(function(title) {

    var pkg = title.split(' ').join('-');
    // TODO recursive list?
    fs.readdirSync(join(dir, title)).forEach(function(file) {
      var f = file.replace('.styl', '').replace('.css', '');
      var abs = pkg + '/' + f;
      modules[abs] = load;
      if (f === 'index') modules[pkg] = abs;
      function load() {
        return read(join(dir, title, file), 'utf8');
      };
    });

    if (title.indexOf('ignore') === 0) return;

    it('should ' + title, function() {
      if (title.indexOf('fail') === 0) {
        (function() {
          parser(modules, pkg);
        }).should.throw();
      } else {
        var expected = modules[pkg + '/' + 'expected'];
        if (!expected) throw new Error('Missing \'expected.css\' file');
        var out = parser(modules, pkg);
        expected().should.equal(out.toString());
      }
    });
  });
}

