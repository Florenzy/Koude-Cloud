# Koude Cloud

Personal cloud storage built with React, TypeScript and the Next.js App Router. The Node.js version uses PostgreSQL, opaque cookie sessions and a persistent upload volume. The hosted Sites version uses the same interface and REST handlers with ChatGPT sign-in, D1 and R2.

## Run with Docker

```sh
cp .env.example .env
docker compose up --build -d
```

Set `POSTGRES_PASSWORD` to a random alphanumeric value before starting. Open http://localhost:3000 and create an account. Migrations run before the application starts. Database and file volumes survive container replacement.

## Develop

Use Node.js 22 and pnpm 11.19.0. Start a PostgreSQL server, set `DATABASE_URL`, `APP_ORIGIN` and `UPLOAD_DIR` in `.env`, then run:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev:node
```

`pnpm build:node` builds the Next.js standalone server. `pnpm build` builds the Sites Worker. The `@runtime` alias selects the storage and identity adapter at build time.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build:node
```

Integration tests exercise REST handlers against embedded PostgreSQL using PGlite, a temporary file directory and a cookie test harness. The hosted adapter is tested against SQLite with an object-storage test harness. Unit tests cover password hashing, validation and formatting. CI also builds the production Docker image.

## REST API

| Method | Path                                    | Action                                            |
| ------ | --------------------------------------- | ------------------------------------------------- |
| POST   | `/api/auth/register`                    | Create a Node.js account                          |
| POST   | `/api/auth/login`                       | Start a session                                   |
| POST   | `/api/auth/logout`                      | Revoke the current session                        |
| GET    | `/api/me`                               | Current account                                   |
| GET    | `/api/files`                            | Owned entries and storage usage                   |
| POST   | `/api/files`                            | Create a folder with `name` and nullable `parent` |
| POST   | `/api/files/upload?name=...&parent=...` | Upload raw file bytes                             |
| GET    | `/api/files/:id`                        | Read owned metadata                               |
| PATCH  | `/api/files/:id`                        | Rename, move, star, trash or restore              |
| DELETE | `/api/files/:id`                        | Permanently delete a trashed item                 |
| GET    | `/api/files/:id/download`               | Download owned file                               |
| POST   | `/api/files/:id/share`                  | Create or rotate a 7-day link                     |
| DELETE | `/api/files/:id/share`                  | Revoke a link                                     |
| GET    | `/api/shares/:token`                    | Download through a valid link                     |
| GET    | `/api/health`                           | Database readiness                                |

Writes accept same-origin browser requests. Authentication is checked on the server; every private entry lookup includes the owner. Passwords use salted scrypt hashes. Only hashes of session tokens are stored in PostgreSQL. Cookies are HttpOnly and SameSite=Lax, with Secure enabled for an HTTPS `APP_ORIGIN`. Shared files are sent as attachments with caching disabled.

Each account has 1 GB of storage, up to 5,000 entries and a 20 MB per-file limit. Trash counts toward the quota. Folders must be empty before they can be trashed. Moving a folder into itself or a descendant is rejected. Files with duplicate names are allowed and have distinct IDs.

## Deployment

The CI workflow runs on pushes and pull requests. The manual Deploy workflow tests the project, publishes an immutable image to GHCR and deploys its digest over SSH.

Prepare a Linux host with Docker Compose, `/opt/koude/.env`, a GHCR login with package read access and an HTTPS reverse proxy to `127.0.0.1:3000`. Set `APP_ORIGIN` to the HTTPS origin. Add the `production` GitHub environment and secrets `DEPLOY_HOST`, `DEPLOY_USER`, `SSH_KEY` and `SSH_KNOWN_HOSTS`. Run the Deploy workflow. The SSH host key is pinned; it is never accepted automatically.

Back up PostgreSQL and the uploads volume together. To roll back application code, deploy a previous image digest. Schema changes need backward-compatible migrations; reverting an image does not revert a database migration.

The private Sites deployment is accessible only to its owner. Its shared download links remain subject to the platform access policy. The independent Node.js deployment supports unauthenticated downloads through valid, revocable share tokens.
