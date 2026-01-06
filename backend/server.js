require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Google Generative AI
const genAI = process.env.GOOGLE_API_KEY 
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null;

// SSE endpoint for workflow streaming
app.post('/api/workflow/stream', async (req, res) => {
  try {
    const { image, prompt } = req.body;

    // Validate input
    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Handle base64 image
    let imageData;
    let mimeType = 'image/png'; // default

    if (typeof image === 'string') {
      // Check if it's a data URL
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1];
          imageData = matches[2];
        } else {
          // Assume it's just base64
          imageData = image;
        }
      } else {
        // Assume it's base64 without data URL prefix
        imageData = image;
      }
    } else {
      return res.status(400).json({ error: 'Image must be a base64 string' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');

    // If Google Generative AI is configured, use it
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const imagePart = {
          inlineData: {
            data: imageData,
            mimeType: mimeType
          }
        };

        const userPrompt = prompt || 'Analyze this image and provide a detailed description.';
        const fullPrompt = `${userPrompt}\n\nPlease provide your response in a streaming format.`;

        const result = await model.generateContentStream([fullPrompt, imagePart]);

        // Stream the response
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            res.write(`data: ${JSON.stringify({ content: chunkText })}\n\n`);
          }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (error) {
        console.error('Error with Google Generative AI:', error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    } else {
      // Fallback: send a mock response if API key is not configured
      const mockResponse = 'This is a mock response. Please configure GOOGLE_API_KEY in your .env file to use Google Generative AI.';
      const words = mockResponse.split(' ');
      
      for (let i = 0; i < words.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        res.write(`data: ${JSON.stringify({ content: words[i] + ' ' })}\n\n`);
      }
      
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error in /api/workflow/stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  if (!genAI) {
    console.warn('Warning: GOOGLE_API_KEY not configured. Using mock responses.');
  }
});

