require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');

const saludRoutes = require('./routes/salud');
const eventosRoutes = require('./routes/eventos');
const participantesRoutes = require('./routes/participantes');

const app = express();

app.use(cors());
app.use(express.json());

// Rutas
app.use('/api', saludRoutes);
app.use('/api', eventosRoutes);
app.use('/api', participantesRoutes);

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
