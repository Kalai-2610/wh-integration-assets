const express = require('express');
const morgan = require('morgan');
const MongoDB = require('./utils/mongoDB');
const CacheMechanism = require('./utils/cache');
const { RequestLogger } = require('./utils/logger');
const { verifyUser, verifyBasicAuth, verifyAPIKey, verifyToken } = require('./controllers/authController');
const AuthRouter = require('./routes/authRouter');
const UserRouter = require('./routes/userRouter');
const CredentialRouter = require('./routes/credentialRouter');
const ResourceRouter = require('./routes/resourceRouter');
const DataRouter = require('./routes/dataRouter');
const dynamicDataRouter = require('./routes/dynamicDataRouter');

async function processRequest(req, res, next) {
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
	const content_type = req.header('content-type');
	if (content_type && content_type !== 'application/json') {
		res.status(400).json({ success: false, error: 'Invalid content type' });
		return;
	}
	next();
}

function updateScopes(req, res, next) {
	req.scopes = {
		read: true,
		write: true,
		delete: true
	};
	next();
}

class App {
	#app;
	constructor() {
		this.#app = express();
		this.mongo_db = new MongoDB();
		if (CacheMechanism.get("NODE_ENV") == 'development') {
			this.#app.use(morgan('dev'));
		}

		this.#app.use(processRequest);
		this.#app.use(express.json());
		this.#app.use(express.static('./public/'));
		this.#app.use('/auth/v1/', AuthRouter);
		this.#app.use('/api/v1/users', verifyUser, UserRouter);
		this.#app.use('/api/v1/resources', verifyUser, ResourceRouter);
		this.#app.use('/api/v1/credentials', verifyUser, CredentialRouter);
		this.#app.use('/api/v1/data', verifyUser, DataRouter);
		this.#app.use('/open/v1', updateScopes, dynamicDataRouter);
		this.#app.use('/basic/v1', verifyBasicAuth, dynamicDataRouter);
		this.#app.use('/api_key/v1', verifyAPIKey, dynamicDataRouter);
		this.#app.use('/token/v1', verifyToken, dynamicDataRouter);

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
			console.info(`Running on port ${port}`);
		});
	}
}

module.exports = App;
