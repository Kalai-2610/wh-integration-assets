const express = require('express');
const morgan = require('morgan');
const MongoDB = require('./utils/mongoDB');
const userRouter = require('./routes/UserRouter');
const authRouter = require('./routes/authRouter');
const { CommonLogger, RequestLogger } = require('./utils/logger');
const { verifyUser } = require('./controllers/authController');

function processRequest  (req, res, next) {
	req.requestTime = new Date().toISOString();
	const originalJson = res.json.bind(res); 

	res.json = function (body) {
		res.body = body;
		res.sentTime = new Date().toISOString();
		return originalJson(body);
	};

	res.on('finish', () => {
		if (res.statusCode >= 400) {
			RequestLogger.error('Request completed with error status', { req, res });
		} else {
			RequestLogger.info('Request completed successfully', { req, res });
		}
	});
	next();
};

class App {
	#app;
	constructor() {
		this.#app = express();
		this.mongo_db = new MongoDB();
		console.debug(process.env.NODE_ENV);
		if (process.env.NODE_ENV == 'development') {
			this.#app.use(morgan('dev'));
		}

		this.#app.use(processRequest);
		this.#app.use(express.json());
		this.#app.use(express.static('./public/'));
		this.#app.use('/auth/v1/', authRouter);
		this.#app.use('/api/v1/users', verifyUser, userRouter);
		this.#app.use('/open/v1/users', userRouter);

		// Invalid URL handler
		this.#app.use(async (req, res) => {
			res.body = {
				status: 'Fail',
				error: 'Invaild URL',
				endpoint: req.url,
				method: req.method
			};
			res.status(404).json(res.body);
			res.sentTime = new Date().toISOString();
		});
	}

	start(port) {
		this.port = port || 3000;
		this.#app.listen(port, () => {
			CommonLogger.info(`Running on port ${port}`);
		});
	}
}

module.exports = App;
