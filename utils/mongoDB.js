const { MongoClient, Db, Collection } = require('mongodb');
const CacheMechanism = require('./cache');
const { hashPasswordArgon2i } = require('./crypt');

class MongoDB {
    static #URI; static #DB_NAME; static #NODE_ENV;
	/**
	 * Points to the current Database.
	 * @type {MongoClient}
	 */
	static #client;
	/**
	 * Points to the current Database.
	 * @type {Db}
	 */
    static db;
	/**
	 * Points to the users collection.
	 * @type {Collection}
	 */
	static users; 
	/**
	 * Points to the sessions collection.
	 * @type {Collection}
	 */
	static sessions; 
	/**
	 * Points to the credentials collection.
	 * @type {Collection}
	 */
	static credentials; 
	/**
	 * Points to the logs collection.
	 * @type {Collection}
	 */
	static logs;

	static #init(){
		const system_collections = ['users', 'sessions', 'credentials', 'logs'];
		const logs_options = {
			timeseries: {
				timeField: "timestamp",   // required
				granularity: "seconds"    // seconds | minutes | hours
			}
		}
		MongoDB.#client
			.connect()
			.then(async() => {
				MongoDB.db = MongoDB.#client.db(MongoDB.#DB_NAME);
				console.log('DB Connection Established');
				const collections = (await MongoDB.db.listCollections().toArray()).map(item => item.name);
				console.log("Collections: ", JSON.stringify(collections));
				const collections_toCreate = system_collections.filter(item => !collections.includes(item));
				console.log("Collections to Create: ", JSON.stringify(collections_toCreate));
				await Promise.all(collections_toCreate.map(async item => {
					if(item === 'logs') {
						await MongoDB.db.createCollection(item, logs_options)
					} else {
						await MongoDB.db.createCollection(item);
					}
					console.log("System Collection created: ", item);
					if(item === 'users'){
						const {salt, hash} = await hashPasswordArgon2i(process.env.ADMIN_PASSWORD.trim());
						await MongoDB.db.collection(item).insertOne({
							name: "System",
							email: "Administrator",
							salt,
							hash,
							is_active: true,
							// is_admin: true,
							_created_at: new Date().toISOString(),
						});
						console.log("System User created");
					};
				}));
			}).then(async() => {
				try{ 
					await MongoDB.db.command({ping: 1})
					MongoDB.logs = MongoDB.db.collection('logs');	
					MongoDB.users = MongoDB.db.collection('users');
					MongoDB.sessions = MongoDB.db.collection('sessions');
					MongoDB.credentials = MongoDB.db.collection('credentials');	
					const systemUser = MongoDB.users.findOne({ email: "Administrator" });
					CacheMechanism.set('systemUser', systemUser);		
					console.log("System Collections are initialized");
				} catch (err) {
					console.error('Database connection failed:', err);
				}
			})
			.catch((err) => console.error(err));
	}
	constructor() {
		MongoDB.#NODE_ENV = CacheMechanism.get("NODE_ENV");
		MongoDB.#URI = process.env.DATABASE.trim()	.replace('<DB_USER>', process.env.DB_USER.trim()).replace('<DB_PASSWORD>', process.env.DB_PASSWORD.trim());
		if (MongoDB.#NODE_ENV === 'production') {
			MongoDB.#DB_NAME = process.env.PROD_DB_NAME.trim();
		} else {
			MongoDB.#DB_NAME = process.env.DB_NAME.trim();
		}
		console.log("ENV = ", MongoDB.#NODE_ENV);
		console.log("DB_NAME = ", MongoDB.#DB_NAME);
		MongoDB.#URI = MongoDB.#URI.replace('<DB_NAME>', MongoDB.#DB_NAME);
		MongoDB.#client = new MongoClient(MongoDB.#URI);
		MongoDB.#init();
	}
}

module.exports = MongoDB;
