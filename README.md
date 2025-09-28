# Finanzas Personales

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