require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

// ─── DB Pool — uses DATABASE_URL env var (Render provides this automatically) ───
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Render Postgres
});

const DOCTOR_USERNAME = process.env.DOCTOR_USERNAME || "doctor";
const DOCTOR_PASSWORD = process.env.DOCTOR_PASSWORD || "doctor";

// Startup connection test + create tables if not exist
async function setup() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id       SERIAL PRIMARY KEY,
        name     VARCHAR(100) NOT NULL,
        username VARCHAR(50)  NOT NULL UNIQUE,
        password VARCHAR(100) NOT NULL,
        phone    VARCHAR(20)
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        appointment_id SERIAL PRIMARY KEY,
        name           VARCHAR(100),
        age            INTEGER,
        treatment      VARCHAR(200),
        visit_date     TIMESTAMP,
        phone          VARCHAR(15),
        booked_on      DATE DEFAULT CURRENT_DATE
      );
    `);
    console.log("✅ PostgreSQL connected & tables ready");
  } catch (err) {
    console.error("❌ DB SETUP FAILED:", err);
  }
}
setup();

// ───────────────────────────────────────────────
// POST /api/register
// ───────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { name, username, password, phone } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ success: false, message: "All fields required." });
  }

  try {
    const check = await pool.query(
      `SELECT COUNT(*) FROM patients WHERE username = $1`,
      [username]
    );
    if (parseInt(check.rows[0].count) > 0) {
      return res.status(409).json({ success: false, message: "Username already taken." });
    }

    await pool.query(
      `INSERT INTO patients (name, username, password, phone) VALUES ($1, $2, $3, $4)`,
      [name, username, password, phone || null]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Register error:", err.message);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

// ───────────────────────────────────────────────
// POST /api/login
// ───────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  const { username, password, role } = req.body;

  if (role === "doctor") {
    if (username === DOCTOR_USERNAME && password === DOCTOR_PASSWORD) {
      return res.json({ success: true, role: "doctor" });
    }
    return res.status(401).json({ success: false, message: "Invalid doctor credentials" });
  }

  try {
    const result = await pool.query(
      `SELECT name FROM patients WHERE username = $1 AND password = $2`,
      [username, password]
    );
    if (result.rows.length > 0) {
      return res.json({ success: true, role: "patient", name: result.rows[0].name });
    }
    res.status(401).json({ success: false, message: "Invalid username or password" });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ success: false, message: "Server error: " + err.message });
  }
});

// ───────────────────────────────────────────────
// POST /api/appointments
// ───────────────────────────────────────────────
app.post("/api/appointments", async (req, res) => {
  const { name, age, treatment, date, phone } = req.body;
  if (!name || !age || !treatment || !date || !phone) {
    return res.status(400).send("Missing required fields.");
  }

  try {
    await pool.query(
      `INSERT INTO appointments (name, age, treatment, visit_date, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, parseInt(age), treatment, date, phone]
    );
    res.status(200).send("Appointment saved.");
  } catch (err) {
    console.error("❌ Insert Error:", err.message);
    res.status(500).send("Error: " + err.message);
  }
});

// ───────────────────────────────────────────────
// GET /api/appointments
// ───────────────────────────────────────────────
app.get("/api/appointments", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT name, age, treatment, visit_date, phone, booked_on
       FROM appointments
       ORDER BY appointment_id DESC`
    );

    const appointments = result.rows.map(row => ({
      name:       row.name,
      age:        row.age,
      treatment:  row.treatment,
      visit_date: row.visit_date,
      phone:      row.phone,
      booked_on:  row.booked_on
    }));

    res.json(appointments);
  } catch (err) {
    console.error("❌ Fetch appointments error:", err.message);
    res.status(500).json([]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});