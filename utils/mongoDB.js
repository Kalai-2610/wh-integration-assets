const { MongoClient, Db } = require('mongodb');


class MongoDB {
    static #URI; static #client;
	/**
	 * Points to the current Database.
	 * @type {Db}
	 */
    static db;
	constructor() {
		MongoDB.#URI = process.env.DATABASE.replace('<DB_USER>', process.env.DB_USER)
			.replace('<DB_PASSWORD>', process.env.DB_PASSWORD)
			.replace('<DB_NAME>', process.env.DB_NAME);
		MongoDB.#client = new MongoClient(MongoDB.#URI);

		MongoDB.#client
			.connect()
			.then((con) => {
				console.log('DB Connection Established');
                MongoDB.db = MongoDB.#client.db('asset1');
			})
			.catch((err) => console.log(err));
	}
}

module.exports = MongoDB;
