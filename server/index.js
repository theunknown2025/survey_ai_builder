require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

const surveys = [];

// Middleware
const defaultCorsOrigins = ['http://localhost:5173'];
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : defaultCorsOrigins;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);
app.use(express.json());

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// GET all surveys
app.get('/api/surveys', (req, res) => {
  const sorted = [...surveys].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(sorted);
});

// GET single survey by ID
app.get('/api/surveys/:id', (req, res) => {
  const survey = surveys.find((s) => s._id === req.params.id);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  res.json(survey);
});

// POST create survey
app.post('/api/surveys', (req, res) => {
  const { title, surveyJson, odinContent, publicLink } = req.body;

  if (!title || !surveyJson || !odinContent || !publicLink) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const survey = {
    _id: generateId(),
    title,
    surveyJson,
    odinContent,
    publicLink,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  surveys.push(survey);
  res.status(201).json(survey);
});

// DELETE survey
app.delete('/api/surveys/:id', (req, res) => {
  const idx = surveys.findIndex((s) => s._id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Survey not found' });
  surveys.splice(idx, 1);
  res.json({ success: true });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
