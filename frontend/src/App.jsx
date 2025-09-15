import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import CategoriesManager from './CategoriesManager';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);

  const [categories, setCategories] = useState({ income: [], expense: [] });

  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'expense',
    category: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const [editingId, setEditingId] = useState(null);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  // Cargar transacciones, balance y categorías
  useEffect(() => {
    fetchTransactions();
    fetchBalance();
    fetchCategories('income');
    fetchCategories('expense');
  }, []);

  // Refrescar categorías (para pasar a CategoriesManager)
  const refreshCategories = async () => {
    await fetchCategories('income');
    await fetchCategories('expense');
  };

  const fetchTransactions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/transactions`);
      setTransactions(res.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchBalance = async () => {
    try {
      const res = await axios.get(`${API_BASE}/transactions/balance`);
      setBalance(res.data.balance);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  const fetchCategories = async (type) => {
    try {
      const res = await axios.get(`${API_BASE}/categories/${type}`);
      setCategories(prev => ({ ...prev, [type]: res.data }));
      // Si el tipo actual coincide y no hay categoría o la actual no existe, selecciona la primera
      if (form.type === type && (!form.category || !res.data.find(c => c.name === form.category))) {
        setForm(prev => ({
          ...prev,
          category: res.data.length > 0 ? res.data[0].name : '',
        }));
      }
    } catch (error) {
      console.error(`Error fetching ${type} categories:`, error);
    }
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'type' ? { category: '' } : {}),
    }));
  };

  // Cambiar tipo con botones toggle
  const handleTypeToggle = (type) => {
    setForm(prev => ({
      ...prev,
      type,
      category: '', // resetear categoría para forzar selección nueva
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (
      !form.description.trim() ||
      !form.amount ||
      isNaN(form.amount) ||
      Number(form.amount) <= 0 ||
      !form.category
    ) {
      alert('Por favor completa todos los campos correctamente.');
      return;
    }

    try {
      if (editingId) {
        await axios.put(`${API_BASE}/transactions/${editingId}`, {
          ...form,
          amount: parseFloat(form.amount),
        });
        setEditingId(null);
      } else {
        await axios.post(`${API_BASE}/transactions`, {
          ...form,
          amount: parseFloat(form.amount),
        });
      }
      setForm({
        description: '',
        amount: '',
        type: 'expense',
        category: '',
        date: new Date().toISOString().slice(0, 10),
      });
      fetchTransactions();
      fetchBalance();
      refreshCategories();
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  };

  const handleDelete = async id => {
    if (!window.confirm('¿Seguro que quieres eliminar esta transacción?')) return;
    try {
      await axios.delete(`${API_BASE}/transactions/${id}`);
      fetchTransactions();
      fetchBalance();
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const handleEdit = (transaction) => {
    setForm({
      description: transaction.description,
      amount: transaction.amount.toString(),
      type: transaction.type,
      category: transaction.category,
      date: new Date(transaction.date).toISOString().slice(0, 10),
    });
    setEditingId(transaction._id);
  };

  const currentCategories = categories[form.type] || [];

  return (
    <div className="container">
      <h1>Gestor de Finanzas Personales</h1>
      <h2 className="balance">
        Balance:{' '}
        <span className={balance >= 0 ? 'positive' : 'negative'}>
          ${balance.toFixed(2)}
        </span>
      </h2>

      {/* Botones toggle para tipo */}
      <div className="type-buttons" style={{ marginBottom: 15 }}>
        <button
          type="button"
          onClick={() => handleTypeToggle('expense')}
          className={`type-button ${form.type === 'expense' ? 'active-expense' : ''}`}
        >
          Gasto
        </button>
        <button
          type="button"
          onClick={() => handleTypeToggle('income')}
          className={`type-button ${form.type === 'income' ? 'active-income' : ''}`}
        >
          Ingreso
        </button>
      </div>

      <form onSubmit={handleSubmit} className="form">
        <input
          name="description"
          placeholder="Descripción"
          value={form.description}
          onChange={handleChange}
          required
          className="input"
        />
        <input
          name="amount"
          type="number"
          step="0.01"
          placeholder="Monto"
          value={form.amount}
          onChange={handleChange}
          required
          className="input"
        />

        <select
          name="category"
          value={form.category}
          onChange={handleChange}
          required
          className="input"
        >
          <option value="" disabled>
            Selecciona categoría
          </option>
          {currentCategories.map(cat => (
            <option key={cat._id} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>

        <button
        onClick={() => setShowCategoriesModal(true)}
        type="button" class="btn btn-outline-primary"
      >
        ✏️
      </button>

        <input
          name="date"
          type="date"
          value={form.date}
          onChange={handleChange}
          required
          className="input"
        />

        <button type="submit" class="btn btn-primary" className="btn-submit">
          {editingId ? 'Actualizar Transacción' : 'Agregar Transacción'}
        </button>
      </form>

      

      {transactions.length === 0 ? (
        <p className="no-transactions">No hay transacciones registradas.</p>
      ) : (
        <div className="transactions-container">
          <table className="table">
            <thead class="table-dark">
              <tr>
                <th>Descripción</th>
                <th>Monto</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t._id}>
                  <td>{t.description}</td>
                  <td className={t.type === 'income' ? 'income' : 'expense'}>
                    {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                  </td>
                  <td>{t.type === 'income' ? 'Ingreso' : 'Gasto'}</td>
                  <td>{t.category}</td>
                  <td>{new Date(t.date).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => handleEdit(t)}
                      className="btn-edit" class="btn btn-outline-primary"
                      aria-label={`Editar transacción ${t.description}`}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(t._id)}
                      className="btn-delete" class="btn btn-outline-danger"
                      aria-label={`Eliminar transacción ${t.description}`}
                    >
                      ❌
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Lista para móvil */}
          <ul className="transactions-list">
            {transactions.map(t => (
              <li key={t._id} className="transaction-item">
                <div>
                  <strong>{t.description}</strong>{' '}
                  <span className={t.type === 'income' ? 'income' : 'expense'}>
                    {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                  </span>
                </div>
                <div>
                  <small>
                    {t.category} | {new Date(t.date).toLocaleDateString()}
                  </small>
                </div>
                <div>
                  <button
                    onClick={() => handleEdit(t)}
                    className="btn-edit"
                    aria-label={`Editar transacción ${t.description}`}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(t._id)}
                    className="btn-delete"
                    aria-label={`Eliminar transacción ${t.description}`}
                  >
                    &times;
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modal para administrar categorías */}
      {showCategoriesModal && (
        <div className="modal-overlay" onClick={() => setShowCategoriesModal(false)}>
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCategoriesModal(false)}
              className="modal-close-button"
              aria-label="Cerrar ventana de administración de categorías"
            >
              &times;
            </button>
            {/* Pasamos refreshCategories para que CategoriesManager notifique cambios */}
            <CategoriesManager onCategoriesChange={refreshCategories} />
          </div>
        </div>
      )}
    </div>
  );
}