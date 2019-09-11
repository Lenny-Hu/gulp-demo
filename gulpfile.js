/*
 * @Description: In User Settings Edit
 * @Author: your name
 * @Date: 2019-08-30 17:17:41
 * @LastEditTime: 2019-09-11 17:20:41
 * @LastEditors: Please set LastEditors
 */
const fs = require('fs');
const path = require('path');

const gulp = require('gulp');
const browserSync = require('browser-sync').create();
const reload = browserSync.reload;

const spritesmith = require('gulp.spritesmith'); // 生成雪碧图
const image = require('gulp-image'); // 图片压缩

const buffer = require('vinyl-buffer');
const merge = require('merge-stream');

const del = require('del'); // 文件删除
const cache = require('gulp-cached'); // 只传递更改过的文件，减少编译时间

const sass = require('gulp-sass');
sass.compiler = require('node-sass');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano'); // 优化css

// const babel = require('gulp-babel');
const webpack = require('webpack-stream');
const uglify = require('gulp-uglify');

const gulpif = require('gulp-if');
const named = require('vinyl-named');

const useref = require('gulp-useref');
const rev = require('gulp-rev'); // 添加hash后缀
const revCollector = require('gulp-rev-collector'); // 根据rev生成的manifest.json文件中的映射, 去替换文件名称, 也可以替换路径
const override = require('gulp-rev-css-url'); // 替换html\css文件中的url路径为资源被hash后的新路径
const revdel = require('gulp-rev-delete-original'); // 删除rev使用的原始资源
// const revAll = require('gulp-rev-all');
const replace = require('gulp-replace');

// 下列3个对pug文件无效
// const versionNumber = require('gulp-version-number');
// const versionAppend = require('gulp-version-append');
// const gulpHtmlVersion = require('gulp-html-version');

const sftp = require('gulp-sftp');

const minimist = require('minimist'); // 命令行参数解析
const argv = minimist(process.argv.slice(2));

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const config = require('./config')[NODE_ENV];

console.log(`==当前环境为 [${NODE_ENV}][IS_PROD: ${IS_PROD}]==`);
console.log('[使用的配置]', config);

// 清理
gulp.task('clean', async (cb) => {
  let globs = IS_PROD ? ['dist/**/*'] : ['app/css/**/*', 'app/js/**/*'];
  console.log(globs);
  let deletedPaths = await del(globs);
  console.log('----删除的文件----');
  console.log(deletedPaths.join('\n'));
  console.log('----删除的文件----');
  return cb;
});

// 图片优化(仅生产环境)
gulp.task('image', () => {
  return gulp.src(['./app/images/**/*', '!./app/images/sprites/*'], {
    base: './app'
  })
    .pipe(image())
    .pipe(gulp.dest(config.static));
});

// 雪碧图
gulp.task('sprite', () => {
  let spriteData = gulp.src('./app/images/sprites/*.png').pipe(spritesmith({
    imgName: 'images/sprite.png',
    cssName: 'css/sprite.css',
    padding: 2
  }))

  let imgStream = spriteData.img
    .pipe(buffer())
    .pipe(image())
    .pipe(gulp.dest(config.static));

  let cssStream = spriteData.css
    .pipe(postcss([cssnano()]))
    .pipe(gulp.dest(config.static))
    .pipe(gulpif(IS_PROD, gulp.dest('./app/')));
  
  return merge(imgStream, cssStream);
});

// sass编译
gulp.task('sass', () => {
  let plugins = [
    autoprefixer({ overrideBrowserslist: ['cover 99.5%'] })
  ];
  IS_PROD && plugins.push(cssnano());

  return gulp.src(['./app/styles/**/*.scss'], {
    base: './app/styles'
  })
    .pipe(cache('sass'))
    .pipe(sass({ outputStyle: 'expanded' }).on('error', sass.logError)) // 输出标准格式，方便后处理
    .pipe(postcss(plugins))
    .pipe(gulp.dest('./app/css/'))
    .pipe(gulpif(IS_PROD, gulp.dest(path.join(config.static, '/css/'))));
});

// es6编译 => ie9+
gulp.task('webpack', () => {
  return gulp.src('./app/scripts/**/*.js', {
    base: './app/scripts'
  })
    .pipe(named((file) => {
      // 让scripts目录下的每个js文件单独输出到对应的js目录下
      let [ filePath ] = file.history;
      let dir = path.join(file._cwd, file._base);
      let extname = path.extname(filePath);
      filePath = filePath.replace(dir, '').slice(1, -(extname.length));
      return filePath;
    }))
    .pipe(webpack({
      mode: NODE_ENV,
      devtool: IS_PROD ? false : 'cheap-module-source-map',
      watch: !IS_PROD,
      // output: {
      //   // filename: '[name].[contenthash].js'
      // },
      module: {
        rules: [
          {
            test: /\.m?js$/,
            exclude: /(node_modules|bower_components)/,
            use: {
              loader: 'babel-loader' // babel有单独的配置文件 babel.config.js
            }
          }
        ]
      }
    }))
    .pipe(gulp.dest('./app/js/'))
    // 由于存在页面中直接引用css js资源，所以编译css\js时。必定要输出资源到app目录下，避免useref时出现问题
    .pipe(gulpif(IS_PROD, gulp.dest(path.join(config.static, '/js/'))));
});

