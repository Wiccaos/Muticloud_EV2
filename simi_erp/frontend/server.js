const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 80;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de conexión a PostgreSQL
const pool = new Pool({
  user: process.env.POSTGRES_USER || 'simi_admin',
  host: 'db',
  database: process.env.POSTGRES_DB || 'simi_erp_db',
  password: process.env.POSTGRES_PASSWORD || 'simi_pass123',
  port: 5432,
});

// Endpoint REST - GET productos
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error en el servidor');
  }
});

// Endpoint REST - POST productos
app.post('/api/productos', async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [nombre, descripcion, precio, stock]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error al insertar producto');
  }
});

app.listen(port, () => {
  console.log(`Frontend ERP escuchando en el puerto ${port}`);
});