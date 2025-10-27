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

## Clúster Kind (3 nodos)

- Crear cluster
```
kind create cluster --name finanzas --config kind-config.yaml
kubectl cluster-info --context kind-finanzas
```
- Preparar imagenes
```
# Backend
docker build -t leslym03/finanzas-backend:latest ./backend
# Frontend
docker build -t leslym03/finanzas-frontend:latest ./frontend
# Cargar imágenes en Kind
kind load docker-image leslym03/finanzas-backend:latest --name finanzas
kind load docker-image leslym03/finanzas-frontend:latest --name finanzas
```
```
docker build -t leslym03/finanzas-frontend:latest \
  --build-arg VITE_API_URL=http://localhost:3001/api ./frontend
docker push leslym03/finanzas-backend:latest
docker push leslym03/finanzas-frontend:latest
kubectl rollout restart deployment frontend

kubectl delete pod -l app=finanzas-backend
kubectl delete pod -l app=finanzas-frontend
kubectl get pods

kubectl get svc frontend-svc
kubectl port-forward svc/frontend-svc 30739:80 

kubectl get svc backend-svc
kubectl port-forward svc/backend-svc 3001:31431
http://localhost:31431/api/transactions
```




- Storage provisioner para Kind (local-path)
```
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/master/deploy/local-path-storage.yaml
kubectl patch storageclass local-path -p '{"metadata": {"annotations": {"storageclass.kubernetes.io/is-default-class":"true"}}}'

```
- Metrics Server para HPA
```
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# esperar un minuto y verificar:
kubectl get deployment metrics-server -n kube-system
kubectl top nodes
kubectl top pods
```

Para acceder desde tu máquina local, puedes hacer kubectl port-forward svc/frontend-svc 8080:80 y abrir http://localhost:8080.


### Despliege

```
kubectl apply -f k8s/mongo-statefulset.yaml
# espera a que mongo-0 esté Running
kubectl rollout status statefulset/mongo -w

# crear el configmap+job que ejecuta tu init
kubectl apply -f k8s/mongo-init-job.yaml
# esperar que job termine
kubectl get jobs
kubectl logs job/mongo-init-job -n default

# desplegar backend/frontend
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml

# instalar metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# desplegar cAdvisor
kubectl apply -f k8s/cadvisor-daemonset.yaml

# HPA
kubectl apply -f k8s/backend-hpa.yaml
```

```
kubectl get pods -o wide
kubectl get svc
kubectl get pvc
kubectl get hpa
kubectl top pods
```

```
# Para ver frontend desde tu PC:
kubectl port-forward svc/frontend-svc 8080:80
# abre http://localhost:8080
```

### Pruebas
#### Persistencia de datos (volúmenes)
- Muestra colecciones para confirmar datos:
```
# forward para mongosh
kubectl port-forward statefulset/mongo 27017:27017 &  # o usar kubectl exec al pod
mongosh --host 127.0.0.1 --port 27017 finanzas
db.transactions.find().pretty()
```

- Borrar/eliminar el pod de Mongo y demostrar que los datos permanecen:
```
kubectl delete pod mongo-0
# Esperar que StatefulSet recree mongo-0 o mongo-1 (depende)
kubectl get pods
# luego volver a consultar y mostrar que los datos siguen
```
Explicación: el PersistentVolumeClaim almacena datos fuera del ciclo de vida del pod, por eso los datos no se pierden.

#### Escalabilidad (HPA)
Ver HPA:
```
kubectl get hpa backend-hpa
```

Instala hey (o usa ab) y genera carga hacia backend:
```
# en otra terminal
hey -n 2000 -c 100 http://localhost:3001/api/transactions
```

Observa que kubectl get hpa y kubectl get deployment backend muestran más réplicas apareciendo; también kubectl top pods muestra uso de CPU.

Explicación: HPA usa métricas (Metrics Server) para decidir si escalar; esto demuestra escalado horizontal automático.

#### Métricas y observabilidad
- Abre cAdvisor (puedes exponer el puerto de uno de los pods cadvisor) y muestra métricas por contenedor.

- kubectl top pods + kubectl top nodes.

### ¿Porque 2 herramientas?
- **Metrics Server:** necesario para habilitar HPA (Horizontal Pod Autoscaler). Permite recolectar métricas de CPU/memoria a nivel de pod, que HPA usa para tomar decisiones de escalado automático. Esta idea entra en la línea de “usar métricas de cgroups y contenedores para autoscaling” discutida en el artículo. 

- **cAdvisor:** herramienta clásica para recolectar métricas a nivel de contenedor (CPU, memoria, I/O). El artículo original menciona cAdvisor como ejemplo de herramienta que permite registrar y usar métricas genéricas para autoscaling y monitoreo. Usándola demuestras observabilidad y que entiendes la conexión entre métricas y escalado. 


## Pulumi y AWS

```
mkdir pulumi-eks-autoscale
cd pulumi-eks-autoscale
npm init -y
npm install @pulumi/pulumi @pulumi/aws @pulumi/eks @pulumi/docker @pulumi/kubernetes @pulumi/awsx typescript
pulumi new aws-typescript   # sigue prompts (o pulumi stack init)








pulumi stack select dev
pulumi config set aws:region us-east-1 
pulumi up --yes

```

### Variables 
```
REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BACKEND_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/finanzas-backend:dev"
FRONTEND_REPO="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/finanzas-frontend:dev"


echo $REGION
echo $ACCOUNT_ID
echo $FRONTEND_REPO
echo $BACKEND_REPO
```

### Build
```
cd ../finanzas-personales/backend
docker build -t finanzas-backend:dev .
docker tag finanzas-backend:dev $BACKEND_REPO
docker push $BACKEND_REPO

cd ../finanzas-personales/frontend
docker build -t finanzas-frontend:dev .
docker tag finanzas-frontend:dev $FRONTEND_REPO
docker push $FRONTEND_REPO



pulumi config set backendImage $BACKEND_IMAGE --stack dev
pulumi config set frontendImage $FRONTEND_IMAGE --stack dev
pulumi up --yes

```



