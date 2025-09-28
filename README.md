# Finanzas Personales

Aplicación de **gestión de finanzas personales** usando **Docker Compose** para orquestar los servicios de:

- **Frontend**: React + Vite
- **Backend**: Node.js + Express + Mongoose
- **Base de datos**: MongoDB con script de inicialización (`db/init-mongo.js`)

### Requisitos previos

- Node.js >= 18
- npm >= 9
- Docker >= 20.x
- Docker Compose >= 1.29

## Acceder a la aplicación

- Frontend: http://localhost:5173
- Backend (API): http://localhost:3001/api
- Base de datos (MongoDB): localhost:27017


## Docker
```
docker-compose up --build
docker-compose down
docker rm -f frontend_finanzas
```

## Base Datos
```
docker exec -it mongodb_finanzas mongosh -u root -p password --authenticationDatabase admin
```

```
use finanzas
show collections
db.categories.find().pretty()
db.transactions.find().pretty()
```