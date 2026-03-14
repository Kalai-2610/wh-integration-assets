const dotenv = require('dotenv');
const CacheMechanism = require('./utils/cache');

dotenv.config({ path: './config.env' });

// const allowedOrgins = new Set(['http://localhost:3000', 'http://localhost:5173', 'http://192.168.29.177:4173', 'http://192.168.29.177:4173', 'http://192.168.29.177:5173', 'http://192.168.1.37:5173']);
CacheMechanism.set("NODE_ENV", process.env.NODE_ENV.trim());
// CacheMechanism.set('CORS_ORIGINS', allowedOrgins )
const App = require('./app');

const server = new App();
server.start(process.env.PORT)