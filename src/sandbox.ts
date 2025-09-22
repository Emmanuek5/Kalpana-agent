import path from "node:path";
import fs from "node:fs/promises";
import { startContainer, stopContainer, execInContainer } from "./tools/docker";

export type SandboxRuntime = "bun" | "node" | "python";

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

  let image: string;
  // Use single multi-runtime image for all runtimes
  image = "ai-container:multi-runtime";

  const containerVolumePath = "/root/workspace";

  // Check if we're on Windows (Docker Desktop) where host networking doesn't work the same
  const isWindows = process.platform === 'win32';
  
  const containerConfig: any = {
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
  };

  if (isWindows) {
    // On Windows, use explicit port mapping for common development ports
    containerConfig.ports = [
      { hostPort: 3000, containerPort: 3000 },
      { hostPort: 3001, containerPort: 3001 },
      { hostPort: 4000, containerPort: 4000 },
      { hostPort: 5000, containerPort: 5000 },
      { hostPort: 5173, containerPort: 5173 }, // Vite
      { hostPort: 8000, containerPort: 8000 },
      { hostPort: 8080, containerPort: 8080 },
      { hostPort: 8888, containerPort: 8888 }, // Jupyter
      { hostPort: 9000, containerPort: 9000 },
    ];
  } else {
    // On Linux/macOS, use host networking for automatic port access
    containerConfig.network = "host";
  }

  const { id } = await startContainer(containerConfig);

  activeSandbox = {
    containerId: id,
    runtime,
    hostVolumePath: absHostPath,
    containerVolumePath,
  };

  // Verify tools are available (everything is pre-installed)
  await verifyTools(id);

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

// Verify that essential tools are available (everything is pre-installed in multi-runtime image)

// Verify that essential tools are available
async function verifyTools(containerId: string): Promise<void> {
  const commonTools = [
    { cmd: "ps", desc: "process list" },
    { cmd: "curl", desc: "HTTP client" },
  ];

  const networkTools = [
    { cmd: "netstat", desc: "network statistics" },
    { cmd: "ss", desc: "socket statistics" },
  ];

  // Check common tools
  for (const tool of commonTools) {
    try {
      await execInContainer({
        containerId,
        cmd: ["which", tool.cmd],
        workdir: "/",
      });
      console.log(`[sandbox] ✓ ${tool.cmd} available`);
    } catch {
      console.warn(`[sandbox] ✗ ${tool.cmd} not available (${tool.desc})`);
    }
  }

  // Check network tools (at least one should be available)
  let networkToolAvailable = false;
  for (const tool of networkTools) {
    try {
      await execInContainer({
        containerId,
        cmd: ["which", tool.cmd],
        workdir: "/",
      });
      console.log(`[sandbox] ✓ ${tool.cmd} available`);
      networkToolAvailable = true;
    } catch {
      console.warn(`[sandbox] ✗ ${tool.cmd} not available (${tool.desc})`);
    }
  }

  if (!networkToolAvailable) {
    console.warn(`[sandbox] ⚠️ No network monitoring tools available`);
  }

  // Check runtime-specific tools and versions
  await checkRuntimeVersions(containerId);
}

// Check versions of runtime tools
async function checkRuntimeVersions(containerId: string): Promise<void> {
  // Check Bun
  try {
    const bunVersion = await execInContainer({
      containerId,
      cmd: ["bun", "--version"],
      workdir: "/",
    });
    console.log(`[sandbox] Bun version: ${bunVersion.output.trim()}`);
  } catch (error) {
    console.log(`[sandbox] Bun not available`);
  }

  // Check Node.js
  try {
    const nodeVersion = await execInContainer({
      containerId,
      cmd: ["node", "--version"],
      workdir: "/",
    });
    console.log(`[sandbox] Node.js version: ${nodeVersion.output.trim()}`);
  } catch (error) {
    console.log(`[sandbox] Node.js not available`);
  }

  // Check npm
  try {
    const npmVersion = await execInContainer({
      containerId,
      cmd: ["npm", "--version"],
      workdir: "/",
    });
    console.log(`[sandbox] npm version: ${npmVersion.output.trim()}`);
  } catch (error) {
    console.log(`[sandbox] npm not available`);
  }

  // Check Python
  try {
    const pythonVersion = await execInContainer({
      containerId,
      cmd: ["python3", "--version"],
      workdir: "/",
    });
    console.log(`[sandbox] Python version: ${pythonVersion.output.trim()}`);
  } catch (error) {
    // Python not available, which is fine for non-Python runtimes
  }
}
