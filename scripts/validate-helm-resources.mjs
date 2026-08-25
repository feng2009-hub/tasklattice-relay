#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parseAllDocuments } from "yaml";

const releaseName = "tali-relay";
const releaseNamespace = "tali-resource-validation";
const chartPath = "charts/tali-relay";
const runtimeControlName = `${releaseName}-project-runtime-control`;
const controlWorkerName = `${releaseName}-control-worker`;
function scopedClusterRoleName(name) {
  return `${name.slice(0, 48).replace(/-$/, "")}-${createHash("sha256")
    .update(`${releaseNamespace}/${name}`)
    .digest("hex")
    .slice(0, 12)}`;
}
const runtimeControlClusterRoleName = scopedClusterRoleName(
  runtimeControlName,
);
const controlWorkerClusterRoleName = scopedClusterRoleName(controlWorkerName);
const requiredResources = [
  ["requests", "cpu"],
  ["requests", "memory"],
  ["limits", "cpu"],
  ["limits", "memory"],
];

function templateArguments(extraArguments = []) {
  return [
    "template",
    releaseName,
    chartPath,
    "--namespace",
    releaseNamespace,
    "--kube-version",
    "1.29.0",
    "--include-crds",
    ...extraArguments,
  ];
}

function renderChart(extraArguments = []) {
  return execFileSync("helm", templateArguments(extraArguments), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function renderNamedChart(name, namespace, extraArguments = []) {
  return execFileSync(
    "helm",
    [
      "template",
      name,
      chartPath,
      "--namespace",
      namespace,
      "--kube-version",
      "1.29.0",
      "--include-crds",
      ...extraArguments,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function parseObjects(rendered) {
  return parseAllDocuments(rendered, { uniqueKeys: false })
    .map((document) => {
      if (document.errors.length > 0) {
        throw document.errors[0];
      }
      return document.toJS();
    })
    .filter((object) => object && typeof object === "object");
}

const rendered = renderChart([
  "--set-string",
  "control.publicUrl=http://192.0.2.10",
  "--set",
  "keycloak.enabled=true",
  "--set-string",
  "keycloak.publicUrl=http://192.0.2.11:8080",
  "--set",
  "exampleMcp.enabled=true",
]);

const objects = parseObjects(rendered);

const arbitraryReleaseName = "tali-release-023";
const arbitraryReleaseNamespace = "tali-arbitrary-release-validation";
const arbitraryReleaseObjects = parseObjects(
  renderNamedChart(arbitraryReleaseName, arbitraryReleaseNamespace),
);
const arbitraryOpenShellService = arbitraryReleaseObjects.find(
  (object) =>
    object.kind === "Service"
    && object.metadata?.labels?.["app.kubernetes.io/name"] === "openshell",
);
const arbitraryRunner = arbitraryReleaseObjects.find(
  (object) =>
    object.kind === "Deployment"
    && object.metadata?.labels?.["app.kubernetes.io/component"] === "runner",
);
const arbitraryGatewayEndpoint = arbitraryRunner?.spec?.template?.spec?.containers
  ?.find((container) => container.name === "runner")
  ?.env?.find((entry) => entry.name === "OPENSHELL_GATEWAY_ENDPOINT")?.value;
const expectedArbitraryGatewayEndpoint = arbitraryOpenShellService
  ? `http://${arbitraryOpenShellService.metadata.name}.${arbitraryReleaseNamespace}.svc.cluster.local:8080`
  : undefined;
if (
  !expectedArbitraryGatewayEndpoint
  || arbitraryGatewayEndpoint !== expectedArbitraryGatewayEndpoint
) {
  throw new Error(
    "The Runner OpenShell endpoint must resolve to the dependency-owned Service for arbitrary Helm release names.",
  );
}

for (const kind of ["Deployment", "ServiceAccount"]) {
  if (
    objects.some(
      (object) =>
        object.kind === kind && object.metadata?.name === runtimeControlName,
    )
  ) {
    throw new Error(
      `${kind}/${runtimeControlName} must not be rendered; Project Namespace creation runs synchronously in Control.`,
    );
  }
}

const syncWaveAnnotation = "argocd.argoproj.io/sync-wave";

function requireObject(kind, name) {
  const object = objects.find(
    (candidate) =>
      candidate.kind === kind && candidate.metadata?.name === name,
  );
  if (!object) {
    throw new Error(`${kind}/${name} was not rendered.`);
  }
  return object;
}

function assertSyncWave(kind, name, expectedWave) {
  const actualWave = requireObject(kind, name).metadata?.annotations?.[
    syncWaveAnnotation
  ];
  if (actualWave !== expectedWave) {
    throw new Error(
      `${kind}/${name} must use Argo CD sync wave ${expectedWave}; got ${actualWave ?? "the default wave"}.`,
    );
  }
}

for (const [kind, name, wave] of [
  ["LimitRange", `${releaseName}-container-resources`, "-10"],
  ["ServiceAccount", `${releaseName}-control`, "10"],
  ["ServiceAccount", `${releaseName}-runtime`, "10"],
  ["ServiceAccount", controlWorkerName, "10"],
  ["ClusterRole", runtimeControlClusterRoleName, "10"],
  ["ClusterRoleBinding", runtimeControlClusterRoleName, "10"],
  ["ClusterRole", controlWorkerClusterRoleName, "10"],
  ["ClusterRoleBinding", controlWorkerClusterRoleName, "10"],
  ["Role", `${releaseName}-control-managed-secrets`, "10"],
  ["RoleBinding", `${releaseName}-control-managed-secrets`, "10"],
  ["Secret", `${releaseName}-secrets`, "10"],
  ["Secret", `${releaseName}-example-mcp-auth`, "10"],
  ["ConfigMap", `${releaseName}-keycloak-realm`, "10"],
  ["Service", `${releaseName}-postgresql`, "10"],
  ["Service", `${releaseName}-litellm`, "10"],
  ["Service", `${releaseName}-keycloak`, "10"],
  ["Service", `${releaseName}-control`, "10"],
  ["Service", `${releaseName}-runner`, "10"],
  ["Service", `${releaseName}-example-mcp`, "10"],
  ["StatefulSet", `${releaseName}-postgresql`, "20"],
  ["Deployment", `${releaseName}-litellm`, "30"],
  ["Deployment", `${releaseName}-keycloak`, "30"],
  ["Deployment", `${releaseName}-control`, "40"],
  ["Deployment", controlWorkerName, "40"],
  ["Deployment", `${releaseName}-runner`, "40"],
  ["Deployment", `${releaseName}-example-mcp`, "40"],
]) {
  assertSyncWave(kind, name, wave);
}

for (const [kind, name] of [
  ["StatefulSet", `${releaseName}-openshell`],
  ["Deployment", "agent-sandbox-controller"],
]) {
  const dependencyWave = requireObject(kind, name).metadata?.annotations?.[
    syncWaveAnnotation
  ];
  if (dependencyWave != null) {
    throw new Error(
      `${kind}/${name} is dependency-owned and must stay at Argo CD's default sync wave 0.`,
    );
  }
}

for (const object of objects) {
  if (object.metadata?.annotations?.["argocd.argoproj.io/hook"] != null) {
    throw new Error(
      `${object.kind}/${object.metadata?.name} must not replace upstream Helm hook annotations with Argo CD hooks.`,
    );
  }
}

for (const [kind, expectedWeight] of [
  ["ServiceAccount", "-30"],
  ["Role", "-30"],
  ["RoleBinding", "-30"],
  ["Job", "-20"],
]) {
  const annotations = requireObject(
    kind,
    `${releaseName}-openshell-certgen`,
  ).metadata?.annotations;
  if (
    annotations?.["helm.sh/hook"] !== "pre-install,pre-upgrade" ||
    annotations?.["helm.sh/hook-weight"] !== expectedWeight
  ) {
    throw new Error(
      `${kind}/${releaseName}-openshell-certgen must preserve its upstream Helm hook and weight ${expectedWeight}.`,
    );
  }
}

for (const [deploymentName, expectedInitContainers] of [
  [
    `${releaseName}-control`,
    [
      [
        "migrate-control-database",
        [
          "/app/node_modules/.bin/prisma",
          "migrate",
          "deploy",
          "--config",
          "prisma.config.ts",
        ],
      ],
      ["seed-built-in-skills", ["node", "prisma/seed-built-in-skills.mjs"]],
    ],
  ],
  [
    controlWorkerName,
    [
      [
        "migrate-control-database",
        [
          "/app/node_modules/.bin/prisma",
          "migrate",
          "deploy",
          "--config",
          "prisma.config.ts",
        ],
      ],
    ],
  ],
]) {
  const deployment = objects.find(
    (object) =>
      object.kind === "Deployment" && object.metadata?.name === deploymentName,
  );
  if (!deployment) {
    throw new Error(`Deployment/${deploymentName} was not rendered.`);
  }

  for (const [initContainerName, expectedCommand] of expectedInitContainers) {
    const initContainer = deployment.spec?.template?.spec?.initContainers?.find(
      (container) => container.name === initContainerName,
    );
    if (!initContainer) {
      throw new Error(
        `Deployment/${deploymentName} is missing initContainer/${initContainerName}.`,
      );
    }
    if (initContainer.workingDir !== "/app/apps/control") {
      throw new Error(
        `Deployment/${deploymentName} initContainer/${initContainerName} must run from /app/apps/control.`,
      );
    }
    if (
      JSON.stringify(initContainer.command) !== JSON.stringify(expectedCommand)
    ) {
      throw new Error(
        `Deployment/${deploymentName} initContainer/${initContainerName} must run without npm.`,
      );
    }
    for (const [name, value] of [
      ["HOME", "/tmp"],
      ["XDG_CACHE_HOME", "/tmp/.cache"],
    ]) {
      const actualValue = initContainer.env?.find(
        (environmentVariable) => environmentVariable.name === name,
      )?.value;
      if (actualValue !== value) {
        throw new Error(
          `Deployment/${deploymentName} initContainer/${initContainerName} must set ${name}=${value}.`,
        );
      }
    }
  }
}

const localObjects = parseObjects(
  renderChart(["--set", "control.service.type=LoadBalancer"]),
);
const localSecret = localObjects.find(
  (object) =>
    object.kind === "Secret" &&
    object.metadata?.name === `${releaseName}-secrets`,
);
const localControlToml = localSecret?.stringData?.["control.toml"] ?? "";
if (!/^public_url\s*=\s*"http:\/\/localhost:38080"$/m.test(localControlToml)) {
  throw new Error(
    "Control bootstrap must render Better Auth's canonical server.public_url.",
  );
}
if (/\[(?:runner|litellm|runtime_namespaces)\]|internal_url\s*=|^enabled\s*=/m.test(localControlToml)) {
  throw new Error(
    "Runtime connectivity and policy must not be rendered into control.toml.",
  );
}
const localControl = localObjects.find(
  (object) =>
    object.kind === "Deployment"
    && object.metadata?.name === `${releaseName}-control`,
);
const localControlEnv = localControl?.spec?.template?.spec?.containers
  ?.find((container) => container.name === "control")?.env ?? [];
for (const [name, value] of [
  ["TALI_BOOTSTRAP_INTERNAL_URL", `http://${releaseName}-control:38080`],
  ["TALI_BOOTSTRAP_RUNNER_URL", `http://${releaseName}-runner:9090`],
  ["TALI_BOOTSTRAP_LITELLM_URL", `http://${releaseName}-litellm:4000`],
  ["TALI_BOOTSTRAP_RUNTIME_NAMESPACES_ENABLED", "true"],
  ["TALI_BOOTSTRAP_RUNTIME_CLUSTER_ID", "in-cluster"],
  ["TALI_BOOTSTRAP_RUNTIME_NAMESPACE_PREFIX", "tali-p"],
]) {
  if (localControlEnv.find((entry) => entry.name === name)?.value !== value) {
    throw new Error(`${name} must seed the initial Platform infrastructure setting.`);
  }
}
for (const [name, key] of [
  ["TALI_BOOTSTRAP_RUNNER_TOKEN", "runner-token"],
  ["TALI_BOOTSTRAP_LITELLM_MASTER_KEY", "litellm-master-key"],
]) {
  if (
    localControlEnv.find((entry) => entry.name === name)?.valueFrom
      ?.secretKeyRef?.key !== key
  ) {
    throw new Error(`${name} must seed Platform settings from the component Secret.`);
  }
}

const controlWorker = requireObject(
  "Deployment",
  controlWorkerName,
);
if (
  controlWorker.spec?.template?.spec?.serviceAccountName !==
    controlWorkerName ||
  controlWorker.spec?.template?.spec?.automountServiceAccountToken !== true
) {
  throw new Error(
    "The Control Worker must use its dedicated identity for asynchronous control-plane tasks.",
  );
}

const runtimeControlRole = requireObject(
  "ClusterRole",
  runtimeControlClusterRoleName,
);
if (
  JSON.stringify(runtimeControlRole.rules) !== JSON.stringify([
    {
      apiGroups: [""],
      resources: ["namespaces"],
      verbs: ["get", "create", "patch"],
    },
    {
      apiGroups: [""],
      resources: ["services"],
      verbs: ["get", "create", "patch", "delete"],
    },
    {
      apiGroups: [""],
      resources: ["pods"],
      verbs: ["get", "list"],
    },
    {
      apiGroups: ["apps"],
      resources: ["deployments"],
      verbs: ["get", "create", "patch", "delete"],
    },
  ])
) {
  throw new Error(
    "The Control Plane must be limited to Project Namespace metadata and managed Agent workloads.",
  );
}

const runtimeControlBinding = requireObject(
  "ClusterRoleBinding",
  runtimeControlClusterRoleName,
);
if (
  !runtimeControlBinding.subjects?.some(
    (subject) =>
      subject.kind === "ServiceAccount" &&
      subject.name === `${releaseName}-control` &&
      subject.namespace === releaseNamespace,
  )
) {
  throw new Error(
    "Synchronous Project Namespace provisioning must be bound to the Control ServiceAccount.",
  );
}

const runtimeDisabledObjects = parseObjects(
  renderChart(["--set", "projectRuntimeNamespaces.enabled=false"]),
);
for (const [kind, name] of [
  ["ClusterRole", runtimeControlClusterRoleName],
  ["ClusterRoleBinding", runtimeControlClusterRoleName],
  ["ServiceAccount", controlWorkerName],
  ["ClusterRole", controlWorkerClusterRoleName],
  ["ClusterRoleBinding", controlWorkerClusterRoleName],
]) {
  if (
    !runtimeDisabledObjects.some(
      (object) => object.kind === kind && object.metadata?.name === name,
    )
  ) {
    throw new Error(
      `${kind}/${name} must remain available so Platform validation can enable Runtime Namespaces online.`,
    );
  }
}
const runtimeDisabledControlWorker = runtimeDisabledObjects.find(
  (object) =>
    object.kind === "Deployment" &&
    object.metadata?.name === controlWorkerName,
);
if (
  runtimeDisabledControlWorker?.spec?.template?.spec?.serviceAccountName !==
    controlWorkerName ||
  runtimeDisabledControlWorker?.spec?.template?.spec
    ?.automountServiceAccountToken !== true
) {
  throw new Error(
    "The Control Worker must retain its dedicated identity when Runtime Namespaces are disabled in the initial Platform setting.",
  );
}

const controlWorkerRole = requireObject(
  "ClusterRole",
  controlWorkerClusterRoleName,
);
if (
  JSON.stringify(controlWorkerRole.rules) !== JSON.stringify([
    {
      apiGroups: [""],
      resources: ["namespaces"],
      verbs: ["get", "create", "patch", "delete"],
    },
  ])
) {
  throw new Error(
    "The Control Worker identity must be limited to reconciling and deleting Project Namespaces.",
  );
}

const localControlService = localObjects.find(
  (object) =>
    object.kind === "Service" &&
    object.metadata?.name === `${releaseName}-control`,
);
if (localControlService?.spec?.type !== "LoadBalancer") {
  throw new Error(
    "The Control Service must render as LoadBalancer with the canonical control.publicUrl.",
  );
}

const localWithPublicUrlObjects = parseObjects(
  renderChart([
    "--set",
    "control.service.type=LoadBalancer",
    "--set-string",
    "control.publicUrl=http://198.51.100.20",
  ]),
);

function podAnnotations(collection, kind, name) {
  return (
    collection.find(
      (object) =>
        object.kind === kind && object.metadata?.name === name,
    )?.spec?.template?.metadata?.annotations ?? {}
  );
}

const checksumComparisons = [
  ["Deployment", `${releaseName}-runner`, "checksum/runner-secret", false],
  ["Deployment", `${releaseName}-litellm`, "checksum/litellm-secret", false],
  [
    "StatefulSet",
    `${releaseName}-postgresql`,
    "checksum/postgresql-secret",
    false,
  ],
  [
    "Deployment",
    `${releaseName}-control`,
    "checksum/control-config",
    true,
  ],
];
for (const [kind, name, annotation, shouldChange] of checksumComparisons) {
  const before = podAnnotations(localObjects, kind, name)[annotation];
  const after = podAnnotations(localWithPublicUrlObjects, kind, name)[annotation];
  if (!before || !after) {
    throw new Error(`${kind}/${name} is missing ${annotation}.`);
  }
  if ((before !== after) !== shouldChange) {
    throw new Error(
      `${kind}/${name} ${annotation} ${
        shouldChange ? "must" : "must not"
      } change when only control.publicUrl changes.`,
    );
  }
}

const missingOidcPublicUrlResult = spawnSync(
  "helm",
  templateArguments([
    "--set-string",
    "control.publicUrl=",
  ]),
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
if (
  missingOidcPublicUrlResult.status === 0 ||
  !missingOidcPublicUrlResult.stderr.includes(
    "control.publicUrl is required for Better Auth",
  )
) {
  throw new Error(
    "The Chart must require control.publicUrl for authentication callbacks and invitation links.",
  );
}

const namespaceDefaults = new Map();
for (const object of objects) {
  if (object.kind !== "LimitRange") {
    continue;
  }

  const namespace = object.metadata?.namespace ?? releaseNamespace;
  const containerLimit = object.spec?.limits?.find(
    (limit) => limit.type === "Container",
  );
  if (!containerLimit) {
    continue;
  }

  namespaceDefaults.set(namespace, {
    requests: containerLimit.defaultRequest ?? {},
    limits: containerLimit.default ?? {},
  });
}

const releaseDefaults = namespaceDefaults.get(releaseNamespace);
const missingReleaseDefaults = requiredResources.filter(
  ([resourceType, resourceName]) =>
    releaseDefaults?.[resourceType]?.[resourceName] == null,
);
if (missingReleaseDefaults.length > 0) {
  throw new Error(
    "The release namespace must define Container LimitRange defaults for " +
      missingReleaseDefaults
        .map(([resourceType, resourceName]) => `${resourceType}.${resourceName}`)
        .join(", ") +
      " so dynamically injected sandbox containers are admitted with resources.",
  );
}

function podTemplateFor(object) {
  switch (object.kind) {
    case "Pod":
      return object;
    case "Deployment":
    case "StatefulSet":
    case "DaemonSet":
    case "Job":
    case "ReplicaSet":
      return object.spec?.template;
    case "CronJob":
      return object.spec?.jobTemplate?.spec?.template;
    default:
      return undefined;
  }
}

const violations = [];
let checkedContainers = 0;
let defaultedContainers = 0;
const defaultedContainerNames = [];

for (const object of objects) {
  const template = podTemplateFor(object);
  if (!template) {
    continue;
  }

  const namespace = object.metadata?.namespace ?? releaseNamespace;
  const defaults = namespaceDefaults.get(namespace);
  const hookNames = (
    object.metadata?.annotations?.["helm.sh/hook"] ?? ""
  ).split(",");
  const isPreInstallHook = hookNames.includes("pre-install");
  const podSpec = object.kind === "Pod" ? object.spec : template.spec;
  const containerGroups = [
    ["initContainers", podSpec?.initContainers ?? []],
    ["containers", podSpec?.containers ?? []],
  ];

  for (const [groupName, containers] of containerGroups) {
    for (const container of containers) {
      checkedContainers += 1;
      let usedDefaults = false;

      for (const [resourceType, resourceName] of requiredResources) {
        if (container.resources?.[resourceType]?.[resourceName] != null) {
          continue;
        }
        if (
          !isPreInstallHook &&
          defaults?.[resourceType]?.[resourceName] != null
        ) {
          usedDefaults = true;
          continue;
        }

        violations.push(
          `${object.kind}/${object.metadata?.name} ${groupName}/${container.name} ` +
            `in namespace ${namespace} is missing resources.${resourceType}.${resourceName}`,
        );
      }

      if (usedDefaults) {
        defaultedContainers += 1;
        defaultedContainerNames.push(
          `${object.kind}/${object.metadata?.name} ${groupName}/${container.name}`,
        );
      }
    }
  }
}

if (checkedContainers === 0) {
  throw new Error("The rendered chart did not contain any Pod containers.");
}

if (violations.length > 0) {
  console.error("Helm resource validation failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${checkedContainers} rendered containers; ` +
    `${defaultedContainers} rely on namespace LimitRange admission defaults.`,
);
for (const containerName of defaultedContainerNames) {
  console.log(`- ${containerName}`);
}
