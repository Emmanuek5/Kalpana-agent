import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  launchSandbox,
  shutdownSandbox,
  switchSandboxRuntime,
  getSandboxInfo,
} from "../../sandbox";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildSandboxTools() {
  return {
    "sandbox.launch": tool<
      {
        runtime: "bun" | "node" | "python";
        hostVolumePath: string;
        reuseContainerId?: string;
      },
      { containerId: string; runtime: string }
    >({
      description:
        "Launch the multi-runtime sandbox container with ALL runtimes pre-installed (Node.js 20, Bun 1.2.22, Python 3.11, UV). Ultra-fast startup with no installation time. All runtimes are available simultaneously in the same container.",
      inputSchema: zodSchema(
        z.object({
          runtime: z.enum(["bun", "node", "python"] as const),
          hostVolumePath: z.string(),
          reuseContainerId: z.string().optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "sandbox.launch",
        async ({ runtime, hostVolumePath, reuseContainerId }) => {
          const s = await launchSandbox(
            runtime,
            hostVolumePath,
            reuseContainerId
          );
          return { containerId: s.containerId, runtime: s.runtime };
        }
      ),
    }),

    "sandbox.info": tool<
      {},
      { runtime: string; containerId: string } | { error: string }
    >({
      description:
        "Get information about the currently active multi-runtime sandbox container. The container has all runtimes available: Node.js, Bun, and Python.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("sandbox.info", async () => {
        const info = getSandboxInfo();
        if (!info) {
          return { error: "No active sandbox container" };
        }
        return { runtime: info.runtime, containerId: info.containerId };
      }),
    }),

    "sandbox.switch": tool<
      { runtime: "bun" | "node" | "python" },
      { containerId: string; runtime: string; switched: boolean }
    >({
      description:
        "Legacy runtime switching tool - NOT NEEDED with multi-runtime container. All runtimes (Node.js, Bun, Python) are available simultaneously. Use sandbox.launch instead for new containers.",
      inputSchema: zodSchema(
        z.object({
          runtime: z.enum(["bun", "node", "python"] as const),
        })
      ),
      execute: createSafeToolWrapper("sandbox.switch", async ({ runtime }) => {
        const currentInfo = getSandboxInfo();
        if (currentInfo && currentInfo.runtime === runtime) {
          return {
            containerId: currentInfo.containerId,
            runtime: currentInfo.runtime,
            switched: false,
          };
        }
        const s = await switchSandboxRuntime(runtime);
        return {
          containerId: s.containerId,
          runtime: s.runtime,
          switched: true,
        };
      }),
    }),

    "sandbox.shutdown": tool<{}, { ok: true }>({
      description: "Stop and remove the active sandbox container.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("sandbox.shutdown", async () => ({
        ok: (await shutdownSandbox()).ok as true,
      })),
    }),
  } as const;
}

