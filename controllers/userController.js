const AppError = require("../utils/appError");
const { hashPasswordArgon2i } = require("../utils/crypt");
const { CommonLogger } = require("../utils/logger");
const MongoDB = require("../utils/mongoDB");
const { ObjectId } = require('mongodb');

const userValidator = {
	$jsonSchema: {
		bsonType: 'object',
		required: ['name', 'email', 'salt', 'hash', '_created_on', '_created_by', 'is_active'],
		properties: {
			_id: {
				bsonType: 'objectId',
				description: 'Must be an ObjectId'
			},
			name: {
				bsonType: 'string',
				minLength: 2,
				maxLength: 100,
				description: 'User full name is required'
			},
			email: {
				bsonType: 'string',
				pattern: '^\\S+@\\S+\\.\\S+$',
				description: 'Must be a valid email address'
			},
			salt: {
				bsonType: 'string',
				description: 'Password salt is required'
			},
			hash: {
				bsonType: 'string',
				description: 'Password hash is required'
			},
			_created_on: {
				bsonType: 'date',
				description: 'Creation date is required'
			},
			_created_by: {
				bsonType: 'objectId',
				description: "Must reference the creator's ObjectId"
			},
			is_active: {
				bsonType: 'bool',
				description: 'Indicates if the user is active'
			}
		}
	}
};
const userOptions = {
    validator: userValidator,
    validationLevel: 'strict',
    validationAction: 'error'
};

let userCollection;
setInterval(() => {
    userCollection = MongoDB.db.collection('users', userOptions);
}, 2 * 1000); // Keep the process alive

module.exports.getAllUsers = async (req, res) => {
    try {
        const size = parseInt(req.query.size) || 10;
        const page = parseInt(req.query.page) || 1;
        const sortDetails = {};
        sortDetails.sortBy = req.query.sortBy || '_created_on';
        sortDetails.sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;
        const skip = (page - 1) * size;
        
        const total = await userCollection.countDocuments();
        const users = await userCollection.find().sort({ [sortDetails.sortBy]: sortDetails.sortOrder }).skip(skip).limit(size).project({ salt: 0, hash: 0 }).toArray();
        res.body = {
            success: true,
            pagination: {
                total,
                page,
                size,
                sortBy: sortDetails.sortBy,
                sortOrder: sortDetails.sortOrder === 1 ? 'asc' : 'desc'
            },
            data: users
        };
        res.status(200).json(res.body);
    } catch (err) {
        CommonLogger.error('Failed to fetch users', { error: err });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

module.exports.getUser = async (req, res) => {
    try {
        const user = await userCollection.findOne({ _id: new ObjectId(req.params.id) });
        delete user?.salt;
        delete user?.hash;
        if (!user) {
            throw new AppError('User not found', 404);
        }
        res.status(200).json({success: true, data: user});
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to fetch user', { error: err });
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

module.exports.createUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        delete req.body.password;
        if (!name || !email || !password) {
            throw new AppError('Name, email, and password are required', 400);
        }
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
            throw new AppError('Email already in use', 409);
        } 
        const { salt, hash } = await hashPasswordArgon2i(password);
        const newUser = {
            name,
            email,
            salt,
            hash,
            is_active: true,
            _created_on: new Date().toISOString(),
            _created_by: new ObjectId(req.user)
        };
        const result = await userCollection.insertOne(newUser);
        res.status(201).json({ success: true, data: { _id: result.insertedId } });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to create user', { error: err });
        res.status(500).json({ error: 'Failed to create user' });
    }
}; 

module.exports.updateUser = async (req, res) => {
    // Implementation for updating user details
    try {
        const userId = req.params.id;
        const {name, is_active} = req.body;
        const updateData = {name, is_active};
        name || delete updateData.name;
        (is_active === true || is_active === false) || delete updateData.is_active;
        if (Object.keys(updateData).length === 0) {
            throw new AppError('No valid fields to update', 400);
        }
        const result = await userCollection.updateOne({ _id: new ObjectId(userId) }, { $set: updateData });
        if (result.modifiedCount === 0) {
            throw new AppError('User not found or no changes made', 404);
        }
        res.status(200).json({ success: true, data: { _id: userId } });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to update user', { error: err });
        res.status(500).json({ error: 'Failed to update user' });
    }
};

module.exports.deleteUser = async (req, res) => {
    // Implementation for deleting a user
    try {
        const userId = req.params.id;
        const user = await userCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            throw new AppError('User not found', 404);
        }
        if (user._created_by.toString() === "System" ) {
            throw new AppError('Cannot delete user', 403);
        }
        const result = await userCollection.deleteOne({ _id: new ObjectId(userId) });
        if (result.deletedCount === 0) {
            throw new AppError('User not found', 404);
        }
        res.status(204).json({ success: true, data: { _id: userId } });
    } catch (err) {
        if (err instanceof AppError) {
            return res.status(err.statusCode).json({ success: false, error: err.message, ...err.params });
        }
        CommonLogger.error('Failed to delete user', { error: err });
        res.status(500).json({ error: 'Failed to delete user' });
    }
};