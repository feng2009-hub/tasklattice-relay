#!/usr/bin/env python3
"""Apply the reviewed TaskLattice overlay to LiteLLM 1.87.0.

Every source mutation is anchored to the exact upstream text reviewed for this
version.  A missing or repeated anchor aborts the image build instead of
silently producing a partially patched, fail-open image.
"""

from __future__ import annotations

import argparse
import importlib.metadata
import os
import shutil
from pathlib import Path

EXPECTED_VERSION = "1.87.0"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"{label}: expected one reviewed anchor in {path}, found {count}"
        )
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


def replace_in_section(
    path: Path,
    section_start: str,
    section_end: str,
    old: str,
    new: str,
    label: str,
) -> None:
    source = path.read_text(encoding="utf-8")
    start = source.find(section_start)
    if start < 0:
        raise RuntimeError(f"{label}: section start missing in {path}")
    end = source.find(section_end, start + len(section_start))
    if end < 0:
        raise RuntimeError(f"{label}: section end missing in {path}")
    section = source[start:end]
    count = section.count(old)
    if count != 1:
        raise RuntimeError(
            f"{label}: expected one reviewed anchor in section, found {count}"
        )
    section = section.replace(old, new, 1)
    path.write_text(source[:start] + section + source[end:], encoding="utf-8")


def copy_overlay(version_dir: Path, app_root: Path) -> None:
    overlay = version_dir / "overlay"
    for source in sorted(overlay.rglob("*")):
        if not source.is_file():
            continue
        destination = app_root / source.relative_to(overlay)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def patch_backend(app_root: Path) -> None:
    endpoints = app_root / "litellm/proxy/guardrails/guardrail_endpoints.py"
    registry = app_root / "litellm/proxy/guardrails/guardrail_registry.py"

    replace_once(
        registry,
        "guardrail_initializer_registry.update(_discovered_initializers)\n",
        """guardrail_initializer_registry.update(_discovered_initializers)

# The TaskLattice overlay is an intentional part of this LiteLLM distribution.
# Register it explicitly as well as through hook discovery so application import
# order cannot make the branded Provider disappear from the Admin UI.
from litellm.proxy.guardrails.guardrail_hooks.tasklattice_guard import (
    guardrail_class_registry as tasklattice_guard_classes,
    guardrail_initializer_registry as tasklattice_guard_initializers,
)

guardrail_class_registry.update(tasklattice_guard_classes)
guardrail_initializer_registry.update(tasklattice_guard_initializers)
""",
        "explicit TaskLattice provider registration",
    )

    replace_in_section(
        endpoints,
        "async def create_guardrail(\n",
        "\n\nclass UpdateGuardrailRequest",
        '    if prisma_client is None:\n        raise HTTPException(status_code=500, detail="Prisma client not initialized")\n\n    try:\n',
        '    if prisma_client is None:\n        raise HTTPException(status_code=500, detail="Prisma client not initialized")\n\n    if (request.guardrail.get("litellm_params") or {}).get("guardrail") == "tasklattice_guard":\n        raise HTTPException(\n            status_code=400,\n            detail="Use POST /guardrails/tasklattice for TaskLattice Guard",\n        )\n\n    try:\n',
        "block generic TaskLattice creation",
    )
    replace_in_section(
        endpoints,
        "async def update_guardrail(\n",
        "\n\n@router.delete(\n",
        "        if existing_guardrail is None:\n            raise HTTPException(\n                status_code=404, detail=f\"Guardrail with ID {guardrail_id} not found\"\n            )\n\n        result = await GUARDRAIL_REGISTRY.update_guardrail_in_db(\n",
        "        if existing_guardrail is None:\n            raise HTTPException(\n                status_code=404, detail=f\"Guardrail with ID {guardrail_id} not found\"\n            )\n        existing_params = existing_guardrail.get(\"litellm_params\") or {}\n        if getattr(existing_params, \"guardrail\", None) == \"tasklattice_guard\" or (\n            isinstance(existing_params, dict)\n            and existing_params.get(\"guardrail\") == \"tasklattice_guard\"\n        ):\n            raise HTTPException(\n                status_code=400,\n                detail=\"Use PATCH /guardrails/tasklattice/{id} for TaskLattice Guard\",\n            )\n\n        result = await GUARDRAIL_REGISTRY.update_guardrail_in_db(\n",
        "block generic TaskLattice replace",
    )
    replace_in_section(
        endpoints,
        "async def delete_guardrail(\n",
        "\n\n# --- Team guardrail registration",
        "        if existing_guardrail is None:\n            raise HTTPException(\n                status_code=404, detail=f\"Guardrail with ID {guardrail_id} not found\"\n            )\n\n        result = await GUARDRAIL_REGISTRY.delete_guardrail_from_db(\n",
        "        if existing_guardrail is None:\n            raise HTTPException(\n                status_code=404, detail=f\"Guardrail with ID {guardrail_id} not found\"\n            )\n        existing_params = existing_guardrail.get(\"litellm_params\") or {}\n        if getattr(existing_params, \"guardrail\", None) == \"tasklattice_guard\" or (\n            isinstance(existing_params, dict)\n            and existing_params.get(\"guardrail\") == \"tasklattice_guard\"\n        ):\n            from litellm.proxy.guardrails.guardrail_hooks.tasklattice_guard.service import (\n                delete_tasklattice_guard_connection,\n            )\n\n            await delete_tasklattice_guard_connection(\n                prisma_client=prisma_client, guardrail_id=guardrail_id\n            )\n            return {\"message\": f\"Guardrail {guardrail_id} deleted successfully\"}\n\n        result = await GUARDRAIL_REGISTRY.delete_guardrail_from_db(\n",
        "TaskLattice credential cleanup on standard delete",
    )
    replace_in_section(
        endpoints,
        "async def patch_guardrail(\n",
        '\n\n@router.get(\n    "/guardrails/{guardrail_id}",',
        "        if existing_guardrail is None:\n            raise HTTPException(\n                status_code=404, detail=f\"Guardrail with ID {guardrail_id} not found\"\n            )\n\n        # Create updated guardrail object\n",
        "        if existing_guardrail is None:\n            raise HTTPException(\n                status_code=404, detail=f\"Guardrail with ID {guardrail_id} not found\"\n            )\n        existing_params = existing_guardrail.get(\"litellm_params\") or {}\n        if getattr(existing_params, \"guardrail\", None) == \"tasklattice_guard\" or (\n            isinstance(existing_params, dict)\n            and existing_params.get(\"guardrail\") == \"tasklattice_guard\"\n        ):\n            raise HTTPException(\n                status_code=400,\n                detail=\"Use PATCH /guardrails/tasklattice/{id} for TaskLattice Guard\",\n            )\n\n        # Create updated guardrail object\n",
        "block generic TaskLattice patch",
    )
    replace_once(
        endpoints,
        "# Usage (dashboard) endpoints: overview, detail, logs\nrouter.include_router(guardrails_usage_router)\n",
        "# TaskLattice's dedicated lifecycle keeps credentials out of GuardrailsTable.\nfrom litellm.proxy.guardrails.guardrail_hooks.tasklattice_guard.endpoints import (\n    router as tasklattice_guard_router,\n)\n\nrouter.include_router(tasklattice_guard_router)\n\n# Usage (dashboard) endpoints: overview, detail, logs\nrouter.include_router(guardrails_usage_router)\n",
        "register dedicated TaskLattice endpoints",
    )

