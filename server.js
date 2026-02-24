const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });

const App = require('./app');

const server = new App();
server.start(process.env.port)