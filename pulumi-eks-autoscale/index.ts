import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as docker from "@pulumi/docker";
import * as k8s from "@pulumi/kubernetes";
import * as path from "path";

// -----------------------------
// Configuración base
// -----------------------------
const cfg = new pulumi.Config();
const stack = pulumi.getStack();
const appName = "finanzas";
const region = aws.config.region || cfg.get("awsRegion") || "us-east-1";
const k8sVersion = cfg.get("k8sVersion") || "1.29";

// Control de build de imágenes
const buildImages = cfg.getBoolean("buildImages") ?? true;

// -----------------------------
// ECR + Build de Imágenes
// -----------------------------
const ecrBackend = new aws.ecr.Repository(`${appName}-backend`);
const ecrFrontend = new aws.ecr.Repository(`${appName}-frontend`);
const ecrAuth = aws.ecr.getAuthorizationTokenOutput();

const registryServerFromRepo = (repo: aws.ecr.Repository) =>
  repo.repositoryUrl.apply(u => u.split("/")[0]);

const registryPassword = ecrAuth.authorizationToken.apply((tok): string => {
  const decoded = Buffer.from(tok, "base64").toString();
  const parts = decoded.split(":");
  return parts.length === 2 ? parts[1] : decoded;
});

const registryUsername = "AWS";

function buildAndPushImage(
  logicalName: string,
  contextDir: string,
  repo: aws.ecr.Repository
): pulumi.Output<string> {
  if (!buildImages) return pulumi.interpolate`${repo.repositoryUrl}:${stack}`;

  const image = new docker.Image(logicalName, {
    imageName: pulumi.interpolate`${repo.repositoryUrl}:${stack}`,
    build: {
      context: contextDir,
      platform: "linux/amd64",
    },
    registry: {
      server: registryServerFromRepo(repo),
      username: registryUsername,
      password: registryPassword,
    },
  });

  return image.imageName;
}

const frontendPath = path.join(__dirname, "..", "frontend");
const backendPath = path.join(__dirname, "..", "backend");

const backendImage = buildAndPushImage("backendImage", backendPath, ecrBackend);
const frontendImage = buildAndPushImage("frontendImage", frontendPath, ecrFrontend);

// --------------------
// IAM para EKS
// --------------------
const eksRole = new aws.iam.Role(`${appName}-eks-role`, {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: { Service: "eks.amazonaws.com" },
      Effect: "Allow",
    }],
  }),
});

[
  "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
  "arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
].forEach((policy, i) => {
  new aws.iam.RolePolicyAttachment(`${appName}-eks-role-policy-${i}`, {
    role: eksRole.name,
    policyArn: policy,
  });
});

// --------------------
// IAM para nodos EC2
// --------------------
const nodeRole = new aws.iam.Role(`${appName}-node-role`, {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Principal: { Service: "ec2.amazonaws.com" },
      Effect: "Allow",
    }],
  }),
});

[
  "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
].forEach((policy, i) => {
  new aws.iam.RolePolicyAttachment(`${appName}-node-policy-${i}`, {
    role: nodeRole.name,
    policyArn: policy,
  });
});

const nodeInstanceProfile = new aws.iam.InstanceProfile(`${appName}-instanceProfile`, {
  role: nodeRole.name,
});



// -----------------------------
// Red (VPC + Subnets)
// -----------------------------
const vpc = new aws.ec2.Vpc("eks-vpc", {
  cidrBlock: "10.100.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { Name: `${appName}-vpc` },
});

const igw = new aws.ec2.InternetGateway("eks-igw", { vpcId: vpc.id });
const rtable = new aws.ec2.RouteTable("eks-rt", { vpcId: vpc.id });

new aws.ec2.Route("eks-route", {
  routeTableId: rtable.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: igw.id,
});

const subnetA = new aws.ec2.Subnet("eks-subnet-a", {
  vpcId: vpc.id,
  cidrBlock: "10.100.1.0/24",
  availabilityZone: `${region}a`,
  mapPublicIpOnLaunch: true,
});

