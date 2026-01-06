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

## Deployment to Render

This project is configured for deployment on Render using the Render Blueprint.

### Prerequisites

1. A Render account (sign up at https://render.com)
2. A GitHub repository with this code
3. Node.js 18+ (Render will use the version specified in `.nvmrc`)
4. (Optional) A Google Generative AI API key

### Deployment Steps

1. **Push your code to GitHub** (if not already done)

2. **Deploy using Render Blueprint:**
   - Go to your Render dashboard
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file
   - Review the service configuration and click "Apply"

3. **Configure Environment Variables:**
   - In your Render service settings, add the following environment variables:
     - `GOOGLE_API_KEY` (optional): Your Google Generative AI API key
     - `NODE_ENV`: Set to `production` (automatically set by render.yaml)
     - `PORT`: Automatically set by Render (defaults to 10000)
     - `VITE_API_URL` (optional): If not set, the app uses relative URLs which work perfectly since frontend and backend are served from the same domain

4. **Deploy:**
   - Render will automatically build and deploy your application
   - The build process will:
     - Install all dependencies (root, frontend, and backend)
     - Build the frontend React app
     - Start the backend server which serves both API and static frontend files

### Manual Deployment (Alternative)

If you prefer to deploy manually without Blueprint:

1. Create a new **Web Service** on Render
2. Connect your GitHub repository
3. Configure the service:
   - **Build Command:** `npm run install:all && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Add environment variables as listed above
5. Deploy

### Post-Deployment

After deployment, your application will be available at:
- `https://your-service-name.onrender.com`
- The frontend and backend are served from the same domain
- API endpoints are available at `/api/*`
- Health check endpoint: `/api/health`

### Local Development with Environment Variables

For local development, create `.env` files:

**backend/.env:**
```
GOOGLE_API_KEY=your_api_key_here
PORT=3001
NODE_ENV=development
```

**frontend/.env:**
```
VITE_API_URL=http://localhost:3001
```

## Features

- ✅ Vite React frontend with Tailwind CSS
- ✅ Express Node.js backend
- ✅ Server-Sent Events (SSE) streaming
- ✅ Base64 image upload handling
- ✅ Google Generative AI integration (optional)
- ✅ CORS enabled for cross-origin requests
- ✅ Production-ready deployment configuration

