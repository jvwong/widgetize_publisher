var process = require('process');
var path = require('path');
var objectAssign = require('object-assign');
var gulp = require('gulp');
var livereload = require('gulp-livereload');
var browserify = require('browserify');
var babelify = require('babelify');
var watchify = require('watchify');
var del = require('del');
var paths = require('vinyl-paths');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var clean = function(){ return paths( del ); };
var notifier = require('node-notifier');
// Loads *gulp* plugins from package dependencies and attaches them to $
var $ = require('gulp-load-plugins')();
var runSequence = require('run-sequence');
var pkg = require('./package.json');
var deps = Object.keys( pkg.dependencies || {} );
var fs   = require('fs');
var Q = require('q');

var browserSync = require('browser-sync').create();
var modRewrite  = require('connect-modrewrite');
var cp          = require('child_process');

var app_root = '.'
var src_root = path.join(app_root, 'src');
var static_root = path.join(app_root, 'public');
var media_root = path.join(app_root, 'media');

var logError = function( err ){
  notifier.notify({ title: pkg.name, message: 'Error: ' + err.message });
  $.util.log( $.util.colors.red(err) );
};

var handleErr = function( err ){
  logError( err );

  if( this.emit ){
    this.emit('end');
  }
};

var getBrowserified = function( opts ){
  opts = objectAssign({
    debug: true,
    cache: {}, //watchify requirement
    packageCache: {}, //watchify requirement
    fullPaths: true,
    bundleExternal: true,
    entries: [
      path.join(src_root, 'js/main.js'),
    ]
  }, opts );

  return browserify( opts ).on( 'log', $.util.log );
};

var transform = function( b ){
  return ( b
    .transform( babelify.configure({
      presets: ['es2015', 'react'],
      ignore: 'node_modules/**/*',
      sourceMaps: 'inline'
    }) )
    .external( deps )
  ) ;
};

var bundle = function( b ){
  return ( b
    .bundle()
    .on( 'error', handleErr )
    .pipe( source('babel-compiled.js') )
    .pipe( buffer() )
    // .pipe( $.uglify() )
  ) ;
};

/*
 * Bundle the src/js dependencies to babel-compiled.js
 */
gulp.task('js', ['lint'], function(){
  return bundle( transform( getBrowserified() ) )
    .pipe( gulp.dest(path.join(app_root, static_root, 'js')) ) //direct
    .pipe( browserSync.reload({stream:true}) );
});

/*
 * Bundle the package.json dependencies to deps.js
 */
gulp.task('js-deps', function(){
  var b = browserify({
    debug: false
  });

  //deps is package.json dependencies
  deps.forEach(function( dep ){
    b.require( dep );
  });

  return ( b
    .bundle()
    .on( 'error', handleErr )
    .pipe( source('deps.js') )
    .pipe( buffer() )
    .pipe( gulp.dest(path.join(static_root, 'js')) )
    .pipe( browserSync.reload({stream:true}) )
  );
});

var sass = function( s ){
  return ( s
    .pipe( $.plumber() )
    .pipe( $.sourcemaps.init() )
    .pipe( $.sass().on('error', $.sass.logError) )
    .pipe( $.sass({
      includePaths: [path.join(src_root, 'sass')], //import
      sourceMap: true,
      sourceMapRoot: '../',
      outputStyle: 'compressed',
      onError: browserSync.notify
    }) )
    .pipe( $.sourcemaps.write() )
    .pipe( $.rename('main.css') )
    .pipe( gulp.dest(path.join(app_root, static_root, 'css')) ) //direct
    .pipe( browserSync.reload({stream:true}) )
  );
};

gulp.task('css', function(){
  return sass( gulp.src( path.join(src_root, 'sass', 'main.scss')) );
});


gulp.task('browser-sync', ['css',
                           'js-deps',
                           'js'], function() {
    browserSync.init({
      // Serve files from the app_root directory
      server: {
        baseDir: app_root,
        index: 'index.html'
      },
      host: "publisher.dev",
      port: '8787',
      open: 'external',
      middleware: [
        modRewrite([
                    '^/(.*) /$1 [L]' // baseurl un-mapping
                ])
      ]
    });
});

gulp.task('lint', function () {
    return gulp.src(path.join(src_root, 'js/**/*.js'))
    .pipe($.jshint())
    .pipe($.jshint.reporter( 'jshint-stylish' ));
});

/**
 * Watch scss files for changes & recompile
 * Watch html/md files, run jekyll & reload BrowserSync
 */
gulp.task('watch', function () {
  gulp.watch( ['./package.json'], ['js-deps'] );
  gulp.watch( [path.join(src_root, 'js/**/*.js')], ['js'] );
  gulp.watch( [path.join(src_root, 'sass/**/*.scss')], ['css'] );
  gulp.watch([path.join(app_root, '*.html')]).on('change', browserSync.reload);
});

gulp.task('default', ['browser-sync', 'watch'], function( next ){
  next();
});

gulp.task('clean', function(){
  return gulp.src([static_root])
    .pipe( clean() )
  ;
});
