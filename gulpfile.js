var babel = require('gulp-babel');
var changed = require('gulp-changed');
var concat = require('gulp-concat');
var cssmin = require('gulp-cssmin');
var downloadelectron = require('gulp-download-electron');
var fs = require('fs');
var gulp = require('gulp');
var gulpif = require('gulp-if');
var gutil = require('gulp-util');
var less = require('gulp-less');
var livereload = require('gulp-livereload');
var packagejson = require('./package.json');
var plumber = require('gulp-plumber');
var runSequence = require('run-sequence');
var shell = require('gulp-shell');
var sourcemaps = require('gulp-sourcemaps');

var dependencies = Object.keys(packagejson.dependencies);
var argv = require('minimist')(process.argv.slice(2));

var settings;
try {
  settings = require('./settings.json');
} catch (err) {
  settings = {};
}
settings.beta = argv.beta;

var options = {
  dev: process.argv.indexOf('release') === -1,
  beta: argv.beta,
  appFilename: argv.beta ? 'Kitematic (Beta).app' : 'Kitematic.app',
  appName: argv.beta ? 'Kitematic (Beta)' : 'Kitematic',
  name: 'Kitematic',
  icon: argv.beta ? './util/kitematic-beta.icns' : './util/kitematic.icns',
  bundle: 'com.kitematic.kitematic'
};

