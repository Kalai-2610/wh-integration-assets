const express = require('express');
const morgan = require('morgan');
// const userRouter = require('./routes/userRouter');
// const tourRouter = require('./routes/tourRouter');
const MongoDB = require('./utils/mongoDB');

class App {
	#app;
	constructor() {
		this.#app = express();
        this.mongo_db = new MongoDB();
		console.debug(process.env.NODE_ENV);
		if (process.env.NODE_ENV == 'development') {
			this.#app.use(morgan('dev'));
		}

		this.#app.use(express.json());
		this.#app.use(express.static('./public/'));
		// this.#app.use('/api/v1/users', userRouter);
		// this.#app.use('/api/v1/tours', tourRouter);

		// 404
		this.#app.use(async (req, res) => {
            const data = await MongoDB.db.collection('users').find().toArray();
			res.status(404).json({
				status: 'Fail',
				error: 'Invaild URL',
				endpoint: req.url,
				method: req.method,
			});
		});
	}

	start(port) {
		this.port = port || 3000;
		this.#app.listen(port, () => {
			console.log(`Running on port ${port}`);
		});
	}
}

module.exports = App;