// 资源拷贝(生产环境)
gulp.task('copy', () => {
  return gulp.src([
    './app/lib/**/*',
    './app/fonts/**/*',
    '!./app/lib/README.md'
  ], {
    base: './app'
  })
    .pipe(gulpif('*.js', uglify()))
    .pipe(gulpif('*.css', postcss([cssnano()])))
    .pipe(gulp.dest(path.join(config.static)));
});

// 处理视图（生产环境）
gulp.task('view-build', () => {
  // 将视图拷贝到dist目录
  return gulp.src([
    './server/views/**/*.pug'
  ], {
    base: './server/views/'
  })
    .pipe(useref({
      searchPath: './app'
    }))
    .pipe(gulpif('*.js', uglify()))
    .pipe(gulpif('*.css', postcss([cssnano()])))
    .pipe(gulp.dest(config.view));
});

// 拷贝视图产生的静态资源到app目录（生产环境）
gulp.task('view-static', () => {
  let globs = [
    path.normalize(`${config.view}/css/**/*`),
    path.normalize(`${config.view}/js/**/*`)
  ];
  return gulp.src(globs, {
    base: config.view
  })
    .pipe(gulp.dest(config.static));
});

gulp.task('view-clean', async (cb) => {
  let globs = [
    './dist/server/views/css',
    './dist/server/views/js'
  ];

  let deletedPaths = await del(globs);
  console.log('----删除的文件----');
  console.log(deletedPaths.join('\n'));
  console.log('----删除的文件----');
  return cb;
});

gulp.task('view', gulp.series('view-build', 'view-static', 'view-clean'));

// 静态资源缓存控制1；修改文件名称
// gulp.task('cache-build', () => {
//   return gulp.src([
//     `./dist/app/**/*.css`,
//     `./dist/app/**/*.js`,
//     `./dist/app/**/*.png`,
//     `./dist/app/**/*.jpg`,
//     `./dist/app/**/*.jpeg`,
//     `./dist/app/**/*.gif`,
//     `./dist/app/fonts/**/*`
//   ], {
//     base: './dist/app'
//   })
//     .pipe(rev())
//     .pipe(override()) // 替换html\css文件中的url路径为资源被hash后的新路径
//     .pipe(revdel()) // 删除生成缓存的原始资源
//     .pipe(gulp.dest('./dist/app'))
//     .pipe(rev.manifest()) // 生成文件映射
//     .pipe(gulp.dest('./dist/rev')); // 将映射文件导出
// });

// // 路径替换
// gulp.task('cache-replace', () => {
//   return gulp.src([`./dist/rev/**/*.json`, './dist/server/views/**/*.pug'], {
//   }).pipe(revCollector({
//     replaceReved: true
//   })).pipe(gulp.dest('./dist/server/views'));
// });
// gulp.task('cache', gulp.series('cache-build', 'cache-replace'));

// gulp-rev-all 插件打处理后的路径不对。
// gulp.task('cache', () => {
//   return gulp.src([
//     './dist/**/*'
//   ]).pipe(revAll.revision({
//     dontRenameFile: [
//       /.pug$/g
//     ]
//   }))
//     .pipe(gulp.dest('./dist'));
// });

// 缓存处理方式2：添加时间戳查询参数，基于gulp-replace，暂不能替换css中字体图标的引用
gulp.task('cache-html', () => {
  return gulp.src([
    './dist/server/views/**/*.pug'
  ], {
    base: './dist/server/views'
  })
    .pipe(replace(new RegExp('(href|src=["\'])(\\S+\\.)(css|js|jpg|png|gif)(["\'])', 'gi'), `$1$2$3?v=${Date.now()}$4`))
    .pipe(gulp.dest('./dist/server/views'));
});

gulp.task('cache-css', () => {
  return gulp.src([
    './dist/app/**/*.css'
  ], {
    base: './dist/app'
  })
    .pipe(replace(new RegExp('(url\\(["\']?\\S+\\.)(jpg|gif|png)(["\']?\\))', 'ig'), `$1$2?v=${Date.now()}$3`))
    .pipe(gulp.dest('./dist/app'));
});
gulp.task('cache', gulp.parallel('cache-html', 'cache-css'));

// sftp
gulp.task('sftp', () => {
  console.log({ ...config.sftp });
  return gulp.src('./dist/**/*')
    .pipe(sftp({ ...config.sftp }));
});

// 文件监听
if (!IS_PROD) {
  gulp.watch('./app/styles/**/*.scss', gulp.series('sass'));
  gulp.watch('./app/images/sprites/**/*.png', gulp.series('sprite'));
}

const tasks = IS_PROD ? ['clean', 'image', 'sprite', gulp.parallel('sass', 'webpack', 'copy'), 'view', 'cache', 'sftp'] : ['clean', 'sprite', gulp.parallel('sass', 'webpack')];
gulp.task('default', gulp.series(...tasks));
