const Joi = require("joi");

/* =================================
   GLOBAL LIMITS
================================= */

const LIMITS = {
    STRING_MIN: 0,
    STRING_MAX: 3000,

    NUMBER_MIN: -999999999,
    NUMBER_MAX: 999999999,
    DECIMAL_MIN_PLACES: 1,
    DECIMAL_MAX_PLACES: 5,

    ARRAY_MIN_ITEMS: 0,
    ARRAY_MAX_ITEMS: 2000,

    // For messages
    DATE_MIN_STR: "1900-01-01",
    DATE_MAX_STR: "2100-12-31",

    // For validation
    DATE_MIN: new Date("1900-01-01T00:00:00.000Z"),
    DATE_MAX: new Date("2100-12-31T23:59:59.999Z")
};

/* =================================
   ERROR HANDLER
================================= */

function addError(errors, key, message) {
    let fieldError = errors.find(e => e.key === key);
    if (!fieldError) {
        fieldError = { key, errors: [] };
        errors.push(fieldError);
    }
    fieldError.errors.push(message);
}

/* =================================
   STRING BUILDER
================================= */

function buildStringSchema(field, errors) {
    let schema = Joi.string();

    if (field.options) {
        if (!Array.isArray(field.options) ||
            field.options.some(v => typeof v !== "string")) {
            addError(errors, field.key, `options must be array of strings`);
        }
        const forbidden = ["min", "max", "regex", "email", "lowercase", "uppercase"];
        forbidden.forEach(prop => {
            if (field[prop] !== undefined)
                addError(errors, field.key, `${prop} not allowed when options is defined`);
        });
        return Joi.string().valid(...field.options);
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        addError(errors, field.key, `min cannot exceed max`);
    }
    if (field?.min !== undefined && field.min < LIMITS.STRING_MIN)
        addError(errors, field.key, `min < ${LIMITS.STRING_MIN}`);
    if (field?.max !== undefined && field.max > LIMITS.STRING_MAX)
        addError(errors, field.key, `max > ${LIMITS.STRING_MAX}`);

    const field_min = Math.max(field?.min, LIMITS.STRING_MIN);
    const field_max = Math.min(field?.max, LIMITS.STRING_MAX);
    schema = schema.min(field_min).max(field_max);
    if (field.regex) {
        schema = schema.pattern(new RegExp(field.regex));
    }
    if (field.email) {
        schema = schema.email();
    }
    if (field.lowercase && field.uppercase) {
        addError(errors, field.key, `cannot be both lowercase and uppercase`);
    }
    if (field.lowercase) schema = schema.lowercase();
    if (field.uppercase) schema = schema.uppercase();

    return schema;
}

/* =================================
   NUMBER BUILDER
================================= */

function buildNumberSchema(field, errors) {
    if (field.options) {
        if (!Array.isArray(field.options) || field.options.some(v => typeof v !== "number")) {
            addError(errors, field.key, `options must be array of numbers`);
        }
        const forbidden = ["min", "max", "integer", "decimal", "decimal_min_places", "decimal_max_places"];
        forbidden.forEach(prop => {
            if (field[prop] !== undefined)
                addError(errors, field.key, `${prop} not allowed when options is defined`);
        });
        return Joi.number().valid(...field.options);
    }

    let schema = Joi.number().min(LIMITS.NUMBER_MIN).max(LIMITS.NUMBER_MAX);

    if (field.integer && field.decimal) {
        addError(errors, field.key, "cannot be both integer and decimal");
    }
    if (field.integer) {
        schema = schema.integer();
    }
    if (field.decimal) {

        const minPlaces = field.decimal_min_places ?? LIMITS.DECIMAL_MIN_PLACES;
        const maxPlaces = field.decimal_max_places ?? LIMITS.DECIMAL_MAX_PLACES;

        if (minPlaces < LIMITS.DECIMAL_MIN_PLACES)
            addError(errors, field.key, `decimal_min_places < ${LIMITS.DECIMAL_MIN_PLACES}`);
        if (maxPlaces > LIMITS.DECIMAL_MAX_PLACES)
            addError(errors, field.key, `decimal_max_places > ${LIMITS.DECIMAL_MAX_PLACES}`);
        if (minPlaces > maxPlaces)
            addError(errors, field.key, `decimal_min_places cannot exceed decimal_max_places`);

        const regex = new RegExp(String.raw`^-?\d+(\.\d{${minPlaces},${maxPlaces}})?$`);
        schema = schema.custom((value, helpers) => {
            if (!regex.test(value.toString())) {
                return helpers.error("number.decimal");
            }
            return value;
        });
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        addError(errors, field.key, `min cannot exceed max`);
    }

    if (field.min !== undefined) {
        if (field.min < LIMITS.NUMBER_MIN)
            addError(errors, field.key, `min < ${LIMITS.NUMBER_MIN}`);
        schema = schema.min(field.min);
    }

    if (field.max !== undefined) {
        if (field.max > LIMITS.NUMBER_MAX)
            addError(errors, field.key, `max > ${LIMITS.NUMBER_MAX}`);
        schema = schema.max(field.max);
    }

    return schema;
}

