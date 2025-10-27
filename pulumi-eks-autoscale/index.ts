import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as docker from "@pulumi/docker";
import * as k8s from "@pulumi/kubernetes";

// Configuración base
const stack = pulumi.getStack();
const appName = "finanzas";
const region = aws.config.region || "us-east-1";

// 1️⃣ Repositorios ECR
const ecrBackend = new aws.ecr.Repository(`${appName}-backend`);
const ecrFrontend = new aws.ecr.Repository(`${appName}-frontend`);

// 2️⃣ Construcción y subida de imágenes Docker
function buildAndPushImage(name: string, context: string, repo: aws.ecr.Repository) {
    const auth = aws.ecr.getAuthorizationTokenOutput();
    return new docker.Image(name, {
        imageName: pulumi.interpolate`${repo.repositoryUrl}:${stack}`,
        build: { context },
        registry: {
            server: repo.repositoryUrl,
            username: auth.userName,
            password: auth.password,
        },
    });
}

const backendImage = buildAndPushImage("backendImage", "../finanzas-personales/backend", ecrBackend);
const frontendImage = buildAndPushImage("frontendImage", "../finanzas-personales/frontend", ecrFrontend);

// 3️⃣ Crear EKS cluster con autoscaling en nodos
const cluster = new eks.Cluster(`${appName}-eks`, {
    version: "1.27",
    desiredCapacity: 2,
    minSize: 1,
    maxSize: 5,
    instanceType: "t3.medium",
});

const k8sProvider = new k8s.Provider("k8sProvider", {
    kubeconfig: cluster.kubeconfig,
});

// 4️⃣ Namespace
const ns = new k8s.core.v1.Namespace(`${appName}-ns`, {
    metadata: { name: appName },
}, { provider: k8sProvider });

// 5️⃣ Backend Deployment + Service
const backendLabels = { app: "backend" };
const backendDeployment = new k8s.apps.v1.Deployment(`${appName}-backend`, {
    metadata: { namespace: ns.metadata.name },
    spec: {
        selector: { matchLabels: backendLabels },
        replicas: 1,
        template: {
            metadata: { labels: backendLabels },
            spec: {
                containers: [{
                    name: "backend",
                    image: backendImage.imageName,
                    ports: [{ containerPort: 3001 }],
                    resources: {
                        requests: { cpu: "100m", memory: "128Mi" },
                        limits: { cpu: "500m", memory: "256Mi" },
                    },
                }],
            },
        },
    },
}, { provider: k8sProvider });

const backendService = new k8s.core.v1.Service(`${appName}-backend-svc`, {
    metadata: { namespace: ns.metadata.name },
    spec: {
        selector: backendLabels,
        ports: [{ port: 3001, targetPort: 3001 }],
        type: "ClusterIP",
    },
}, { provider: k8sProvider });

// 6️⃣ Frontend Deployment + LoadBalancer
const frontendLabels = { app: "frontend" };
const frontendDeployment = new k8s.apps.v1.Deployment(`${appName}-frontend`, {
    metadata: { namespace: ns.metadata.name },
    spec: {
        selector: { matchLabels: frontendLabels },
        replicas: 1,
        template: {
            metadata: { labels: frontendLabels },
            spec: {
                containers: [{
                    name: "frontend",
                    image: frontendImage.imageName,
                    ports: [{ containerPort: 5173 }],
                }],
            },
        },
    },
}, { provider: k8sProvider });

const frontendService = new k8s.core.v1.Service(`${appName}-frontend-svc`, {
    metadata: { namespace: ns.metadata.name },
    spec: {
        selector: frontendLabels,
        ports: [{ port: 80, targetPort: 5173 }],
        type: "LoadBalancer",
    },
}, { provider: k8sProvider });

// 7️⃣ Horizontal Pod Autoscaler (backend)
const backendHPA = new k8s.autoscaling.v2.HorizontalPodAutoscaler(`${appName}-hpa`, {
    metadata: { namespace: ns.metadata.name },
    spec: {
        scaleTargetRef: {
            apiVersion: "apps/v1",
            kind: "Deployment",
            name: backendDeployment.metadata.name,
        },
        minReplicas: 1,
        maxReplicas: 10,
        metrics: [{
            type: "Resource",
            resource: {
                name: "cpu",
                target: { type: "Utilization", averageUtilization: 50 },
            },
        }],
    },
}, { provider: k8sProvider });

// 8️⃣ Cluster Autoscaler (Helm)
const clusterAutoscaler = new k8s.helm.v3.Chart("cluster-autoscaler", {
    chart: "cluster-autoscaler",
    fetchOpts: { repo: "https://kubernetes.github.io/autoscaler" },
    namespace: "kube-system",
    values: {
        autoDiscovery: { clusterName: cluster.eksCluster.name },
        awsRegion: region,
        rbac: { create: true },
    },
}, { provider: k8sProvider });

// 📤 Outputs
export const kubeconfig = cluster.kubeconfig;
export const frontendUrl = frontendService.status.loadBalancer.ingress[0].hostname;
