const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const app = express();
const port = 80;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de conexión dinámica (Local vs AWS RDS)
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'postgres',
  host: process.env.DB_HOST || 'db', 
  database: process.env.POSTGRES_DB || 'simi_erp_db',
  password: process.env.POSTGRES_PASSWORD || 'simi_pass123',
  port: 5432,
  // Si el host incluye 'rds.amazonaws.com' usa SSL, de lo contrario (local) es false
  ssl: process.env.DB_HOST && process.env.DB_HOST.includes('rds.amazonaws.com') 
        ? { rejectUnauthorized: false } 
        : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'simi_clave_secreta_mfa';

// ---------------------------------------------------------
// ENDPOINT DE AUTENTICACIÓN (MFA SIMULADO)
// ---------------------------------------------------------
app.post('/api/login', (req, res) => {
  const { username, password, mfaToken } = req.body;
  
  // Validación de Usuario, Contraseña y Token MFA
  if (username === 'admin' && password === 'admin123' && mfaToken === '123456') {
    // Generamos el token de acceso
    const token = jwt.sign({ user: username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Credenciales o código MFA inválidos' });
  }
});

// ---------------------------------------------------------
// ACCESO CONDICIONAL (Verificar Token)
// ---------------------------------------------------------
const verificarToken = (req, res, next) => {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader !== 'undefined') {
    const token = bearerHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, authData) => {
      if (err) return res.sendStatus(403); // Prohibido
      req.authData = authData;
      next();
    });
  } else {
    res.sendStatus(401); // No autorizado
  }
};

// ---------------------------------------------------------
// ENDPOINTS PROTEGIDOS DE PRODUCTOS
// ---------------------------------------------------------
app.get('/api/productos', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Error conectando a RDS');
  }
});

app.post('/api/productos', verificarToken, async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [nombre, descripcion, precio, stock]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).send('Error al insertar producto');
  }
});

app.listen(port, () => {
  console.log(`Frontend ERP protegido con MFA escuchando en el puerto ${port}`);
});