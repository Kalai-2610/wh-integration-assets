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
| `DELETE` | `/clear_sessions` | Clear all active sessions (Requires Auth). |
| `POST` | `/change_password` | Change user password (Requires Auth). |
| `POST` | `/update_user_status` | Update user status (Requires Auth). |

### 2. User Management (`/api/v1/users`)

*All routes require authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all users. |
| `POST` | `/` | Create a new user. |
| `GET` | `/:id` | Get a specific user by ID. |
| `PATCH` | `/:id` | Update a user by ID. |
| `DELETE` | `/:id` | Delete a user by ID. |

### 3. Credentials Management (`/api/v1/credentials`)

*All routes require authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all credentials. |
| `POST` | `/` | Create new credentials. |
| `DELETE` | `/clear` | Clear all credentials. |
| `GET` | `/:id` | Get specific credentials by ID. |
| `PATCH` | `/:id` | Update credentials by ID. |
| `DELETE` | `/:id` | Delete credentials by ID. |

### 4. Data Management

The system provides multiple ways to access data based on the authentication mechanism.

#### Standard API (`/api/v1/data`)
*Requires standard user authentication.*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Get all data. |
| `POST` | `/` | Create new data entry. |
| `GET` | `/:id` | Get data by ID. |
| `PATCH` | `/:id` | Update data by ID. |
| `DELETE` | `/:id` | Delete data by ID. |

#### Other Access Methods
*   **Public Access**: `/open/v1/data` (Limited scopes: read, write, delete).
*   **Basic Auth**: `/basic/v1/data` (Verified via Basic Authentication).
*   **Web API Key**: `/web-api/v1/data` (Verified via API Key).
*   **Token Access**: `/token/v1/data` (Verified via specific Token).

## Getting Started

1.  Clone the repository.
2.  Install dependencies: `npm install`
3.  Set up your `config.env` file.
4.  Start the server: `npm start`
