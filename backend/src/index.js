const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error conectando a MongoDB:', err));

// Esquema y modelo para transacciones
const transactionSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

// Esquema y modelo para categorías
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['income', 'expense'], required: true },
});

const Category = mongoose.model('Category', categorySchema);


// Rutas API

// Obtener todas las transacciones
app.get('/api/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Obtener balance total
app.get('/api/transactions/balance', async (req, res) => {
  try {
    const transactions = await Transaction.find();
    const balance = transactions.reduce((total, t) => {
      return t.type === 'income' ? total + t.amount : total - t.amount;
    }, 0);
    res.json({ balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Agregar transacción
app.post('/api/transactions', async (req, res) => {
  const { description, amount, type, category, date } = req.body;
  const transaction = new Transaction({ description, amount, type, category, date });
  try {
    const saved = await transaction.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Actualizar transacción
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(transaction);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Eliminar transacción
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await Transaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transacción eliminada' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Obtener categorías por tipo
app.get('/api/categories/:type', async (req, res) => {
  const { type } = req.params;
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: 'Tipo inválido' });
  }
  try {
    const categories = await Category.find({ type }).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Agregar categoría
app.post('/api/categories', async (req, res) => {
  const { name, type } = req.body;
  if (!name || !type || !['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: 'Datos inválidos' });
  }
  try {
    const exists = await Category.findOne({ name, type });
    if (exists) return res.status(400).json({ message: 'Categoría ya existe' });

    const category = new Category({ name, type });
    const saved = await category.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Modificar categoría
app.put('/api/categories/:id', async (req, res) => {
  const { name, type } = req.body;
  if (!name || !type || !['income', 'expense'].includes(type)) {
    return res.status(400).json({ message: 'Datos inválidos' });
  }
  try {
    const updated = await Category.findByIdAndUpdate(
      req.params.id,
      { name, type },
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Eliminar categoría
app.delete('/api/categories/:id', async (req, res) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: 'Categoría eliminada' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.listen(PORT,'0.0.0.0', () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});