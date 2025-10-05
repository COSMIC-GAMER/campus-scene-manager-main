# Campus Events Backend (Express + MySQL)

This folder contains a ready-to-run Node + Express backend for the Campus Events application.

## What's included

- `server.js` - main Express server (auth, events, registrations, admin utilities)
- `schema.sql` - database schema and sample seed data for `campus_events`
- `package.json` - dependencies and scripts
- `.env.example` - environment variables example
- `README.md` - this file

## Quick start (local)

1. Install dependencies:

```bash
npm install
```

2. Create the database and tables:

```bash
# from terminal with mysql client
mysql -u root -p < schema.sql
```

3. Copy `.env.example` to `.env` and update values if needed:

```bash
cp .env.example .env
```

Default `.env` values assume local MySQL with user `root` and empty password. Adjust `DB_PASSWORD` as necessary.

4. Start the server:

```bash
npm run dev
# or
npm start
```

Server will run at `http://localhost:4000` by default.

## Default admin user

On startup, the server will automatically create a default admin user if one doesn't exist:

- Email: `admin@college.edu`
- Password: `admin123`

You can change these values in your `.env` file (`ADMIN_EMAIL` and `ADMIN_PASSWORD`) before first run.

> For production, **change the admin password** and use a strong `JWT_SECRET`.

## API Overview

All routes are prefixed with `/api`.

- `POST /api/auth/signup` — register `{ name, email, password, role? }`
- `POST /api/auth/login` — login `{ email, password }` -> returns `{ token }`
- `GET /api/events` — list events (query: search, category, status, page, limit)
- `GET /api/events/:id` — get event details
- `POST /api/events` — create event (admin only, JWT)
- `PUT /api/events/:id` — update event (admin only)
- `DELETE /api/events/:id` — delete event (admin only)
- `POST /api/events/:id/register` — register for event (authenticated student)
- `POST /api/events/:id/unregister` — unregister (authenticated student)
- `GET /api/users/:id/registrations` — get registrations for user (self or admin)
- `GET /api/events/:id/registrations` — admin-only

## Notes

- Frontend origin allowed by CORS defaults to `http://localhost:3000`. Change `FRONTEND_ORIGIN` in `.env` if needed.
- The server uses JWT auth. Store the token client-side (e.g., localStorage) and send `Authorization: Bearer <token>` with requests.
- For production, secure the JWT secret and consider using migrations and stronger DB credentials.
