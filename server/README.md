# Survey API Server

Simple Express backend server that connects directly to MongoDB for the Survey application.

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

You can set the following environment variables:

- `PORT` - Server port (default: 3001)
- MongoDB connection string is hardcoded in `index.js` (you can move it to env if needed)

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
