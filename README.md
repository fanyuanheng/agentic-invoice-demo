# Agentic Invoice Demo

A full-stack application with a Vite React frontend (Tailwind CSS) and Express Node.js backend.

## Project Structure

```
agentic-invoice-demo/
├── frontend/          # Vite React app with Tailwind CSS
└── backend/           # Express Node.js server
```

## Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a `.env` file:
   ```bash
   GOOGLE_API_KEY=your_api_key_here
   PORT=3001
   ```

3. Install dependencies (already done):
   ```bash
   npm install
   ```

4. Start the server:
   ```bash
   npm start
   ```

The server will run on `http://localhost:3001`

## Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies (already done):
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will run on `http://localhost:5173` (or another port if 5173 is taken)

## API Endpoints

### POST `/api/workflow/stream`
Server-Sent Events (SSE) endpoint for streaming workflow responses.

**Request Body:**
```json
{
  "image": "base64_encoded_image_string",
  "prompt": "Optional prompt text"
}
```

**Response:**
SSE stream with JSON data:
```
data: {"content": "chunk of text"}
data: {"done": true}
```

### GET `/api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Features

- ✅ Vite React frontend with Tailwind CSS
- ✅ Express Node.js backend
- ✅ Server-Sent Events (SSE) streaming
- ✅ Base64 image upload handling
- ✅ Google Generative AI integration (optional)
- ✅ CORS enabled for cross-origin requests

