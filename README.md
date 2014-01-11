rework-modules [![Build Status](https://travis-ci.org/CamShaft/rework-modules.png?branch=master)](https://travis-ci.org/CamShaft/rework-modules)
==============

Rework plugin for modular css.

`rework-modules` allows you to export and require other css modules and easily share variables and extensions.

See the [tests](https://github.com/CamShaft/rework-modules/tree/master/test/cases) for some examples.

Installation
------------

```sh
$ npm install rework-modules
```

You can also try the [rework-modules component plugin](https://github.com/shoelace-ui/shoelace-component) for [component](https://github.com/component/component) build integration.

Usage
-----

`rework-modules` expects an object as an argument that contains functions to load content. It also needs an `index` to be told where to start loading. For example, let's say we have the following directory structure:

```sh
$ tree
.
├── my-app
│   ├── index.styl
│   └── other-styles.styl
├── my-theme
│   ├── index.styl
```

We would need to pass an object like the following:

```js
var rework = require('rework-modules');
var read = require('fs').readFileSync;

var modules = {
  'index': 'my-app/index',
  'my-app': 'my-app/index',
  'my-app/index': function () { return read('my-app/index.styl', 'utf8') },
  'my-app/other-styles': function () { return read('my-app/other-styles.styl', 'utf8') },
  'my-theme': 'my-theme/index',
  'my-theme/index': function () { return read('my-theme/index.styl', 'utf8') }
};

var out = rework(modules);
```

You can also specify the main style as a second parameter:

```js
var out = rework(modules, 'my-app/other-styles');
```

The value returned is the `Rework` object and can easily be extended like you're used to:

```js
var out = rework(modules)
  .use(myReworkPlugin())
  .toString();
```

`NOTE` The `css-whitespace` plugin is already included.

Syntax
------

### :locals

```css
:locals {
  my-local-variable: url(http://example.com/image.png);
}

.image {
  background-image: $my-local-variable;
}
```

### :exports

```css
:locals {
  my-local-color: blue;
}

%my-placeholder {
  background-color: red;
}

:exports {
  color: $my-local-color;
  cool-background: %my-placeholder;
  static-value: #ccc;
}
```

### :require

```css
:require {
  other-module: other-module;
}
```

Once a module is required we can start using the exported variables from it:

```css
.my-class {
  color: $other-module/color;
}
```

You can also use exported placeholders if you've included the [inherit](https://github.com/reworkcss/rework-inherit) plugin:

```css
.my-class {
  extend: $other-module/placeholder;
}
```

### :content

By default the content of a required module is not included. To include it use `:content`:

```css
:require {
  other-module: other-module;
}

.my-class {
  color: teal;
}

:content {
  from: $other-module;
}

.my-other-class {
  font-family: ComicSans;
}
```

Tests
-----

```sh
$ npm test
```
