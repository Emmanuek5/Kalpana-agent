import path from "node:path";
import fs from "node:fs/promises";
import { startContainer, stopContainer } from "./tools/docker";

export type SandboxRuntime = "node" | "python";

interface SandboxState {
  containerId: string;
  runtime: SandboxRuntime;
  hostVolumePath: string;
  containerVolumePath: string; // always "/root/workspace"
}

let activeSandbox: SandboxState | null = null;

export function getActiveSandbox(): SandboxState {
  if (!activeSandbox) throw new Error("Sandbox is not initialized");
  return activeSandbox;
}

export function getSandboxInfo(): {
  runtime: SandboxRuntime;
  containerId: string;
} | null {
  if (!activeSandbox) return null;
  return {
    runtime: activeSandbox.runtime,
    containerId: activeSandbox.containerId,
  };
}

export async function switchSandboxRuntime(
  newRuntime: SandboxRuntime,
  hostVolumePath?: string
): Promise<SandboxState> {
  const currentPath = activeSandbox?.hostVolumePath || hostVolumePath;
  if (!currentPath) {
    throw new Error("No host volume path available for sandbox switch");
  }

  // If we already have the correct runtime, return current sandbox
  if (activeSandbox && activeSandbox.runtime === newRuntime) {
    return activeSandbox;
  }

  // Shutdown current sandbox if it exists
  if (activeSandbox) {
    console.log(
      `[sandbox] Switching from ${activeSandbox.runtime} to ${newRuntime} runtime`
    );
    await shutdownSandbox();
  }

  // Launch new sandbox with the desired runtime
  return launchSandbox(newRuntime, currentPath);
}

export async function launchSandbox(
  runtime: SandboxRuntime,
  hostVolumePath: string,
  reuseContainerId?: string
) {
  const absHostPath = path.resolve(hostVolumePath);
  await fs.mkdir(absHostPath, { recursive: true });

  if (reuseContainerId) {
    activeSandbox = {
      containerId: reuseContainerId,
      runtime,
      hostVolumePath: absHostPath,
      containerVolumePath: "/workspace",
    };
    return activeSandbox;
  }

  const image = runtime === "node" ? "node:20-bullseye" : "python:3.11-slim";

  const containerVolumePath = "/root/workspace";

  const { id } = await startContainer({
    image,
    name: undefined,
    workdir: containerVolumePath,
    // Keep the container alive portably across images (tail may not exist on slim)
    cmd: ["/bin/sh", "-lc", "while :; do sleep 3600; done"],
    volumes: [
      {
        hostPath: absHostPath,
        containerPath: containerVolumePath,
        mode: "rw",
      },
    ],
  });

  activeSandbox = {
    containerId: id,
    runtime,
    hostVolumePath: absHostPath,
    containerVolumePath,
  };

  return activeSandbox;
}

export async function shutdownSandbox() {
  if (!activeSandbox) return { ok: true } as const;
  try {
    await stopContainer({
      containerId: activeSandbox.containerId,
      remove: true,
    });
  } finally {
    activeSandbox = null;
  }
  return { ok: true } as const;
}
