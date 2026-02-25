# Survey API Server

Simple Express backend for the Survey application. Uses in-memory storage for survey history (data lost on restart).

## Setup

1. Install dependencies:
```bash
cd server
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3001` by default.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `CORS_ORIGINS` - Comma-separated allowed origins (e.g. `http://yourserver.com`)

## API Endpoints

- `GET /api/surveys` - Get all surveys
- `GET /api/surveys/:id` - Get a single survey by ID
- `POST /api/surveys` - Create a new survey
- `DELETE /api/surveys/:id` - Delete a survey
- `GET /health` - Health check

## Frontend Configuration

In your frontend `.env` file, add:
```
VITE_API_URL=http://localhost:3001
```

For production, update this to your production server URL.
