import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { initializeFirebase } from './helpers/auth'
import { initializeDatabase } from './helpers/db'

// Load environment variables
config()

// Import routers
import userRouter from './endpoints/user'
import marketRouter from './endpoints/market'
import betRouter from './endpoints/bet'
import browseRouter from './endpoints/browse'
import engagementRouter from './endpoints/engagement'

const app = express()
const PORT = process.env.PORT || 8080

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// API routes
app.use('/', userRouter)
app.use('/', marketRouter)
app.use('/', betRouter)
app.use('/', browseRouter)
app.use('/', engagementRouter)

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  })
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

// Initialize services
async function initialize() {
  try {
    console.log('🚀 Starting Manifold Backend (Simplified)...')

    // Initialize Firebase
    initializeFirebase()

    // Initialize Database
    initializeDatabase()

    console.log('✅ All services initialized')
  } catch (error) {
    console.error('❌ Initialization failed:', error)
    process.exit(1)
  }
}

// Start server
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`)
    console.log(`📍 Health check: http://localhost:${PORT}/health`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
  })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})

export default app
