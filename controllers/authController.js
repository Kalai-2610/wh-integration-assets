const { ObjectId } = require('mongodb');
const { verifyPasswordArgon2i, generateJWT, verifyJWT, getJWTPayload } = require('../utils/crypt');
const { CommonLogger } = require('../utils/logger');
const MongoDB = require('../utils/mongoDB');
const AppError = require('../utils/appError');
const { request } = require('express');
const e = require('express');

let userCollection;
let sessionCollection;
setInterval(() => {
	userCollection = MongoDB.db.collection('users');
	sessionCollection = MongoDB.db.collection('sessions');
}, 2 * 1000); // Keep the process alive

module.exports.sign_in = async (req, res) => {
	try {
		const { email, password } = req.body;
		delete req.body.password;
		if (!email || !password) {
			throw new AppError('Email and password are required', 400);
		}
		const user = await userCollection.findOne({ email });
		if (!user) {
			throw new AppError('Invalid email or password', 400);
		}
		const isPasswordValid = await verifyPasswordArgon2i(password, user.salt, user.hash);
		if (!isPasswordValid) {
			throw new AppError('Invalid password', 401);
		}
		const access_token = generateJWT({ userId: user._id.toString() }, '10m');
		let createdAt = new Date().toISOString();
		let expireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
		const session = await sessionCollection.insertOne({ userId: user._id, access_token, createdAt, expireAt });
		res.status(200).json({ success: true, sessionId: session.insertedId, access_token, expireAt });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		res.status(500).json({ error: 'Failed to fetch user' });
	}
};

module.exports.verifyUser = async (req, res, next) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 401);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : 'False ' + token;
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 401);
		}
		if (new Date(session.expireAt) <= new Date(request.requestTime)) {
			throw new AppError('Session expired', 401);
		}
		if (status.is_token_expired) {
			throw new AppError('Access token expired', 401, { is_token_expired: true });
		}
		req.user = getJWTPayload(token)?.userId;
		console.log('Verified user:', req.user);
		console.log('Session details:', session);
		const user = await MongoDB.db.collection('users').findOne({ _id: new ObjectId(req.user), is_active: true });
		if (!user) {
			throw new AppError('Invalid user token', 401);
		}
		next();
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to verify user', { error: err });
		res.status(500).json({ error: 'Failed to verify user' });
	}
};

module.exports.refresh_token = async (req, res) => {
	try {
		let token = req.header('authorization');
		let sessionId = req.header('sessionId');
		if (!token) {
			throw new AppError('Access token is required', 401);
		}
		token = token?.startsWith('Bearer ') ? token.slice(7) : 'False' + token;
		const status = verifyJWT(token);
		if (status.is_invalid) {
			throw new AppError('Invalid access token', 401);
		}
		const session = await sessionCollection.findOne({ _id: new ObjectId(sessionId) });
		if (!session || session.access_token !== token) {
			throw new AppError('Invalid session', 401);
		}
		if (new Date(session.expireAt) <= new Date(request.requestTime)) {
			throw new AppError('Session expired', 401);
		}
		if (status.is_token_expired) {
			req.user = getJWTPayload(token)?.userId;
			const user = await MongoDB.db.collection('users').findOne({ _id: new ObjectId(req.user), is_active: true });
			if (!user) {
				throw new AppError('Invalid user token', 401);
			}
			const access_token = generateJWT({ userId: user._id.toString() }, '10m');
			sessionCollection.updateOne({ _id: new ObjectId(sessionId) }, { $set: { access_token } });
			return res.status(200).json({ success: true, access_token });
		}
		throw new AppError('Access token not expired yet', 400);
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to verify user', { error: err });
		res.status(500).json({ error: 'Failed to verify user' });
	}
};

module.exports.clear_sessions = async (req, res) => {
	try {
		const sessions = await sessionCollection.find({ expireAt: { $lte: req.receivedTime }}).toArray();
		if(sessions.length === 0){
			res.status(200).json({ success: true, message: 'Expired sessions are already cleared' });
			return;
		}
		const result = sessionCollection.deleteMany({ expireAt: { $lte: req.receivedTime }});
		if (result.deletedCount === 0) {
            throw new AppError('Error in deleting', 404);
		}
		res.status(200).json({ success: true, message: 'Expired sessions cleared' });
	} catch (err) {
		if (err instanceof AppError) {
			return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
		}
		CommonLogger.error('Failed to clear sessions', { error: err });
		res.status(500).json({ error: 'Failed to clear sessions' });
	}
};
