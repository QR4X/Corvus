import type {
  PermissionDecision,
  PermissionLevel,
  ToolDefinition,
} from "./types";
import { mark } from "../i18n/tr";

export function evaluatePermission(
  tool: ToolDefinition,
  level: PermissionLevel
): PermissionDecision {

  if (!tool.destructive) {
    return { autoApprove: true };
  }

  if (tool.irreversible) {
    return { autoApprove: false };
  }

  switch (level) {
    case "yolo":

      return { autoApprove: true };
    case "vault":

      return { autoApprove: true };
    case "ask":
    default:

      return { autoApprove: false };
  }
}

export type ToolGate = "auto" | "confirm";

export function decideToolGate(
  tool: ToolDefinition,
  level: PermissionLevel,
  opts: {
    approveAll: boolean;

    approveAllWeb?: boolean;

    apagarVaiPraLixeira?: boolean;
  }
): ToolGate {

  if (tool.network) {
    return level === "yolo" || opts.approveAllWeb === true ? "auto" : "confirm";
  }

  if (tool.irreversible) {
    return level === "yolo" && opts.apagarVaiPraLixeira === true ? "auto" : "confirm";
  }
  if (opts.approveAll) return "auto";
  return evaluatePermission(tool, level).autoApprove ? "auto" : "confirm";
}

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  ask: mark("Ask — confirms every change"),
  vault: mark("Vault — edits freely, deletes ask"),
  yolo: mark("YOLO — runs everything, deletes go to the trash"),
};

export const PERMISSION_ICONS: Record<PermissionLevel, string> = {
  ask: "shield-check",
  vault: "shield-half",
  yolo: "zap",
};
