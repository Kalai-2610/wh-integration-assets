# Webhook Integration Assets

A robust backend integration system for managing assets, credentials, and data via webhooks and RESTful APIs.

## Configuration

The application requires a `config.env` file in the root directory with the following variables:

| Variable | Description |
| :--- | :--- |
| `NODE_ENV` | Environment mode (`development` or `production`). |
| `PORT` | The port number on which the server will run (default: 3000). |
| `DATABASE` | MongoDB connection string. |
| `DB_USER` | Database username. |
| `DB_PASSWORD` | Database password. |
| `DB_NAME` | Database name for development. |
| `PROD_DB_NAME` | Database name for production. |
| `ADMIN_PASSWORD` | Administrative password for protected operations. |

## API Endpoints

### 1. Authentication (`/auth/v1/`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/sign_in` | Sign in to the application. |
| `GET` | `/refresh_token` | Refresh the authentication token. |
| `POST` | `/change_password` | Change user password (Requires Auth). |
| `DELETE` | `/sign_out` | Sign out from the application (Requires Auth). |
| `DELETE` | `/clear_sessions` | Clear all active sessions (Requires Auth). |
| `POST` | `/update_user_status` | Update user status (Requires Auth). |

### 2. OAuth 2.0 Authentication (`/auth/oauth/v1/`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/authorize` | Get the interactive authorization page (Browser-based). |
| `POST` | `/authorize` | Submit authorization and get a code (Redirects to callback). |
| `POST` | `/token` | Exchange code or client credentials for an access token. |

### 3. User Management (`/api/v1/users`)

*All routes require authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all users. |
| `POST` | `/` | Create a new user. |
| `GET` | `/:id` | Get a specific user by ID. |
| `PATCH` | `/:id` | Update a user by ID. |
| `DELETE` | `/:id` | Delete a user by ID (Currently disabled). |

### 4. Resource Management (`/api/v1/resources`)

*All routes require authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all resources. |
| `POST` | `/` | Create a new resource. |
| `GET` | `/:id` | Get a specific resource by ID. |
| `PATCH` | `/:id` | Update a resource by ID. |
| `DELETE` | `/:id` | Delete a resource by ID. |

[Resource Schema](SCHEMA_README.md)

### 5. Credentials Management (`/api/v1/credentials`)

*All routes require authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all credentials. |
| `POST` | `/` | Create new credentials. |
| `DELETE` | `/clear` | Clear all credentials. |
| `GET` | `/:id` | Get specific credentials by ID. |
| `PATCH` | `/:id` | Update credentials by ID. |
| `DELETE` | `/:id` | Delete credentials by ID. |

> [!NOTE]
> For `oauth2` type credentials, `client_id` is generated as a UUID v4.

### 6. Dynamic Data API

The system allows creating custom resources with dynamic schemas. Each resource has its own dedicated collection.

#### Access Methods
Data can be accessed via different authentication mechanisms:
*   **Public Access**: `/open/v1/:resource_name` (Limited permissions).
*   **Basic Auth**: `/basic/v1/:resource_name` (Verified via Basic Authentication).
*   **API Key**: `/api_key/v1/:resource_name` (Verified via API Key).
*   **Token Access**: `/token/v1/:resource_name` (Verified via specific Token).
*   **OAuth2 Access**: `/oauth2/v1/:resource_name` (Verified via OAuth 2.0 Bearer Token).

#### Dynamic Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all data for the resource. Supports pagination and sorting. |
| `POST` | `/` | Create a new data entry (Validated against resource schema). |
| `GET` | `/:id` | Get a specific data entry by ID. |
| `PUT` | `/:id` | Update a data entry by ID. |
| `DELETE` | `/:id` | Delete a data entry by ID (Soft delete). |

#### Query Parameters (GET Requests)
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `page` | `number` | Page number (Default: 1). |
| `size` | `number` | Items per page (Default: 10, Max: 25). |
| `sortBy` | `string` | Field to sort by (Default: `_created_on`). |
| `sortOrder` | `string` | Sort order: `asc` or `desc` (Default: `asc`). |

### 7. Standard Data API (`/api/v1/data`)

A general-purpose data store that does not require a pre-defined resource schema.

*Requires standard user authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all data from the default store. |
| `POST` | `/` | Create a new data entry. |
| `GET` | `/:id` | Get data by ID. |
| `PATCH` | `/:id` | Update data by ID. |
| `DELETE` | `/:id` | Delete data by ID. |

## System Requirements

- **Content-Type**: All `POST` and `PATCH` requests must include the header `Content-Type: application/json`.
- **Data Integrity**: All records include metadata such as `_created_on`, `_created_by`, `_updated_on`, and `_updated_by` for auditing.

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Set up your `config.env` file.
4.  Start the server: `npm start`