/* =================================
   DATE BUILDER
================================= */

function buildDateSchema(field, errors) {

    if (field.options) {
        if (!Array.isArray(field.options) || field.options.some(v => Number.isNaN(new Date(v).getTime()))) {
            addError(errors, field.key, `options must be valid date values`);
        }
        const forbidden = ["min", "max"];
        forbidden.forEach(prop => {
            if (field[prop] !== undefined)
                addError(errors, field.key, `${prop} not allowed when options is defined`);
        });
        return Joi.date().valid(...field.options);
    }

    let schema = Joi.date().min(LIMITS.DATE_MIN).max(LIMITS.DATE_MAX);

    // Validate metadata min
    if (field.min !== undefined) {
        const minDate = new Date(field.min);
        if (Number.isNaN(minDate.getTime())) {
            addError(errors, field.key, `date min is invalid`);
        } else if (minDate < LIMITS.DATE_MIN) {
            addError(errors, field.key, `date min < ${LIMITS.DATE_MIN_STR}`);
        }
        schema = schema.min(minDate);
    }

    // Validate metadata max
    if (field.max !== undefined) {
        const maxDate = new Date(field.max);
        if (Number.isNaN(maxDate.getTime())) {
            addError(errors, field.key, `date max is invalid`);
        } else if (maxDate > LIMITS.DATE_MAX) {
            addError(errors, field.key, `date max > ${LIMITS.DATE_MAX_STR}`);
        }
        schema = schema.max(maxDate);
    }
    return schema;
}

/* =================================
   DATETIME BUILDER
================================= */

function buildDateTimeSchema(field, errors) {

    const ISO_UTC_STRICT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (field.options) {
        if (!Array.isArray(field.options) || field.options.some(v => typeof v !== "string" || !ISO_UTC_STRICT.test(v))) {
            addError(errors, field.key, `options must be ISO UTC datetime strings`);
        }
        const forbidden = ["min", "max"];
        forbidden.forEach(prop => {
            if (field[prop] !== undefined)
                addError(errors, field.key, `${prop} not allowed when options is defined`);
        });
        return Joi.string().valid(...field.options);
    }

    let schema = Joi.string().pattern(ISO_UTC_STRICT);
    let minDateObj;
    let maxDateObj;

    // Validate metadata min
    if (field.min !== undefined) {
        if (ISO_UTC_STRICT.test(field.min)) {
            minDateObj = new Date(field.min);
            if (minDateObj < LIMITS.DATE_MIN)
                addError(errors, field.key, `datetime min < ${LIMITS.DATE_MIN_STR}`);
        } else {
            addError(errors, field.key, `datetime min must be ISO UTC format`);
        }
    }

    // Validate metadata max
    if (field.max !== undefined) {
        if (ISO_UTC_STRICT.test(field.max)) {
            maxDateObj = new Date(field.max);
            if (maxDateObj > LIMITS.DATE_MAX)
                addError(errors, field.key, `datetime max > ${LIMITS.DATE_MAX_STR}`);
        } else {
            addError(errors, field.key, `datetime max must be ISO UTC format`);
        }
    }

    // 🔥 Add missing logical check
    if (minDateObj && maxDateObj && minDateObj > maxDateObj) {
        addError(errors, field.key, `datetime min cannot exceed datetime max`);
    }

    schema = schema.custom((value, helpers) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime()))
            return helpers.error("datetime.invalid");

        if (date < LIMITS.DATE_MIN)
            return helpers.error("datetime.min");
        if (date > LIMITS.DATE_MAX)
            return helpers.error("datetime.max");

        if (minDateObj && date < minDateObj)
            return helpers.error("datetime.fieldMin");
        if (maxDateObj && date > maxDateObj)
            return helpers.error("datetime.fieldMax");
        return value;
    });
    return schema;
}

