import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function CategoriesManager() {
  const [type, setType] = useState('expense'); // 'expense' o 'income'
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetchCategories(type);
  }, [type]);

  const fetchCategories = async (categoryType) => {
    try {
      const res = await axios.get(`${API_BASE}/categories/${categoryType}`);
      setCategories(res.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert('El nombre de la categoría no puede estar vacío.');
      return;
    }
    try {
      await axios.post(`${API_BASE}/categories`, { name, type });
      setNewCategoryName('');
      await fetchCategories(type);
       if (onCategoriesChange) await onCategoriesChange(); // notifica a App.jsx para refrescar categorías
    } catch (error) {
      alert(error.response?.data?.message || 'Error al agregar categoría');
      console.error(error);
    }
  };

  const handleEditClick = (cat) => {
    setEditingId(cat._id);
    setEditingName(cat.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async () => {
    const name = editingName.trim();
    if (!name) {
      alert('El nombre de la categoría no puede estar vacío.');
      return;
    }
    try {
      await axios.put(`${API_BASE}/categories/${editingId}`, { name, type });
      setEditingId(null);
      setEditingName('');
      await fetchCategories(type);
       if (onCategoriesChange) onCategoriesChange(); // <-- Notificar cambio
    } catch (error) {
      alert(error.response?.data?.message || 'Error al actualizar categoría');
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que quieres eliminar esta categoría?')) return;
    try {
      await axios.delete(`${API_BASE}/categories/${id}`);
      await fetchCategories(type);
       if (onCategoriesChange) onCategoriesChange(); // <-- Notificar cambio
    } catch (error) {
      alert('Error al eliminar categoría');
      console.error(error);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 20, background: '#fff', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Administrar Categorías</h2>

      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <label>
          <input
            type="radio"
            name="type"
            value="expense"
            checked={type === 'expense'}
            onChange={() => setType('expense')}
          />{' '}
          Gasto
        </label>{' '}
        <label>
          <input
            type="radio"
            name="type"
            value="income"
            checked={type === 'income'}
            onChange={() => setType('income')}
          />{' '}
          Ingreso
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          placeholder={`Nueva categoría de ${type === 'expense' ? 'gasto' : 'ingreso'}`}
          value={newCategoryName}
          onChange={e => setNewCategoryName(e.target.value)}
          style={{ flex: 1, padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <button onClick={handleAddCategory} style={{ padding: '8px 16px', fontSize: 16, borderRadius: 4, backgroundColor: '#4caf50', color: 'white', border: 'none', cursor: 'pointer' }}>
          Agregar
        </button>
      </div>

      {categories.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#777' }}>No hay categorías para {type === 'expense' ? 'gastos' : 'ingresos'}.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {categories.map(cat => (
            <li key={cat._id} style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              {editingId === cat._id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    style={{ flex: 1, padding: 6, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
                  />
                  <button onClick={handleSaveEdit} style={{ marginLeft: 8, padding: '6px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    Guardar
                  </button>
                  <button onClick={handleCancelEdit} style={{ marginLeft: 8, padding: '6px 12px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1 }}>{cat.name}</span>
                  <button onClick={() => handleEditClick(cat)} style={{ marginLeft: 8, padding: '6px 12px', backgroundColor: '#2980b9', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    Editar
                  </button>
                  <button onClick={() => handleDelete(cat._id)} style={{ marginLeft: 8, padding: '6px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    Eliminar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}