const path = require('node:path');
const app = path.resolve(__dirname, '../../../app');
const config = require(path.join(app, 'package.json')).jest;
module.exports = { ...config, rootDir: app,
 modulePaths: [path.join(app, 'node_modules')], roots: [app, __dirname], testMatch: [path.join(__dirname, 'app-*-diagnostic.test.ts')],
};