const subnetB = new aws.ec2.Subnet("eks-subnet-b", {
  vpcId: vpc.id,
  cidrBlock: "10.100.2.0/24",
  availabilityZone: `${region}b`,
  mapPublicIpOnLaunch: true,
});

new aws.ec2.RouteTableAssociation("rta-a", { subnetId: subnetA.id, routeTableId: rtable.id });
new aws.ec2.RouteTableAssociation("rta-b", { subnetId: subnetB.id, routeTableId: rtable.id });

// -----------------------------
// EKS Cluster
// -----------------------------
const cluster = new eks.Cluster(`${appName}-eks`, {
  vpcId: vpc.id,
    subnetIds: [subnetA.id, subnetB.id],
    instanceRole: nodeRole,
    skipDefaultNodeGroup: true, // evita el error
});

new aws.eks.NodeGroup(`${appName}-nodegroup`, {
    clusterName: cluster.eksCluster.name,
    nodeRoleArn: nodeRole.arn,
    subnetIds: [subnetA.id, subnetB.id],
    scalingConfig: {
        desiredSize: 2,
        minSize: 1,
        maxSize: 3,
    },
    instanceTypes: ["t3.micro"],
});



const k8sProvider = new k8s.Provider("k8s-provider", { kubeconfig: cluster.kubeconfig });

// -----------------------------
// metrics-server (para HPA)
// -----------------------------
const metricsServer = new k8s.helm.v3.Chart(
  "metrics-server",
  {
    chart: "metrics-server",
    fetchOpts: { repo: "https://kubernetes-sigs.github.io/metrics-server/" },
    namespace: "kube-system",
  },
  { provider: k8sProvider }
);

// -----------------------------
// Namespace principal
// -----------------------------
const ns = new k8s.core.v1.Namespace(
  appName,
  {
    metadata: { name: appName },
  },
  { provider: k8sProvider }
);

// -----------------------------
// MongoDB StatefulSet + Service
// -----------------------------
const mongoLabels = { app: "finanzas-mongo" };

const mongoService = new k8s.core.v1.Service(
  "mongo-headless",
  {
    metadata: { namespace: ns.metadata.name, name: "mongo-headless" },
    spec: {
      ports: [{ port: 27017, name: "mongodb" }],
      clusterIP: "None",
      selector: mongoLabels,
    },
  },
  { provider: k8sProvider }
);

const mongoStatefulSet = new k8s.apps.v1.StatefulSet(
  "mongo",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      serviceName: "mongo-headless",
      replicas: 1,
      selector: { matchLabels: mongoLabels },
      template: {
        metadata: { labels: mongoLabels },
        spec: {
          containers: [
            {
              name: "mongo",
              image: "mongo:6.0",
              ports: [{ containerPort: 27017 }],
              env: [{ name: "MONGO_INITDB_DATABASE", value: "finanzas" }],
              volumeMounts: [{ name: "mongo-data", mountPath: "/data/db" }],
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: "mongo-data" },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: { requests: { storage: "5Gi" } },
          },
        },
      ],
    },
  },
  { provider: k8sProvider }
);

// -----------------------------
// Mongo init ConfigMap + Job
// -----------------------------
const initScript = new k8s.core.v1.ConfigMap(
  "mongo-init-script",
  {
    metadata: { namespace: ns.metadata.name },
    data: {
      "init-mongo.js": `
db = db.getSiblingDB("finanzas");

db.categories.insertMany([
  { name: "Salario", type: "income" },
  { name: "Venta", type: "income" },
  { name: "Comida", type: "expense" },
  { name: "Transporte", type: "expense" },
  { name: "Educación", type: "expense" }
]);

db.transactions.insertMany([
  { description: "Pago mensual", amount: 1500, type: "income", category: "Salario", date: new Date() },
  { description: "Almuerzo", amount: 20, type: "expense", category: "Comida", date: new Date() },
  { description: "Pasajes", amount: 10, type: "expense", category: "Transporte", date: new Date() }
]);

print("✅ Base de datos 'finanzas' inicializada");
`,
    },
  },
  { provider: k8sProvider }
);

