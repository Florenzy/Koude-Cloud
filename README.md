# Koude Cloud

Koude Cloud is a full-stack personal cloud storage application built with React, TypeScript and the Next.js App Router.

It supports file uploads, folders, sharing, authentication, storage quotas and persistent metadata through the same REST API across local Node.js and hosted cloud runtimes.

## Features

* Account registration and authentication
* File upload and download
* Folder creation and navigation
* Rename and move operations
* Starred files
* Trash and permanent deletion
* Revocable 7-day share links
* Storage quota tracking
* Server-side ownership checks
* Persistent file storage
* REST API
* Automated unit and integration tests
* Dockerized production deployment
* GitHub Actions CI/CD

## Tech Stack

### Application

* Next.js
* React
* TypeScript
* Next.js App Router
* REST API
* Zod

### Node.js runtime

* Node.js 22
* PostgreSQL
* Persistent filesystem storage
* Cookie-based authentication

### Hosted runtime

* Cloudflare-compatible worker runtime
* D1
* R2
* Platform-provided authentication

### Tooling

* pnpm
* Vitest
* PGlite
* Docker
* Docker Compose
* GitHub Actions

## Architecture

Koude Cloud supports two runtime environments behind the same application interface.

The Node.js version uses PostgreSQL for application data, opaque cookie sessions for authentication and a persistent upload volume for file storage.

The hosted version uses the same UI and REST handlers while replacing the underlying adapters with D1, R2 and platform authentication.

The `@runtime` alias selects the appropriate storage and identity implementation at build time.

## Run with Docker

Copy the example environment file:

```bash
cp .env.example .env
```

Set `POSTGRES_PASSWORD` to a secure random value, then start the application:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:3000
```

Create an account and start uploading files.

Database migrations run automatically before the application starts. PostgreSQL and uploaded files are stored in persistent Docker volumes and survive container replacement.

## Development

Requirements:

* Node.js 22
* pnpm 11.19.0
* PostgreSQL

Create and configure `.env` with:

```env
DATABASE_URL=postgresql://...
APP_ORIGIN=http://localhost:3000
UPLOAD_DIR=./uploads
```

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run migrations:

```bash
pnpm db:migrate
```

Start the Node.js development server:

```bash
pnpm dev:node
```

### Builds

Build the standalone Node.js application:

```bash
pnpm build:node
```

Build the hosted worker runtime:

```bash
pnpm build
```

## REST API

| Method   | Endpoint                                | Action                               |
| -------- | --------------------------------------- | ------------------------------------ |
| `POST`   | `/api/auth/register`                    | Create a Node.js account             |
| `POST`   | `/api/auth/login`                       | Start a session                      |
| `POST`   | `/api/auth/logout`                      | Revoke the current session           |
| `GET`    | `/api/me`                               | Get the current account              |
| `GET`    | `/api/files`                            | List owned entries and storage usage |
| `POST`   | `/api/files`                            | Create a folder                      |
| `POST`   | `/api/files/upload?name=...&parent=...` | Upload raw file bytes                |
| `GET`    | `/api/files/:id`                        | Read owned file metadata             |
| `PATCH`  | `/api/files/:id`                        | Rename, move, star, trash or restore |
| `DELETE` | `/api/files/:id`                        | Permanently delete a trashed item    |
| `GET`    | `/api/files/:id/download`               | Download an owned file               |
| `POST`   | `/api/files/:id/share`                  | Create or rotate a 7-day share link  |
| `DELETE` | `/api/files/:id/share`                  | Revoke a share link                  |
| `GET`    | `/api/shares/:token`                    | Download through a valid share link  |
| `GET`    | `/api/health`                           | Check database readiness             |

## Storage Rules

Each account currently has:

* 1 GB storage quota
* 5,000 entry limit
* 20 MB maximum file size

Files in trash still count toward the quota until they are permanently deleted.

Folders must be empty before permanent deletion.

Moving a folder into itself or one of its descendants is rejected.

Duplicate file names are allowed because entries are identified by unique IDs.

## Security

Authentication and file ownership checks are performed on the server.

Passwords use salted scrypt hashes.

Only hashes of session tokens are stored in PostgreSQL.

Authentication cookies are configured with:

* `HttpOnly`
* `SameSite=Lax`
* `Secure` when `APP_ORIGIN` uses HTTPS

Private file queries always include the authenticated owner.

Shared files use revocable temporary tokens and are served with caching disabled.

Write operations only accept same-origin browser requests.

## Testing

Run the complete local check suite:

```bash
pnpm typecheck
pnpm test
pnpm build:node
```

Integration tests exercise REST handlers using:

* embedded PostgreSQL through PGlite
* temporary filesystem storage
* cookie-based authentication test helpers

The hosted adapter is tested using SQLite and an object-storage test harness.

Unit tests cover authentication utilities, password hashing, validation and formatting.

CI also verifies that the production Docker image builds successfully.

## Deployment

The CI workflow runs on pushes and pull requests.

The manual deployment workflow:

1. runs project checks
2. builds the production image
3. publishes an immutable image to GHCR
4. deploys the image digest to a Linux host over SSH

A production host should provide:

* Docker Compose
* `/opt/koude/.env`
* GHCR package read access
* an HTTPS reverse proxy to `127.0.0.1:3000`

The following GitHub environment secrets are required:

```text
DEPLOY_HOST
DEPLOY_USER
SSH_KEY
SSH_KNOWN_HOSTS
```

The SSH host key is pinned and is never accepted automatically.

PostgreSQL and the uploads volume should be backed up together.

Application rollback can be performed by deploying a previous image digest. Database migrations should remain backward-compatible because reverting the application image does not revert schema migrations.

## Runtime Differences

The private hosted deployment is accessible only to its owner.

Its shared download links remain subject to the hosting platform's access policy.

The independent Node.js deployment supports unauthenticated downloads through valid, revocable share tokens.

## Project Status

Koude Cloud is an actively developed full-stack portfolio project focused on building a complete storage product rather than a frontend-only demo.

The project covers application architecture, authentication, REST API design, relational data, object and filesystem storage, testing, containerization and deployment automation.
