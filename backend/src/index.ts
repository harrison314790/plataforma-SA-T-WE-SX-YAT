import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import rutas from './rutas/index.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', rutas);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => console.log(`API escuchando en puerto ${PORT}`));
