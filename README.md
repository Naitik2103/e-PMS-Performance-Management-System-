# e-PMS Performance Management System

A production-ready performance management system with role-based access, goal setting, six-month tracking, year-end reviews, and admin hierarchy.

## Tech Stack

- Frontend: React + Vite + React Router
- Backend: Node.js + Express
- Database: PostgreSQL with `pg` and Sequelize
- Auth: JWT

## Project Structure

- backend/
- frontend/

## Backend Setup

1. Copy environment file
   - `backend/.env.example` -> `backend/.env`
2. Update PostgreSQL connection and JWT secret in `backend/.env`
3. Install dependencies
   - `cd backend`
   - `npm install`
4. Seed sample users (optional)
   - `npm run seed`
5. Start backend server
   - `npm run dev`

Backend runs on `http://localhost:5000`.

## Demo Time Travel (For Professor Demo)

Use this to simulate date-based cycle windows without waiting months.

1. Open `backend/.env`
2. Set `APPRAISAL_TIME_TRAVEL_DATE` to the date you want to simulate (format `YYYY-MM-DD`)
   - Example: `APPRAISAL_TIME_TRAVEL_DATE=2026-10-01`
3. Restart backend (`npm run dev` in `backend`)
4. Refresh frontend

Notes:

- When this variable is set, backend window checks and active-cycle flags use the simulated date.
- Leave it empty to return to real current date behavior.

## Frontend Setup

1. Copy environment file
   - `frontend/.env.example` -> `frontend/.env`
2. Install dependencies
   - `cd frontend`
   - `npm install`
3. Start frontend server
   - `npm run dev`

Frontend runs on `http://localhost:3000`.

## Vercel Deployment

This repository is configured as a monorepo for a single Vercel project.

1. Set these environment variables in Vercel:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `FRONTEND_URL` or `APP_URL`
   - `SMTP_HOST`, `SMTP_PORT`, `EMAIL_USER`, `EMAIL_PASS` if email features are used
2. Deploy the repository from the root folder.
3. Vercel will build the frontend from `frontend/` and serve API routes from `/api`.
4. Client-side routes are handled by the SPA rewrite in `vercel.json`.

Local commands from the root:

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

Production build locally:

```bash
npm run build
```

## Sample Credentials (seed script)

All accounts use password `Password123!`.

- Admin: `admin@epms.local`
- Accepting Officer: `accepting@epms.local`
- Reviewing Officer: `reviewing@epms.local`
- Reporting Officer: `reporting@epms.local`
- Employee: `employee@epms.local`

## Notes

- Admin can create users and define reporting hierarchy.
- Employees can create goals and submit self summaries.
- Reporting and reviewing officers approve goals and reviews per hierarchy.
- On Vercel, password-reset emails should use `FRONTEND_URL` or `APP_URL` so links point to the deployed domain.
