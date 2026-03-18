import express from 'express'
import cors from 'cors'
import pkg from 'pg'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const { Pool } = pkg

const app = express()
const PORT = process.env.PORT || 8080

app.use(cors())
app.use(express.json())

// 🔗 Connect to PostgreSQL (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// 🔑 JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "secret"

// ✅ Test route
app.get('/', (req, res) => {
  res.json({ message: 'Backend is running' })
})

// ✅ Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

/* =========================
   🔐 LOGIN (NORMAL USERS)
========================= */
app.post('/login', async (req, res) => {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    )

    if (!result.rows.length) {
      return res.status(401).json({ error: "User not found" })
    }

    const user = result.rows[0]

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      return res.status(401).json({ error: "Invalid password" })
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET
    )

    res.json({ token, user })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
})

/* =========================
   🔐 ADMIN LOGIN
========================= */
app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    )

    if (!result.rows.length) {
      return res.status(401).json({ error: "User not found" })
    }

    const user = result.rows[0]

    const valid = await bcrypt.compare(password, user.password)

    if (!valid) {
      return res.status(401).json({ error: "Invalid password" })
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ error: "Not an admin" })
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET
    )

    res.json({ token, user })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Server error" })
  }
})

/* =========================
   🛡️ MIDDLEWARE (AUTH)
========================= */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization

  if (!authHeader) return res.status(401).json({ error: "No token" })

  const token = authHeader.split(" ")[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ error: "Invalid token" })
  }
}

/* =========================
   👑 ADMIN ONLY
========================= */
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin only" })
  }
  next()
}

/* =========================
   👥 GET USERS
========================= */
app.get('/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const result = await pool.query("SELECT id, email, role, status FROM users")
  res.json(result.rows)
})

/* =========================
   ❌ DELETE USER
========================= */
app.delete('/admin/delete/:id', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params
  await pool.query("DELETE FROM users WHERE id = $1", [id])
  res.json({ message: "User deleted" })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})