gulp.task('js', function () {
  return gulp.src('src/**/*.js')
    .pipe(gulpif(options.dev, changed('./build')))
    .pipe(plumber(function(error) {
      gutil.log(gutil.colors.red('Error (' + error.plugin + '): ' + error.message));
      this.emit('end');
    }))
    .pipe(sourcemaps.init())
    .pipe(babel({blacklist: ['regenerator']}))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.appFilename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('images', function() {
  return gulp.src('images/*')
    .pipe(gulpif(options.dev, changed('./build')))
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.appFilename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('styles', function () {
  return gulp.src('styles/main.less')
    .pipe(plumber(function(error) {
      gutil.log(gutil.colors.red('Error (' + error.plugin + '): ' + error.message));
      this.emit('end');
    }))
    .pipe(gulpif(options.dev, changed('./build')))
    .pipe(gulpif(options.dev, sourcemaps.init()))
    .pipe(less())
    .pipe(gulpif(options.dev, sourcemaps.write()))
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.appFilename + '/Contents/Resources/app/build'))
    .pipe(gulpif(!options.dev, cssmin()))
    .pipe(concat('main.css'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('download', function (cb) {
  downloadelectron({
    version: packagejson['electron-version'],
    outputDir: 'cache'
  }, cb);
});

gulp.task('copy', function () {
  gulp.src('index.html')
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.appFilename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));

  gulp.src('fonts/**')
    .pipe(gulpif(options.dev, changed('./build')))
    .pipe(gulp.dest(options.dev ? './build' : './dist/osx/' + options.appFilename + '/Contents/Resources/app/build'))
    .pipe(gulpif(options.dev, livereload()));
});

gulp.task('dist', function () {
  var stream = gulp.src('').pipe(shell([
    'rm -Rf dist',
    'mkdir -p ./dist/osx',
    'cp -R ./cache/Electron.app ./dist/osx/<%= filename %>',
    'mv ./dist/osx/<%= filename %>/Contents/MacOS/Electron ./dist/osx/<%= filename %>/Contents/MacOS/<%= name %>',
    'mkdir -p ./dist/osx/<%= filename %>/Contents/Resources/app',
    'mkdir -p ./dist/osx/<%= filename %>/Contents/Resources/app/node_modules',
    'cp package.json dist/osx/<%= filename %>/Contents/Resources/app/',
    'mkdir -p dist/osx/<%= filename %>/Contents/Resources/app/resources',
    'cp -v resources/* dist/osx/<%= filename %>/Contents/Resources/app/resources/ || :',
    'cp <%= icon %> dist/osx/<%= filename %>/Contents/Resources/atom.icns',
    'cp ./util/Info.plist dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleVersion <%= version %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName <%= name %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleName <%= name %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier <%= bundle %>" dist/osx/<%= filename %>/Contents/Info.plist',
    '/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable <%= name %>" dist/osx/<%= filename %>/Contents/Info.plist'
    ], {
      templateData: {
        filename: options.appFilename.replace(' ', '\\ ').replace('(','\\(').replace(')','\\)'),
        name: options.appName.replace(' ', '\\ ').replace('(','\\(').replace(')','\\)'),
        version: packagejson.version,
        bundle: options.bundle,
        icon: options.icon
      }
  }));

  dependencies.forEach(function (d) {
    stream = stream.pipe(shell([
      'cp -R node_modules/' + d + ' dist/osx/<%= filename %>/Contents/Resources/app/node_modules/'
    ], {
      templateData: {
        filename: options.appFilename.replace(' ', '\\ ').replace('(','\\(').replace(')','\\)')
      }
    }));
  });

  return stream;
});

gulp.task('sign', function () {
  try {
    var signing_identity = fs.readFileSync('./identity', 'utf8').trim();
    return gulp.src('').pipe(shell([
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/Electron\\ Framework.framework',
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/Electron\\ Helper\\ EH.app',
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/Electron\\ Helper\\ NP.app',
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/Electron\\ Helper.app',
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/ReactiveCocoa.framework',
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/Squirrel.framework',
      'codesign --deep --force --verbose --sign <%= identity %> <%= filename %>/Contents/Frameworks/Mantle.framework',
      'codesign --force --verbose --sign <%= identity %> <%= filename %>',
    ], {
      templateData: {
        filename: 'dist/osx/' + options.appFilename.replace(' ', '\\ ').replace('(','\\(').replace(')','\\)'),
        identity: '\"' + signing_identity + '\"'
      }
    }));
  } catch (error) {
    gutil.log(gutil.colors.red('Error: ' + error.message));
  }
});

gulp.task('zip', function () {
  return gulp.src('').pipe(shell([
    'ditto -c -k --sequesterRsrc --keepParent ' +  options.appFilename.replace(' ', '\\ ').replace('(','\\(').replace(')','\\)') + ' ' +  options.name.replace(' ', '\\ ').replace('(','\\(').replace(')','\\)') + '-' + packagejson.version + '.zip'
  ], {
    cwd: './dist/osx/'
  }));
});

gulp.task('settings', function () {
  var string_src = function (filename, string) {
    var src = require('stream').Readable({ objectMode: true });
    src._read = function () {
      this.push(new gutil.File({ cwd: "", base: "", path: filename, contents: new Buffer(string) }));
      this.push(null);
    };
    return src;
  };
  string_src('settings.json', JSON.stringify(settings)).pipe(gulp.dest('dist/osx/' + options.appFilename.replace(' ', '\ ').replace('(','\(').replace(')','\)') + '/Contents/Resources/app'));
});

gulp.task('download-deps', function () {
    if(process.platform === 'win32') {
      return gulp.src('').pipe(
          shell(['powershell.exe -ExecutionPolicy unrestricted -File util\\deps.ps1'])
      );
    } else {
      return gulp.src('').pipe(
          shell(['./util/deps'])
      );
    }
});

gulp.task('reset', function () {
  if(process.platform === 'win32') {
    return gulp.src('').pipe(
        shell(['powershell.exe -ExecutionPolicy unrestricted -Command "Start-Process powershell -verb runas -ArgumentList \\\"-ExecutionPolicy unrestricted  -file c:\\Users\\Dominik\\Documents\\GitHub\\kitematic\\util\\reset.ps1\\\" -Wait"'])
    );
  } else {
    return gulp.src('').pipe(
        shell(['./util/reset'])
    );
  }
});

gulp.task('release', function () {
  runSequence('download-deps', 'download', 'dist', ['copy', 'images', 'js', 'styles', 'settings'], 'sign', 'zip');
});

gulp.task('default', ['download-deps', 'download', 'copy', 'js', 'images', 'styles'], function () {
  gulp.watch('src/**/*.js', ['js']);
  gulp.watch('index.html', ['copy']);
  gulp.watch('styles/**/*.less', ['styles']);
  gulp.watch('images/**', ['images']);

  livereload.listen();

  var env = process.env;
  env.NODE_ENV = 'development';

  if(process.platform === 'win32') {
      gulp.src('').pipe(shell(['cache\\electron.exe .'], {
          env: env
      }));
  } else {
      gulp.src('').pipe(shell(['./cache/Electron.app/Contents/MacOS/Electron .'], {
          env: env
      }));
  }
});
