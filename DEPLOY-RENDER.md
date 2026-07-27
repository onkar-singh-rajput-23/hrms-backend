# Deploying the HRMS backend to Render (free) + MongoDB Atlas (free)

The backend is a standard Node/Express + Mongoose app. It connects to MongoDB via
`MONGO_URI` and listens on `PORT` (Render injects `PORT` automatically).

## 1. MongoDB Atlas (free M0)
1. Sign up at https://www.mongodb.com/cloud/atlas and create a free **M0** cluster.
2. **Database Access** → add a database user + password.
3. **Network Access** → add IP `0.0.0.0/0` (allow from anywhere, so Render can connect).
4. **Connect → Drivers** → copy the SRV connection string and append the db name `hrms`:
   `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/hrms?retryWrites=true&w=majority`
   - URL-encode special characters in the password (e.g. `@` → `%40`).
   - Keep this private — it contains your password.

## 2. Render web service (free)
1. Sign up at https://render.com and connect your GitHub.
2. **New → Web Service** → pick the `hrms-backend` repo (or **New → Blueprint** to use `render.yaml`).
3. Settings (if not using the blueprint):
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
4. **Environment** → add:
   - `MONGO_URI` = your Atlas string from step 1
   - `JWT_SECRET` = a long random string
   - `CORS_ORIGIN` = your frontend origin (or `*` while testing)
5. Create → Render builds and gives you `https://hrms-backend-XXXX.onrender.com`.

## 3. Seed the data (once)
Seeding uses the same `MONGO_URI`. Run it locally pointed at Atlas:

```bash
cd HRMS/backend
MONGO_URI="<your atlas string>" npm run seed:clean
```

This creates the Hurry's roster: 9 employees, June 2026 payroll, and 12 logins
(shared password `Password123!`): `admin@hurrys.local` (admin), `hr@hurrys.local` (admin),
`manager@hurrys.local` (manager), and one per employee (e.g. `monu@hurrys.local`).

## 4. Point the frontend at Render
Set in the frontend host / `HRMS/frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=https://hrms-backend-XXXX.onrender.com/api
```

## Notes
- **Free tier sleeps** after ~15 min idle; the first request then takes ~30–60s to wake.
- Verify after deploy: open `https://<your-service>.onrender.com/api/health` → `{"status":"ok"}`.
