const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
const port = 80;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================
// CREDENCIALES
// =========================================================
const dbHost = 'simi-db.ca6z0npkv59y.us-east-1.rds.amazonaws.com';
const dbUser = 'postgres';
const dbPassword = 'Inacap.2030';
const dbName = 'simi_erp_db';
const jwtSecret = 'simi_clave_secreta_mfa';
const emailUser = 'fran.vidal.bernales@gmail.com';
const emailPass = 'tu_clave_de_aplicacion';
// =========================================================

// Configuración de conexión a AWS RDS usando las variables de arriba
const pool = new Pool({
  user: dbUser,
  host: dbHost,
  database: dbName,
  password: dbPassword,
  port: 5432,
  ssl: { rejectUnauthorized: false } // Obligatorio para AWS RDS
});

// Configuración del correo (Nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailUser,
    pass: emailPass
  }
});

// PASO 1: Validar credenciales y enviar correo MFA
app.post('/api/login/step1', async (req, res) => {
  const { username, password } = req.body;
  try {
    const query = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
    if (query.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
    
    const usuario = query.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) return res.status(401).json({ error: 'Contraseña incorrecta' });

    // Generar código MFA de 6 dígitos
    const mfaCode = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query('UPDATE usuarios SET mfa_code = $1 WHERE username = $2', [mfaCode, username]);

    // Enviar correo
    await transporter.sendMail({
      from: '"Seguridad SIMI" <' + emailUser + '>',
      to: usuario.email,
      subject: 'Tu código de acceso MFA - Farmacias SIMI',
      text: `Hola ${username},\n\nTu código de verificación de 6 dígitos es: ${mfaCode}\n\nIngrésalo en el portal para acceder al ERP.`
    });

    res.json({ message: 'Código enviado con éxito' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PASO 2: Validar el PIN y generar Token
app.post('/api/login/step2', async (req, res) => {
  const { username, password, mfaToken } = req.body;
  try {
    const query = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
    if (query.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
    
    const usuario = query.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    
    if (passwordValida && usuario.mfa_code === mfaToken) {
      await pool.query('UPDATE usuarios SET mfa_code = NULL WHERE username = $1', [username]);
      const token = jwt.sign({ user: username }, jwtSecret, { expiresIn: '1h' });
      res.json({ token });
    } else {
      res.status(401).json({ error: 'Código MFA inválido o expirado' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en la validación' });
  }
});

// Middleware JWT
const verificarToken = (req, res, next) => {
  const bearerHeader = req.headers['authorization'];
  if (typeof bearerHeader !== 'undefined') {
    jwt.verify(bearerHeader.split(' ')[1], jwtSecret, (err, authData) => {
      if (err) return res.sendStatus(403);
      req.authData = authData;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};

// Endpoints del ERP
app.get('/api/productos', verificarToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).send('Error BD'); }
});

app.post('/api/productos', verificarToken, async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [nombre, descripcion, precio, stock]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).send('Error BD'); }
});

app.listen(port, () => console.log(`Frontend ERP MFA Real en puerto ${port}`));