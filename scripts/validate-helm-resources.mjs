#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { parseAllDocuments } from "yaml";

const releaseName = "tali-relay";
const releaseNamespace = "tali-resource-validation";
const chartPath = "charts/tali-relay";
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
    `${releaseName}-deletion-worker`,
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
    "Local authentication must render Better Auth's canonical server.public_url.",
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
    "--set",
    "auth.oidc.enabled=true",
    "--set-string",
    "auth.oidc.issuer=https://identity.example.com",
    "--set-string",
    "auth.oidc.clientId=tali",
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
    "The Chart must require control.publicUrl in every authentication mode.",
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
