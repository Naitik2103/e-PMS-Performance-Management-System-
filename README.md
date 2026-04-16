# e-PMS Performance Management System

A production-ready performance management system with role-based access, goal setting, six-month tracking, year-end reviews, and admin hierarchy.

## Tech Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
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
