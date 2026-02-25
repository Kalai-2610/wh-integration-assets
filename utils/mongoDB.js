const { MongoClient, Db } = require('mongodb');
const { CommonLogger } = require('./logger');


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
			CommonLogger.info('DB Connection Established');
                MongoDB.db = MongoDB.#client.db('asset1');
				
			}).then(async() => {
				try{ 
					await MongoDB.db.command({ping: 1})
				} catch (err) {
					console.error('Database connection failed:', err);
				}
			})
			.catch((err) => console.error(err));
	}
}

module.exports = MongoDB;
