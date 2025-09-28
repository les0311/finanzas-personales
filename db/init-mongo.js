// db/init-mongo.js
db = db.getSiblingDB('finanzas'); // crea o selecciona la BD "finanzas"

// Crear categorías iniciales
db.categories.insertMany([
  { name: "Salario", type: "income" },
  { name: "Venta", type: "income" },
  { name: "Comida", type: "expense" },
  { name: "Transporte", type: "expense" },
  { name: "Educación", type: "expense" }
]);

// Crear algunas transacciones de ejemplo
db.transactions.insertMany([
  {
    description: "Pago mensual",
    amount: 1500,
    type: "income",
    category: "Salario",
    date: new Date()
  },
  {
    description: "Almuerzo",
    amount: 20,
    type: "expense",
    category: "Comida",
    date: new Date()
  },
  {
    description: "Pasajes",
    amount: 10,
    type: "expense",
    category: "Transporte",
    date: new Date()
  }
]);

print("✅ Base de datos 'finanzas' inicializada con categorías y transacciones de ejemplo");
