'use strict';

var through = require('through2'),
  gutil = require('gulp-util'),
  lint = require('sass-lint'),
  path = require('path'),
  PluginError = gutil.PluginError,
  PLUGIN_NAME = 'sass-lint';

var sassLint = function(options) {
  var userOptions = options || {};
  var configFile = userOptions.configFile;

  var compile = through.obj(function(file, encoding, cb) {
    if (file.isNull()) {
      return cb();
    }
    if (file.isStream()) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
      return cb();
    }

    // load our config from sassLint and the user provided options if available
    file.sassConfig = lint.getConfig(userOptions, configFile);
    // save the config file within the file object for access when this file is piped around
    file.userOptions = userOptions;
    file.configFile = configFile;

    // lint the file and pass the user defined options and config path to sass lint to handle
    try {
      var fileBufferContent = file.contents;
      var fileType = path.extname(file.path).replace('.', '');
      var fileContent;
      var matchedVueSassCode;
      var vueSassCode = '';

      // 支持 vue 文件
      if (fileType === 'vue') {
        fileType = 'scss';
        fileContent = fileBufferContent.toString('utf-8');
        matchedVueSassCode = fileContent.match(/<style([\s\S]*)lang="scss">([\s\S]*)<\/style>/gi);
        var baseLineNumber = fileContent.split(/<style([\s\S]*)lang="scss">/)[0].split(/\r\n|\r|\n/).length;
        if (matchedVueSassCode && matchedVueSassCode.length) {
          vueSassCode = matchedVueSassCode[0];
          vueSassCode = vueSassCode
            .replace(/<template>[\s\S]*<style[\s\S]*<\/style>/, '')
            .replace(/<\/style>/gi, '')
            .replace(/<style( scoped)?(="")? lang="scss">/gi, '')
            .replace(/^[\r\n]+/, '');
          // 支持顶格缩进和非顶格缩进
          if (/^\s{2}/.test(vueSassCode)) {
            vueSassCode = vueSassCode.replace(/^  /gim, '');
          }
          var baseLines = [];
          while (--baseLineNumber > 0) {
            baseLines.push('\n');
          }
          vueSassCode = baseLines.join('') + vueSassCode;
        }
        fileBufferContent = new Buffer(vueSassCode, 'utf-8');
      }

      file.sassLint = [
        lint.lintFileText(
          {
            text: fileBufferContent,
            format: fileType,
            filename: path.relative(process.cwd(), file.path),
          },
          userOptions,
          configFile
        ),
      ];
    } catch (e) {
      this.emit('error', new PluginError(PLUGIN_NAME, e.message));
    }

    this.push(file);
    cb();
  });
  return compile;
};

sassLint.format = function(writable) {
  var compile = through.obj(function(file, encoding, cb) {
    if (file.isNull()) {
      return cb();
    }
    if (file.isStream()) {
      this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
      return cb();
    }

    if (writable) {
      var result = lint.format(file.sassLint, file.userOptions, file.configFile);
      writable.write(result);
    } else {
      lint.outputResults(file.sassLint, file.userOptions, file.configFile);
    }

    this.push(file);
    cb();
  });
  return compile;
};

sassLint.failOnError = function() {
  var filesWithErrors = [];
  var compile = through(
    { objectMode: true },
    function(file, encoding, cb) {
      if (file.isNull()) {
        return cb();
      }

      if (file.isStream()) {
        this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
        return cb();
      }

      if (file.sassLint[0].errorCount > 0) {
        filesWithErrors.push(file);
      }

      this.push(file);
      cb();
    },
    function(cb) {
      var errorMessage;

      if (filesWithErrors.length > 0) {
        errorMessage = filesWithErrors
          .map(function(file) {
            return file.sassLint[0].errorCount + ' errors detected in ' + file.relative;
          })
          .join('\n');

        this.emit('error', new PluginError(PLUGIN_NAME, errorMessage));
      }

      cb();
    }
  );

  return compile;
};

module.exports = sassLint;