const mongoInitJob = new k8s.batch.v1.Job(
  "mongo-init-job",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      template: {
        spec: {
          restartPolicy: "OnFailure",
          containers: [
            {
              name: "mongo-init",
              image: "mongo:6.0",
              command: [
                "sh",
                "-c",
                "sleep 5; mongosh --host mongo-0.mongo-headless:27017 /docker-entrypoint-initdb.d/init-mongo.js || true",
              ],
              volumeMounts: [{ name: "init-script", mountPath: "/docker-entrypoint-initdb.d" }],
            },
          ],
          volumes: [{ name: "init-script", configMap: { name: initScript.metadata.name } }],
        },
      },
    },
  },
  { provider: k8sProvider, dependsOn: [mongoStatefulSet] }
);

// -----------------------------
// Backend
// -----------------------------
const backendLabels = { app: "finanzas-backend" };

const backendDeployment = new k8s.apps.v1.Deployment(
  "backend",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      selector: { matchLabels: backendLabels },
      replicas: 1,
      template: {
        metadata: { labels: backendLabels },
        spec: {
          containers: [
            {
              name: "backend",
              image: backendImage,
              ports: [{ containerPort: 3001 }],
              env: [
                { name: "PORT", value: "3001" },
                { name: "MONGODB_URI", value: "mongodb://mongo-headless:27017/finanzas" },
              ],
            },
          ],
        },
      },
    },
  },
  { provider: k8sProvider, dependsOn: [mongoInitJob, metricsServer] }
);

const backendService = new k8s.core.v1.Service(
  "backend-svc",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      selector: backendLabels,
      ports: [{ port: 3001, targetPort: 3001 }],
      type: "ClusterIP",
    },
  },
  { provider: k8sProvider }
);

// -----------------------------
// Frontend
// -----------------------------
const frontendLabels = { app: "finanzas-frontend" };

const frontendDeployment = new k8s.apps.v1.Deployment(
  "frontend",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      selector: { matchLabels: frontendLabels },
      replicas: 2,
      template: {
        metadata: { labels: frontendLabels },
        spec: {
          containers: [
            {
              name: "frontend",
              image: frontendImage,
              ports: [{ containerPort: 5173 }],
              env: [
                {
                  name: "VITE_API_URL",
                  value: pulumi.interpolate`http://${backendService.metadata.name}.${ns.metadata.name}.svc.cluster.local:3001/api`,
                },
              ],
            },
          ],
        },
      },
    },
  },
  { provider: k8sProvider }
);

const frontendService = new k8s.core.v1.Service(
  "frontend-svc",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      selector: frontendLabels,
      ports: [{ port: 80, targetPort: 5173 }],
      type: "LoadBalancer",
    },
  },
  { provider: k8sProvider }
);

// -----------------------------
// HPA (Backend)
// -----------------------------
const backendHPA = new k8s.autoscaling.v2.HorizontalPodAutoscaler(
  "backend-hpa",
  {
    metadata: { namespace: ns.metadata.name },
    spec: {
      scaleTargetRef: {
        apiVersion: "apps/v1",
        kind: "Deployment",
        name: backendDeployment.metadata.name,
      },
      minReplicas: 1,
      maxReplicas: 5,
      metrics: [
        {
          type: "Resource",
          resource: {
            name: "cpu",
            target: { type: "Utilization", averageUtilization: 50 },
          },
        },
      ],
    },
  },
  { provider: k8sProvider, dependsOn: [metricsServer] }
);

// -----------------------------
// Outputs
// -----------------------------
export const kubeconfig = cluster.kubeconfig;
export const frontendUrl = frontendService.status.loadBalancer.ingress.apply(i => {
  if (!i || i.length === 0) return "";
  return i[0].hostname || i[0].ip || "";
});
