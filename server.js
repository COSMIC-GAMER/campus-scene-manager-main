require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const cors = require('cors');

const app = express();
app.use(express.json());

const {
  PORT = 4000,
  DB_HOST = '127.0.0.1',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_DATABASE = 'campus_events',
  JWT_SECRET = 'supersecret',
  JWT_EXPIRES_IN = '7d',
  FRONTEND_ORIGIN = 'http://localhost:3000',
  ADMIN_EMAIL = 'admin@college.edu',
  ADMIN_PASSWORD = 'admin123',
} = process.env;

// CORS - allow local frontend during development
app.use(cors({
  origin: FRONTEND_ORIGIN,
}));

// create MySQL pool
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

// Utility: create JWT
function createToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Middleware: authenticate token
async function authenticateToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authorization token required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: require role
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden: insufficient role' });
    next();
  };
}

/* ========== Validation Schemas ========== */
const signupSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('admin', 'student').optional().default('student'),
});
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});
const eventSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  description: Joi.string().min(10).required(),
  date: Joi.date().iso().required(),
  time: Joi.string().pattern(/^\\d{2}:\\d{2}(:\\d{2})?$/).required(),
  location: Joi.string().min(3).max(255).required(),
  category: Joi.string().min(1).max(100).required(),
  maxParticipants: Joi.number().integer().min(1).max(100000).required(),
  imageUrl: Joi.string().uri().allow('', null),
  status: Joi.string().valid('upcoming', 'past').required(),
});

/* ========== Auth Routes ========== */

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { error, value } = signupSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

    const { name, email, password, role } = value;

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (rows.length) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      const password_hash = await bcrypt.hash(password, 10);
      const [result] = await conn.execute(
        'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, email, password_hash, role]
      );

      const userId = result.insertId;
      const user = { id: userId, name, email, role };
      const token = createToken(user);

      res.status(201).json({ success: true, token, user });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

    const { email, password } = value;
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [email]);
      if (!rows.length) return res.status(400).json({ error: 'Invalid email or password' });

      const userRow = rows[0];
      const match = await bcrypt.compare(password, userRow.password_hash);
      if (!match) return res.status(400).json({ error: 'Invalid email or password' });

      const user = { id: userRow.id, name: userRow.name, email: userRow.email, role: userRow.role };
      const token = createToken(user);
      res.json({ success: true, token, user });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ========== Events Routes ========== */

app.get('/api/events', async (req, res) => {
  try {
    const { search = '', category, status, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      where += ' AND category = ?';
      params.push(category);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }

    const sqlCount = `SELECT COUNT(*) as cnt FROM events ${where}`;
    const [countRows] = await pool.execute(sqlCount, params);
    const total = countRows[0].cnt;

    const sql = `SELECT * FROM events ${where} ORDER BY date ASC, time ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    const [rows] = await pool.execute(sql, params);

    res.json({ success: true, data: rows, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Get events error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get event by id error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin-only: Create event
app.post('/api/events', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { error, value } = eventSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

    const {
      title, description, date, time, location, category, maxParticipants, imageUrl = '', status,
    } = value;

    const [result] = await pool.execute(
      `INSERT INTO events (title, description, date, time, location, category, max_participants, image_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, date, time, location, category, maxParticipants, imageUrl, status]
    );

    const insertedId = result.insertId;
    const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [insertedId]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Create event error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin-only: Update event
app.put('/api/events/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = eventSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

    const {
      title, description, date, time, location, category, maxParticipants, imageUrl = '', status,
    } = value;

    const [result] = await pool.execute(
      `UPDATE events SET title=?, description=?, date=?, time=?, location=?, category=?, max_participants=?, image_url=?, status=?
       WHERE id=?`,
      [title, description, date, time, location, category, maxParticipants, imageUrl, status, id]
    );

    const [rows] = await pool.execute('SELECT * FROM events WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Update event error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin-only: Delete event
app.delete('/api/events/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM events WHERE id = ?', [id]);
    res.json({ success: true, message: 'Event deleted (if existed)' });
  } catch (err) {
    console.error('Delete event error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ========== Registrations (Student actions) ========== */

app.post('/api/events/:id/register', authenticateToken, async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.id;

    if (req.user.role === 'admin') return res.status(403).json({ error: 'Admins cannot register for events' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [eventRows] = await conn.execute('SELECT id, max_participants, registered_count, status FROM events WHERE id = ? FOR UPDATE', [eventId]);
      if (!eventRows.length) {
        await conn.rollback();
        return res.status(404).json({ error: 'Event not found' });
      }
      const event = eventRows[0];

      if (event.status === 'past') {
        await conn.rollback();
        return res.status(400).json({ error: 'Cannot register for past events' });
      }

      if (event.registered_count >= event.max_participants) {
        await conn.rollback();
        return res.status(400).json({ error: 'Event is full' });
      }

      const [existsRows] = await conn.execute('SELECT id FROM registrations WHERE user_id = ? AND event_id = ?', [userId, eventId]);
      if (existsRows.length) {
        await conn.rollback();
        return res.status(400).json({ error: 'User already registered' });
      }

      await conn.execute('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)', [userId, eventId]);
      await conn.execute('UPDATE events SET registered_count = registered_count + 1 WHERE id = ?', [eventId]);

      await conn.commit();
      res.json({ success: true, message: 'Registered successfully' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Register error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/events/:id/unregister', authenticateToken, async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.id;

    if (req.user.role === 'admin') return res.status(403).json({ error: 'Admins cannot unregister (they cannot register)' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [regRows] = await conn.execute('SELECT id FROM registrations WHERE user_id = ? AND event_id = ? FOR UPDATE', [userId, eventId]);
      if (!regRows.length) {
        await conn.rollback();
        return res.status(400).json({ error: 'Not registered for this event' });
      }

      await conn.execute('DELETE FROM registrations WHERE user_id = ? AND event_id = ?', [userId, eventId]);
      await conn.execute('UPDATE events SET registered_count = GREATEST(registered_count - 1, 0) WHERE id = ?', [eventId]);

      await conn.commit();
      res.json({ success: true, message: 'Unregistered successfully' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Unregister error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ========== User / Admin helpers ========== */

app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get me error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id/registrations', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'admin' && parseInt(req.user.id) !== parseInt(id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await pool.execute(
      `SELECT r.id, r.created_at, e.id AS event_id, e.title, e.date, e.time, e.location
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       WHERE r.user_id = ? ORDER BY r.created_at DESC`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get user registrations error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/events/:id/registrations', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT r.id, r.created_at, u.id AS user_id, u.name, u.email
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ? ORDER BY r.created_at DESC`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get event registrations error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ========== Utility endpoints (development) ========== */

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* ========== Ensure default admin account on startup ========== */

async function ensureDefaultAdmin() {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
      if (rows.length) {
        console.log('Default admin already exists:', ADMIN_EMAIL);
        return;
      }
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await conn.execute('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', ['Admin', ADMIN_EMAIL, hashed, 'admin']);
      console.log('Created default admin:', ADMIN_EMAIL);
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Error ensuring default admin', err);
  }
}

/* ========== Start server ========== */

const start = async () => {
  // try a simple DB query to validate connection
  try {
    await pool.query('SELECT 1');
    console.log('Connected to MySQL');
  } catch (err) {
    console.error('Unable to connect to MySQL. Make sure the DB is created and credentials are correct.');
    console.error(err);
  }

  await ensureDefaultAdmin();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();
