require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');

const saludRoutes = require('./routes/salud');
const eventosRoutes = require('./routes/eventos');
const participantesRoutes = require('./routes/participantes');
const authRoutes = require('./routes/auth');
const saelistasRoutes = require('./routes/saelistas');
const habitacionesRoutes = require('./routes/habitaciones');
const financieroRoutes = require('./routes/financiero');
const usuariosRoutes = require('./routes/usuarios');

const app = express();

app.use(cors());
// Límite subido de 100kb (default de Express) a 2mb — el módulo de
// Saelistas manda la foto en base64 dentro del JSON, y aunque ya se
// comprime en el navegador antes de enviarse, el default es demasiado
// justo para eso.
app.use(express.json({ limit: '2mb' }));

// Rutas
app.use('/api', saludRoutes);
app.use('/api', eventosRoutes);
app.use('/api', participantesRoutes);
app.use('/api', authRoutes);
app.use('/api', saelistasRoutes);
app.use('/api', habitacionesRoutes);
app.use('/api', financieroRoutes);
app.use('/api', usuariosRoutes);

// Manejador de errores centralizado
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Evita que errores async no capturados tumben el proceso (Render free tier)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API SAEL escuchando en puerto ${PORT}`);
});
