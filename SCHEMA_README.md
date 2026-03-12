# Metadata Schema Documentation

This document describes the structure of the metadata used by `utils/schema.js` to dynamically generate Joi validation schemas.

## Overview

The schema generator takes an array of "field" objects and converts them into a Joi object schema. Each field object defines the validation rules for a specific key.

## Base Properties

All field objects support the following base properties:

| Property | Type | Description |
| :--- | :--- | :--- |
| `key` | `string` | The name of the field. Must match pattern: `^[a-zA-Z][a-zA-Z0-9_]{0,20}$`. |
| `type` | `string` | One of: `string`, `number`, `boolean`, `date`, `datetime`, `object`. |
| `required` | `boolean` | If true, the field must be present and non-null. |
| `is_multiple`| `boolean` | If true, the field is treated as an array of the specified type. |
| `min_size` | `number` | Minimum number of items (if `is_multiple` is true). |
| `max_size` | `number` | Maximum number of items (if `is_multiple` is true). |
| `unique` | `boolean` | If true, array items must be unique (if `is_multiple` is true). |

---

## Type-Specific Properties

### 1. String (`type: "string"`)

*If `options` is provided, other validation properties (min, max, regex, etc.) are ignored.*

| Property | Type | Description |
| :--- | :--- | :--- |
| `options` | `string[]` | A fixed list of allowed string values. |
| `min` | `number` | Minimum string length (Default: 0, Max: 3000). |
| `max` | `number` | Maximum string length (Max: 3000). |
| `regex` | `string` | RegEx pattern for validation. |
| `email` | `boolean` | Validates as a proper email format. |
| `lowercase` | `boolean` | Forces/validates value is lowercase. |
| `uppercase` | `boolean` | Forces/validates value is uppercase. |

### 2. Number (`type: "number"`)

*If `options` is provided, other validation properties are ignored.*

| Property | Type | Description |
| :--- | :--- | :--- |
| `options` | `number[]` | A fixed list of allowed numeric values. |
| `min` | `number` | Minimum value (-999,999,999 to 999,999,999). |
| `max` | `number` | Maximum value (-999,999,999 to 999,999,999). |
| `integer` | `boolean` | Field must be an integer. |
| `decimal` | `boolean` | Field can be a decimal. |
| `decimal_min_places` | `number` | Minimum allowed decimal places (Default: 1, Max: 5). |
| `decimal_max_places` | `number` | Maximum allowed decimal places (Max: 5). |

### 3. Date (`type: "date"`)

Validates standard date inputs.
*   **Property:** `min` / `max` (Accepts ISO date strings or Date objects).
*   **Property:** `options` (Array of allowed date values).

### 4. DateTime (`type: "datetime"`)

Validates strict ISO UTC datetime strings (Format: `YYYY-MM-DDTHH:mm:ss.sssZ`).
*   **Property:** `min` / `max` (Must be ISO UTC strings).
*   **Property:** `options` (Array of ISO UTC strings).

### 5. Object (`type: "object"`)

Allows for recursive/nested structures.
*   **Property:** `keys` (Required). An array of field objects defining the sub-structure.

---

## System Constraints

### 1. Restricted Keys
The following keys are reserved by the system and cannot be used as field names:
`_id`, `_created_by`, `_createdBy`, `_created_on`, `_updated_by`, `_updatedBy`, `_updated_on`, `_expire_on`, `is_active`.

### 2. Global Limits
The following hardcoded limits are enforced:
*   **Strings**: 0 to 3000 characters.
*   **Numbers**: -999,999,999 to 999,999,999.
*   **Decimals**: 1 to 5 decimal places.
*   **Arrays**: 0 to 2000 items.
*   **Dates**: 1900-01-01 to 2100-12-31.

## Example Configuration

```javascript
[
  {
    "key": "username",
    "type": "string",
    "required": true,
    "min": 3,
    "max": 30
  },
  {
    "key": "tags",
    "type": "string",
    "is_multiple": true,
    "min_size": 1,
    "unique": true
  },
  {
    "key": "metadata",
    "type": "object",
    "keys": [
      { "key": "created_at", "type": "datetime", "required": true },
      { "key": "version", "type": "number", "integer": true }
    ]
  }
]
```
