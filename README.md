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

## Docker

```
docker-compose up --build
docker-compose down
docker rm -f frontend_finanzas
```

### Acceder a la aplicación

- Frontend: http://localhost:5173
- Backend (API): http://localhost:3001/api
- Base de datos (MongoDB): localhost:27017

### Base Datos
```
docker exec -it mongodb_finanzas mongosh -u root -p password --authenticationDatabase admin
```

```
use finanzas
show collections
db.categories.find().pretty()
db.transactions.find().pretty()
```

## Prerrequisitos
```
# Pulumi CLI
pulumi version

# AWS CLI (autenticado)
aws sts get-caller-identity

# Docker (en ejecución)
docker info

# Kubectl
kubectl version --client
```

## Inicializacion
```
rm -rf node_modules
npm install
npm install @pulumi/pulumi @pulumi/aws @pulumi/eks @pulumi/docker @pulumi/kubernetes

pulumi stack select dev
pulumi config set aws:region us-east-1
pulumi config set aws:profile default
pulumi config set buildImages true
pulumi stack rm dev --force
pulumi stack init dev
pulumi refresh --yes


pulumi destroy --yes
pulumi up --yes


```