/* =================================
   BOOLEAN BUILDER
================================= */

function buildBooleanSchema() {
    return Joi.boolean();
}

/* =================================
   OBJECT BUILDER
================================= */

function buildObjectSchema(field, errors) {
    if (!Array.isArray(field.keys)) {
        addError(errors, field.key, `object must define keys array`);
        return Joi.object();
    }
    const obj = {};
    field.keys.map((child) => {
        obj[child.key] = buildFieldSchema(child, errors);
    });
    return Joi.object(obj);
}

/* =================================
   BASE ROUTER
================================= */

function buildBaseSchema(field, errors) {
    if (!field.type || typeof field.type !== "string") {
        addError(errors, field.key, `type is required`);
        return Joi.any();
    }
    switch (field.type) {
        case "string":
            return buildStringSchema(field, errors);
        case "number":
            return buildNumberSchema(field, errors);
        case "boolean":
            return buildBooleanSchema();
        case "date":
            return buildDateSchema(field, errors);
        case "datetime":
            return buildDateTimeSchema(field, errors);
        case "object":
            return buildObjectSchema(field, errors);
        default:
            addError(errors, field.key, `Unsupported type: ${field.type}`);
            return Joi.any();
    }
}

/* =================================
   FIELD BUILDER
================================= */

function buildFieldSchema(field, errors) {
    let schema = buildBaseSchema(field, errors);
    if (field.is_multiple) {
        const min = field.min_size ?? LIMITS.ARRAY_MIN_ITEMS;
        const max = field.max_size ?? LIMITS.ARRAY_MAX_ITEMS;

        if (field.min_size !== undefined && field.min_size < LIMITS.ARRAY_MIN_ITEMS)
            addError(errors, field.key, `array min_size < ${LIMITS.ARRAY_MIN_ITEMS}`);
        if (field.max_size !== undefined && field.max_size > LIMITS.ARRAY_MAX_ITEMS)
            addError(errors, field.key, `array max_size > ${LIMITS.ARRAY_MAX_ITEMS}`);

        schema = Joi.array()
            .items(schema)
            .min(min)
            .max(max);

        if (field.unique) schema = schema.unique();
    }
    return field.required ? schema.required() : schema.optional();
}

/* =================================
   MAIN GENERATOR
================================= */

async function generateJoiSchema(metadata) {
    const errors = [];
    const obj = {};
    metadata.map((field) => {
        if (!field.key || typeof field.key !== "string") {
            addError(errors, field.key, `key is required`);
            return;
        }
        if (obj[field.key]) {
            addError(errors, field.key, `Duplicate key found`);
            return;
        }
        obj[field.key] = buildFieldSchema(field, errors);
    });
    return {
        schema: Joi.object(obj),
        errors
    };
}

/* =================================
   VALIDATOR
================================= */

/**
 * Validates data against the generated Joi schema
 * @param {Array} metadata - Array of field metadata
 * @param {Object} data - Data to validate
 * @returns {Promise<Object>} - Object with errors and validated data
 */
async function validateSchema(metadata, data) {
    const { schema } = await generateJoiSchema(metadata);
    const { error, value } = schema.validate(data, {
        abortEarly: false,   // show all errors
        allowUnknown: false  // disallow extra fields
    });
    const errors = error?.details?.map(item => { delete item?.context; delete item?.path; return item; });
    return { errors, value };
}

module.exports.generateJoiSchema = generateJoiSchema;
module.exports.validateSchema = validateSchema;
