require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB connection
// IMPORTANT:
// - The MongoDB URI must be provided via the MONGODB_URI environment variable.
// - Never commit credentials in source control.
// - Rotate the password for any previously hard-coded URI before deploying.
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  // Fail fast rather than silently using an insecure default.
  console.error(
    'Missing MONGODB_URI environment variable. Please set it in your .env file or deployment configuration.'
  );
  process.exit(1);
}

const DB_NAME = 'survey_app';
const COLLECTION_NAME = 'surveys';

let client;
let db;

// Middleware
// Restrict CORS to known front-end origins. For local development, this
// defaults to Vite's typical URL; for production, configure CORS_ORIGINS
// with a comma-separated list of allowed origins.
const defaultCorsOrigins = ['http://localhost:5173'];
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : defaultCorsOrigins;

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser tools (no Origin header) and explicitly allowed origins.
      if (!origin || configuredOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);
app.use(express.json());

// Connect to MongoDB
async function connectToMongoDB() {
  if (db) return db;

  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const allowInsecureTls = process.env.MONGODB_ALLOW_INSECURE_TLS === 'true';

    // Base Mongo client options with stable server API version
    const mongoOptions = {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      tls: true,
    };

    // Only allow insecure TLS when explicitly enabled and never in production.
    if (!isProduction && allowInsecureTls) {
      // This is intended for local development only (e.g. when antivirus/proxy
      // interferes with TLS inspection). Do NOT enable in production.
      mongoOptions.tlsInsecure = true;
    }

    client = new MongoClient(MONGODB_URI, mongoOptions);

    await client.connect();
    db = client.db(DB_NAME);
    console.log('Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Initialize connection
connectToMongoDB().catch(console.error);

// Routes

// GET all surveys
app.get('/api/surveys', async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const collection = database.collection(COLLECTION_NAME);
    
    const surveys = await collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json(surveys.map(survey => ({
      ...survey,
      _id: survey._id.toString(),
    })));
  } catch (error) {
    console.error('Error fetching surveys:', error);
    res.status(500).json({ error: 'Failed to fetch surveys' });
  }
});

// GET single survey by ID
app.get('/api/surveys/:id', async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const collection = database.collection(COLLECTION_NAME);
    
    const survey = await collection.findOne({ 
      _id: new ObjectId(req.params.id) 
    });
    
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    res.json({
      ...survey,
      _id: survey._id.toString(),
    });
  } catch (error) {
    console.error('Error fetching survey:', error);
    res.status(500).json({ error: 'Failed to fetch survey' });
  }
});

// POST create survey
app.post('/api/surveys', async (req, res) => {
  try {
    const { title, surveyJson, odinContent, publicLink } = req.body;
    
    if (!title || !surveyJson || !odinContent || !publicLink) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const database = await connectToMongoDB();
    const collection = database.collection(COLLECTION_NAME);
    
    const survey = {
      title,
      surveyJson,
      odinContent,
      publicLink,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await collection.insertOne(survey);
    
    res.status(201).json({
      ...survey,
      _id: result.insertedId.toString(),
    });
  } catch (error) {
    console.error('Error creating survey:', error);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// DELETE survey
app.delete('/api/surveys/:id', async (req, res) => {
  try {
    const database = await connectToMongoDB();
    const collection = database.collection(COLLECTION_NAME);
    
    const result = await collection.deleteOne({ 
      _id: new ObjectId(req.params.id) 
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting survey:', error);
    res.status(500).json({ error: 'Failed to delete survey' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
