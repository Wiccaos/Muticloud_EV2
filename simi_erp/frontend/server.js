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
const emailUser = 'mfa.eva3.multicloud@gmail.com';
const emailPass = 'ymve mous wkpx qoeo';
// =========================================================

// Configuración de conexión a AWS RDS
const pool = new Pool({
  user: dbUser,
  host: dbHost,
  database: dbName,
  password: dbPassword,
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

// Configuración del correo (Nodemailer)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailUser,
    pass: emailPass
  }
});

// Validar credenciales y enviar correo MFA
app.post('/api/login/step1', async (req, res) => {
  const { username, password } = req.body;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [POST] /api/login/step1 - Intento de acceso para usuario: ${username}`);
  
  try {
    const query = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
    if (query.rows.length === 0) {
      console.log(`[${timestamp}] [WARN] Usuario no encontrado: ${username}`);
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    const usuario = query.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      console.log(`[${timestamp}] [WARN] Contraseña incorrecta para usuario: ${username}`);
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Generar código MFA de 6 dígitos
    const mfaCode = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query('UPDATE usuarios SET mfa_code = $1 WHERE username = $2', [mfaCode, username]);
    console.log(`[${timestamp}] [INFO] Código MFA temporal almacenado en AWS RDS para: ${username}`);

    // Enviar correo
    await transporter.sendMail({
      from: '"Seguridad SIMI" <' + emailUser + '>',
      to: usuario.email,
      subject: 'Tu código de acceso MFA - Farmacias SIMI',
      text: `Hola ${username},\n\nTu código de verificación de 6 dígitos es: ${mfaCode}\n\nIngrésalo en el portal para acceder al ERP.`
    });
    console.log(`[${timestamp}] [SUCCESS] Correo MFA enviado exitosamente a: ${usuario.email}`);

    res.json({ message: 'Código enviado con éxito' });
  } catch (error) {
    console.error(`[${timestamp}] [ERROR] Error en Paso 1:`, error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Validar el PIN y generar Token
app.post('/api/login/step2', async (req, res) => {
  const { username, password, mfaToken } = req.body;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [POST] /api/login/step2 - Validando Token MFA para usuario: ${username}`);
  
  try {
    const query = await pool.query('SELECT * FROM usuarios WHERE username = $1', [username]);
    if (query.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
    
    const usuario = query.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    
    if (passwordValida && usuario.mfa_code === mfaToken) {
      await pool.query('UPDATE usuarios SET mfa_code = NULL WHERE username = $1', [username]);
      console.log(`[${timestamp}] [SUCCESS] Token coincidente. Registro temporal eliminado (OTP Seguro).`);
      
      const token = jwt.sign({ user: username }, jwtSecret, { expiresIn: '1h' });
      console.log(`[${timestamp}] [INFO] JWT firmado y emitido con éxito para: ${username}`);
      res.json({ token });
    } else {
      console.log(`[${timestamp}] [WARN] Token MFA inválido o expirado para: ${username}`);
      res.status(401).json({ error: 'Código MFA inválido o expirado' });
    }
  } catch (error) {
    console.error(`[${timestamp}] [ERROR] Error en Paso 2:`, error);
    res.status(500).json({ error: 'Error en la validación' });
  }
});

// Middleware JWT
const verificarToken = (req, res, next) => {
  const bearerHeader = req.headers['authorization'];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  if (typeof bearerHeader !== 'undefined') {
    jwt.verify(bearerHeader.split(' ')[1], jwtSecret, (err, authData) => {
      if (err) {
        console.log(`[${timestamp}] [AUTH ERROR] Token JWT inválido o expirado.`);
        return res.sendStatus(403);
      }
      req.authData = authData;
      next();
    });
  } else {
    console.log(`[${timestamp}] [AUTH ERROR] Intento de acceso sin Token JWT (No autorizado).`);
    res.sendStatus(401);
  }
};

// Endpoints del ERP
app.get('/api/productos', verificarToken, async (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [GET] /api/productos - Solicitud de inventario autorizada para: ${req.authData.user}`);
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    console.log(`[${timestamp}] [DB INFO] Se recuperaron ${result.rows.length} productos desde AWS RDS.`);
    res.json(result.rows);
  } catch (err) { 
    console.error(`[${timestamp}] [DB ERROR]`, err);
    res.status(500).send('Error BD'); 
  }
});

app.post('/api/productos', verificarToken, async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [POST] /api/productos - Añadiendo nuevo artículo: ${nombre}`);
  try {
    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [nombre, descripcion, precio, stock]
    );
    console.log(`[${timestamp}] [DB INFO] Producto registrado con ID #${result.rows[0].id} en RDS.`);
    res.status(201).json(result.rows[0]);
  } catch (err) { 
    console.error(`[${timestamp}] [DB ERROR]`, err);
    res.status(500).send('Error BD'); 
  }
});

app.listen(port, () => {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [INFO] Inicializando servidor ERP Farmacias SIMI...`);
  console.log(`[${timestamp}] [INFO] Frontend operativo y escuchando en el puerto ${port}`);
});