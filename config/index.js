/*
 * @Description: In User Settings Edit
 * @Author: your name
 * @Date: 2019-08-30 17:22:34
 * @LastEditTime: 2019-09-17 14:59:57
 * @LastEditors: Please set LastEditors
 */
const path = require('path');

module.exports = {
  development: {
    debug: true,
    host: 'localhost',
    prot: 9000,
    sftp: {
      host: '10.21.132.50',
      user: 'root',
      pass: '123456',
      port: 22,
      remotePath: '/gulp-demo'
    }
  },
  production: {
    debug: false,
    host: 'localhost',
    prot: 9000,
    sftp: {
      host: '10.21.132.50',
      user: 'root',
      port: 22,
      pass: '123456',
      remotePath: '/gulp-demo'
    }
  }
};