def patch_ui(app_root: Path) -> None:
    ui_root = app_root / "ui/litellm-dashboard/src/components"
    helpers = ui_root / "guardrails/guardrail_info_helpers.tsx"
    networking = ui_root / "networking.tsx"
    add_form = ui_root / "guardrails/add_guardrail_form.tsx"
    info_view = ui_root / "guardrails/guardrail_info.tsx"
    garden_data = ui_root / "guardrails/guardrail_garden_data.ts"
    garden_configs = ui_root / "guardrails/guardrail_garden_configs.ts"
    garden_detail = ui_root / "guardrails/guardrail_garden_detail.tsx"

    replace_once(
        helpers,
        'export const guardrailLogoMap: Record<string, string> = {\n',
        'export const guardrailLogoMap: Record<string, string> = {\n  "TaskLattice Guard": `${asset_logos_folder}tasklattice_guard.svg`,\n',
        "TaskLattice provider logo",
    )

    replace_once(
        garden_data,
        '''  providerKey?: string;
}
''',
        '''  providerKey?: string;
  overview?: string;
  details?: Array<{ property: string; value: string }>;
}
''',
        "TaskLattice Garden detail metadata",
    )
    replace_once(
        garden_data,
        '''  {
    id: "xecguard",
    name: "XecGuard",
    description:
      "CyCraft XecGuard AI security gateway. Multi-policy scanning (prompt injection, harmful content, PII, system-prompt enforcement) plus RAG context grounding.",
    category: "partner",
    logo: `${ASSET_PREFIX}xecguard.svg`,
    tags: ["Security", "Policy", "Grounding", "RAG"],
    providerKey: "Xecguard",
  },
];
''',
        '''  {
    id: "xecguard",
    name: "XecGuard",
    description:
      "CyCraft XecGuard AI security gateway. Multi-policy scanning (prompt injection, harmful content, PII, system-prompt enforcement) plus RAG context grounding.",
    category: "partner",
    logo: `${ASSET_PREFIX}xecguard.svg`,
    tags: ["Security", "Policy", "Grounding", "RAG"],
    providerKey: "Xecguard",
  },
  {
    id: "tasklattice_guard",
    name: "TaskLattice Guard",
    description:
      "Apply governed, versioned AI safety policies to LiteLLM model input and output with fail-closed enforcement.",
    category: "partner",
    logo: `${ASSET_PREFIX}tasklattice_guard.svg`,
    tags: ["Input & Output", "Fail Closed", "Multi-Gateway"],
    providerKey: "TasklatticeGuard",
    overview:
      "TaskLattice Guard connects this LiteLLM gateway to one dedicated Integration. It inspects input before the model call and output before it is returned, using the Guardrail Version deployed for that traffic. Connect with the Integration Endpoint and its matching one-time Secret; LiteLLM verifies and activates the Provider without YAML changes or a restart.",
    details: [
      { property: "Provider", value: "TaskLattice Guard" },
      { property: "Runtime", value: "NVIDIA NeMo Guardrails" },
      { property: "Protection stages", value: "Before and after the model" },
      { property: "Enforcement", value: "Always on · fail closed" },
      { property: "Connection scope", value: "One Integration per LiteLLM gateway" },
      { property: "Configuration", value: "Integration Endpoint + Secret" },
      { property: "Activation", value: "Immediate · no LiteLLM restart" },
    ],
  },
];
''',
        "TaskLattice Partner Guardrail Garden card",
    )
    replace_once(
        garden_configs,
        '''  // ── Partner Guardrails ──
  presidio: {
''',
        '''  // ── Partner Guardrails ──
  tasklattice_guard: {
    provider: "TasklatticeGuard",
    guardrailNameSuggestion: "TaskLattice Guard",
    mode: "pre_call",
    defaultOn: true,
  },
  presidio: {
''',
        "TaskLattice Guardrail Garden preset",
    )
    replace_once(
        garden_detail,
        '''  const detailRows = [
    { property: "Provider", value: card.category === "litellm" ? "LiteLLM Content Filter" : "Partner Guardrail" },
    ...(card.subcategory ? [{ property: "Subcategory", value: card.subcategory }] : []),
    ...(card.category === "litellm" ? [{ property: "Cost", value: "$0 / request" }] : []),
    ...(card.category === "litellm" ? [{ property: "External Dependencies", value: "None" }] : []),
    ...(card.category === "litellm" ? [{ property: "Latency", value: card.eval?.latency || "<1ms" }] : []),
  ];
''',
        '''  const detailRows = card.details ?? [
    { property: "Provider", value: card.category === "litellm" ? "LiteLLM Content Filter" : "Partner Guardrail" },
    ...(card.subcategory ? [{ property: "Subcategory", value: card.subcategory }] : []),
    ...(card.category === "litellm" ? [{ property: "Cost", value: "$0 / request" }] : []),
    ...(card.category === "litellm" ? [{ property: "External Dependencies", value: "None" }] : []),
    ...(card.category === "litellm" ? [{ property: "Latency", value: card.eval?.latency || "<1ms" }] : []),
  ];
''',
        "TaskLattice Garden detail rows",
    )
    replace_once(
        garden_detail,
        '''              {card.description}
''',
        '''              {card.overview || card.description}
''',
        "TaskLattice Garden overview",
    )

    networking_anchor = '''export const createGuardrailCall = async (accessToken: string, guardrailData: any) => {
'''
    networking_start = networking.read_text(encoding="utf-8").find(networking_anchor)
    if networking_start < 0:
        raise RuntimeError("TaskLattice networking: createGuardrailCall anchor missing")
    networking_end_marker = "\n};\n\nexport const uiSpendLogDetailsCall"
    networking_source = networking.read_text(encoding="utf-8")
    networking_end = networking_source.find(networking_end_marker, networking_start)
    if networking_end < 0:
        raise RuntimeError("TaskLattice networking: end anchor missing")
    insert_at = networking_end + len("\n};")
    networking_helpers = '''

type TaskLatticeGuardInput = { endpoint?: string; secret?: string };

const taskLatticeGuardRequest = async (
  accessToken: string,
  method: "POST" | "PATCH" | "GET" | "DELETE",
  path: string,
  body?: TaskLatticeGuardInput,
) => {
  const url = proxyBaseUrl ? `${proxyBaseUrl}${path}` : path;
  const response = await fetch(url, {
    method,
    headers: {
      [globalLitellmHeaderName]: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const errorText = await response.text();
    handleError(errorText);
    throw new Error(errorText);
  }
  return response.status === 204 ? null : response.json();
};

export const createTaskLatticeGuardCall = (
  accessToken: string,
  input: { endpoint: string; secret: string },
) => taskLatticeGuardRequest(accessToken, "POST", "/guardrails/tasklattice", input);

export const updateTaskLatticeGuardCall = (
  accessToken: string,
  guardrailId: string,
  input: TaskLatticeGuardInput,
) => taskLatticeGuardRequest(
  accessToken,
  "PATCH",
  `/guardrails/tasklattice/${encodeURIComponent(guardrailId)}`,
  input,
);
'''
    networking.write_text(
        networking_source[:insert_at]
        + networking_helpers
        + networking_source[insert_at:],
        encoding="utf-8",
    )

    replace_once(
        add_form,
        'import { createGuardrailCall, getGuardrailProviderSpecificParams, getGuardrailUISettings, modelAvailableCall } from "../networking";',
        'import { createGuardrailCall, createTaskLatticeGuardCall, getGuardrailProviderSpecificParams, getGuardrailUISettings, modelAvailableCall } from "../networking";',
        "TaskLattice create API import",
    )
    replace_once(
        add_form,
        '''  const isToolPermissionProvider = useMemo(() => {
    if (!selectedProvider) {
      return false;
    }
    const providerValue = guardrail_provider_map[selectedProvider];
    return (providerValue || "").toLowerCase() === "tool_permission";
  }, [selectedProvider]);
''',
        '''  const isToolPermissionProvider = useMemo(() => {
    if (!selectedProvider) {
      return false;
    }
    const providerValue = guardrail_provider_map[selectedProvider];
    return (providerValue || "").toLowerCase() === "tool_permission";
  }, [selectedProvider]);

  const isTaskLatticeProvider = useMemo(
    () => Boolean(selectedProvider && guardrail_provider_map[selectedProvider] === "tasklattice_guard"),
    [selectedProvider],
  );
''',
        "TaskLattice provider state",
    )
    replace_once(
        add_form,
        '''    if (value === "BlockCodeExecution") {
      resetValues.confidence_threshold = 0.5;
    }
    form.setFieldsValue(resetValues);
''',
        '''    if (value === "BlockCodeExecution") {
      resetValues.confidence_threshold = 0.5;
    }
    if (guardrail_provider_map[value] === "tasklattice_guard") {
      Object.assign(resetValues, {
        guardrail_name: "TaskLattice Guard",
        mode: ["pre_call", "post_call"],
        default_on: true,
      });
    }
    form.setFieldsValue(resetValues);
''',
        "TaskLattice fixed form policy",
    )
    replace_once(
        add_form,
        '''      // Prepare the guardrail data with proper typings
      const guardrailData: {
''',
        '''      if (guardrailProvider === "tasklattice_guard") {
        if (!accessToken) throw new Error("No access token available");
        await createTaskLatticeGuardCall(accessToken, {
          endpoint: values.endpoint,
          secret: values.secret,
        });
        NotificationsManager.success("TaskLattice Guard connected and active");
        resetForm();
        onSuccess();
        onClose();
        return;
      }

      // Prepare the guardrail data with proper typings
      const guardrailData: {
''',
        "TaskLattice dedicated create flow",
    )
    replace_once(
        add_form,
        '''        <Form.Item
          name="guardrail_name"
          label="Guardrail Name"
          rules={[{ required: true, message: "Please enter a guardrail name" }]}
        >
          <Input placeholder="Enter a name for this guardrail" />
        </Form.Item>

''',
        '''        {!isTaskLatticeProvider && (
          <Form.Item
            name="guardrail_name"
            label="Guardrail Name"
            rules={[{ required: true, message: "Please enter a guardrail name" }]}
          >
            <Input placeholder="Enter a name for this guardrail" />
          </Form.Item>
        )}

''',
        "hide TaskLattice guardrail name",
    )
    replace_once(
        add_form,
        '''        <Form.Item
          name="mode"
          label="Mode"
''',
        '''        {isTaskLatticeProvider && (
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-4 mb-5">
            <div className="flex items-start gap-3">
              <img
                src="../ui/assets/logos/tasklattice_guard.svg"
                alt="TaskLattice Guard"
                className="h-9 w-9 rounded-md"
              />
              <div>
                <div className="font-medium text-slate-900">Connect TaskLattice Guard</div>
                <div className="text-sm text-slate-600 mt-1">
                  Enter the Integration URL and its one-time Secret. Input and output protection,
                  always-on enforcement, and fail-closed behavior are applied automatically.
                </div>
              </div>
            </div>
          </div>
        )}

        {isTaskLatticeProvider && (
          <>
            <Form.Item
              name="endpoint"
              label="Endpoint"
              rules={[
                { required: true, message: "Enter the TaskLattice Integration Endpoint" },
                { type: "url", message: "Enter a valid HTTP(S) URL" },
              ]}
              extra="Use the base URL ending in /runtime/v1/integrations/{uuid}."
            >
              <Input placeholder="https://guard.example/runtime/v1/integrations/..." autoComplete="url" />
            </Form.Item>
            <Form.Item
              name="secret"
              label="Secret"
              rules={[{ required: true, message: "Enter the Integration Secret" }]}
              extra="Stored encrypted in LiteLLM Credentials. It is never displayed again."
            >
              <Input.Password placeholder="tali_integration_..." autoComplete="new-password" />
            </Form.Item>
          </>
        )}

        {!isTaskLatticeProvider && <Form.Item
          name="mode"
          label="Mode"
''',
        "TaskLattice two-field connection UI",
    )
    replace_once(
        add_form,
        '''          </Select>
        </Form.Item>

        <Form.Item
          name="default_on"
''',
        '''          </Select>
        </Form.Item>}

        {!isTaskLatticeProvider && <Form.Item
          name="default_on"
''',
        "close hidden TaskLattice mode",
    )
    replace_once(
        add_form,
        '''          </Select>
        </Form.Item>

        <Form.Item
          name="skip_system_message_choice"
''',
        '''          </Select>
        </Form.Item>}

        {!isTaskLatticeProvider && <Form.Item
          name="skip_system_message_choice"
''',
        "close hidden TaskLattice default",
    )
    replace_once(
        add_form,
        '''          </Select>
        </Form.Item>

        <Form.Item
          name="skip_tool_message_choice"
''',
        '''          </Select>
        </Form.Item>}

        {!isTaskLatticeProvider && <Form.Item
          name="skip_tool_message_choice"
''',
        "close hidden TaskLattice system toggle",
    )
    replace_once(
        add_form,
        '''          </Select>
        </Form.Item>

        {/* Use the GuardrailProviderFields component to render provider-specific fields */}
''',
        '''          </Select>
        </Form.Item>}

        {/* Use the GuardrailProviderFields component to render provider-specific fields */}
''',
        "close hidden TaskLattice tool toggle",
    )
    replace_once(
        add_form,
        '''        {!isToolPermissionProvider && !shouldRenderContentFilterConfigSettings(selectedProvider) && !shouldRenderLLMJudgeFields(selectedProvider) && (
''',
        '''        {!isTaskLatticeProvider && !isToolPermissionProvider && !shouldRenderContentFilterConfigSettings(selectedProvider) && !shouldRenderLLMJudgeFields(selectedProvider) && (
''',
        "hide generic TaskLattice provider fields",
    )
    replace_once(
        add_form,
        '''    const totalSteps = shouldRenderContentFilterConfigSettings(selectedProvider) ? 5 : 2;
''',
        '''    const totalSteps = isTaskLatticeProvider
      ? 1
      : shouldRenderContentFilterConfigSettings(selectedProvider)
        ? 5
        : 2;
''',
        "single-step TaskLattice button state",
    )
    replace_once(
        add_form,
        '''  const getStepConfigs = () => {
    if (shouldRenderContentFilterConfigSettings(selectedProvider)) {
''',
        '''  const getStepConfigs = () => {
    if (isTaskLatticeProvider) {
      return [{ title: "Connect TaskLattice Guard", optional: false }];
    }
    if (shouldRenderContentFilterConfigSettings(selectedProvider)) {
''',
        "single-step TaskLattice form",
    )
    replace_once(
        add_form,
        '''            <Button type="primary" onClick={handleSubmit} loading={loading}>
              Create Guardrail
            </Button>
''',
        '''            <Button type="primary" onClick={handleSubmit} loading={loading}>
              {isTaskLatticeProvider ? "Verify & connect" : "Create Guardrail"}
            </Button>
''',
        "TaskLattice connect CTA",
    )

    replace_once(
        info_view,
        '''  updateGuardrailCall,
} from "@/components/networking";
''',
        '''  updateGuardrailCall,
  updateTaskLatticeGuardCall,
} from "@/components/networking";
''',
        "TaskLattice update API import",
    )
    replace_once(
        info_view,
        '''      // Prepare update data object - only include changed fields
      const updateData: any = {
''',
        '''      if (guardrailData.litellm_params?.guardrail === "tasklattice_guard") {
        const updateData: { endpoint?: string; secret?: string } = {};
        const endpoint = values.endpoint?.trim();
        const secret = values.secret?.trim();
        if (endpoint && endpoint !== guardrailData.litellm_params?.api_base) {
          updateData.endpoint = endpoint;
        }
        if (secret) updateData.secret = secret;
        if (Object.keys(updateData).length === 0) {
          NotificationsManager.info("No changes detected");
          setIsEditing(false);
          return;
        }
        await updateTaskLatticeGuardCall(accessToken, guardrailId, updateData);
        NotificationsManager.success("TaskLattice Guard verified and updated");
        await fetchGuardrailInfo();
        form.setFieldValue("secret", "");
        setIsEditing(false);
        return;
      }

      // Prepare update data object - only include changed fields
      const updateData: any = {
''',
        "TaskLattice dedicated update flow",
    )
    replace_once(
        info_view,
        '''                {isEditing ? (
                  <Form
''',
        '''                {isEditing ? (
                  guardrailData.litellm_params?.guardrail === "tasklattice_guard" ? (
                    <Form
                      form={form}
                      onFinish={handleGuardrailUpdate}
                      initialValues={{
                        endpoint: guardrailData.litellm_params?.api_base,
                        secret: "",
                      }}
                      layout="vertical"
                    >
                      <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-4 mb-5">
                        <div className="flex items-start gap-3">
                          <img
                            src="../ui/assets/logos/tasklattice_guard.svg"
                            alt="TaskLattice Guard"
                            className="h-9 w-9 rounded-md"
                          />
                          <div>
                            <div className="font-medium text-slate-900">TaskLattice Guard connection</div>
                            <div className="text-sm text-slate-600 mt-1">
                              Changes are verified and applied immediately. No LiteLLM restart is required.
                            </div>
                          </div>
                        </div>
                      </div>
                      <Form.Item
                        label="Endpoint"
                        name="endpoint"
                        rules={[
                          { required: true, message: "Enter the TaskLattice Integration Endpoint" },
                          { type: "url", message: "Enter a valid HTTP(S) URL" },
                        ]}
                        extra="Changing the Endpoint requires entering its Secret again."
                      >
                        <Input autoComplete="url" />
                      </Form.Item>
                      <Form.Item
                        label="Secret"
                        name="secret"
                        extra="Leave blank to keep the encrypted Secret. Enter a new value to rotate it."
                      >
                        <Input.Password placeholder="Leave blank to keep the current Secret" autoComplete="new-password" />
                      </Form.Item>
                      <div className="flex justify-end gap-2 mt-6">
                        <Button onClick={() => setIsEditing(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit">Verify & connect</Button>
                      </div>
                    </Form>
                  ) : (
                  <Form
''',
        "TaskLattice dedicated settings form",
    )
    replace_once(
        info_view,
        '''                  </Form>
                ) : (
                  <div className="space-y-4">
''',
        '''                  </Form>
                  )
                ) : (
                  <div className="space-y-4">
''',
        "close TaskLattice settings branch",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/app"))
    args = parser.parse_args()
    try:
        version = importlib.metadata.version("litellm")
    except importlib.metadata.PackageNotFoundError:
        # Host-only dry runs can opt into the reviewed version explicitly.
        version = os.environ.get("TASKLATTICE_LITELLM_SOURCE_VERSION", "missing")
    if version != EXPECTED_VERSION:
        raise RuntimeError(
            f"Refusing to patch LiteLLM {version}; reviewed version is {EXPECTED_VERSION}"
        )
    app_root = args.root.resolve()
    version_dir = Path(__file__).resolve().parent
    copy_overlay(version_dir, app_root)
    patch_backend(app_root)
    patch_ui(app_root)
    print(f"Applied TaskLattice Guard overlay to LiteLLM {version}")


if __name__ == "__main__":
    main()
