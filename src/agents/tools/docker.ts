import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  startContainer,
  execInContainer,
  stopContainer,
  getCurrentContainer,
  connectToNetwork,
  disconnectFromNetwork,
  listNetworks,
  createNetwork,
  restartContainerWithPorts,
} from "../../tools/docker";
import { createSafeToolWrapper } from "../safeToolWrapper";
import { getSandboxInfo } from "../../sandbox";

export function buildDockerTools() {
  return {
    "docker.start": tool<
      import("../../tools/docker").StartContainerInput,
      unknown
    >({
      description:
        "Start a Docker container with optional volumes, ports, env, and network settings.",
      inputSchema: zodSchema(
        z.object({
          image: z.string(),
          cmd: z.array(z.string()).optional(),
          name: z.string().optional(),
          workdir: z.string().optional(),
          env: z.record(z.string(), z.string()).optional(),
          volumes: z
            .array(
              z.object({
                hostPath: z.string(),
                containerPath: z.string(),
                mode: z.enum(["ro", "rw"] as const).optional(),
              })
            )
            .optional(),
          ports: z
            .array(
              z.object({
                hostPort: z.number(),
                containerPort: z.number(),
                protocol: z.enum(["tcp", "udp"] as const).optional(),
              })
            )
            .optional(),
          network: z.string().optional(),
        })
      ),
      execute: createSafeToolWrapper("docker.start", startContainer as any),
    }),

    "docker.exec": tool<
      import("../../tools/docker").ExecInContainerInput,
      { output: string }
    >({
      description: "Execute a command inside a running container",
      inputSchema: zodSchema(
        z.object({
          containerId: z.string(),
          cmd: z.array(z.string()),
          workdir: z.string().optional(),
        })
      ),
      execute: createSafeToolWrapper("docker.exec", execInContainer as any),
    }),

    "docker.stop": tool<
      import("../../tools/docker").StopContainerInput,
      { ok: boolean }
    >({
      description: "Stop (and optionally remove) a container by id",
      inputSchema: zodSchema(
        z.object({
          containerId: z.string(),
          remove: z.boolean().optional(),
        })
      ),
      execute: createSafeToolWrapper("docker.stop", stopContainer as any),
    }),

    "docker.getCurrentContainer": tool<{}, unknown>({
      description:
        "Get information about the current container the agent is running in, including network settings and port bindings.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("docker.getCurrentContainer", async () => {
        // If running on host with an active sandbox, return that container
        const sandbox = getSandboxInfo();
        if (sandbox) {
          return {
            id: sandbox.containerId,
            name: "sandbox",
            networks: {},
            ports: [],
          };
        }
        // Fallback: attempt to detect current container (if agent itself runs in Docker)
        return await (getCurrentContainer as any)();
      }),
    }),

    "docker.connectToNetwork": tool<
      import("../../tools/docker").ConnectToNetworkInput,
      { ok: boolean; message: string }
    >({
      description:
        "Connect a container to a Docker network with optional aliases.",
      inputSchema: zodSchema(
        z.object({
          containerId: z.string(),
          networkName: z.string(),
          aliases: z.array(z.string()).optional(),
        })
      ),
      execute: createSafeToolWrapper(
        "docker.connectToNetwork",
        connectToNetwork as any
      ),
    }),

    "docker.disconnectFromNetwork": tool<
      { containerId: string; networkName: string },
      { ok: boolean; message: string }
    >({
      description: "Disconnect a container from a Docker network.",
      inputSchema: zodSchema(
        z.object({
          containerId: z.string(),
          networkName: z.string(),
        })
      ),
      execute: createSafeToolWrapper(
        "docker.disconnectFromNetwork",
        async (args) =>
          disconnectFromNetwork(args.containerId, args.networkName)
      ),
    }),

    "docker.listNetworks": tool<{}, unknown>({
      description: "List all Docker networks available on the system.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper(
        "docker.listNetworks",
        listNetworks as any
      ),
    }),

    "docker.createNetwork": tool<
      { name: string; driver?: string },
      { ok: boolean; id: string; message: string }
    >({
      description:
        "Create a new Docker network with specified name and driver (default: bridge).",
      inputSchema: zodSchema(
        z.object({
          name: z.string(),
          driver: z.string().optional(),
        })
      ),
      execute: createSafeToolWrapper("docker.createNetwork", async (args) =>
        createNetwork(args.name, args.driver)
      ),
    }),

    "docker.restartWithPorts": tool<
      {
        containerId: string;
        ports: Array<{
          hostPort: number;
          containerPort: number;
          protocol?: "tcp" | "udp";
        }>;
      },
      { ok: boolean; id: string; name: string; message: string }
    >({
      description:
        "Restart a container with new port bindings. This stops the current container and creates a new one with the specified port mappings.",
      inputSchema: zodSchema(
        z.object({
          containerId: z.string(),
          ports: z.array(
            z.object({
              hostPort: z.number(),
              containerPort: z.number(),
              protocol: z.enum(["tcp", "udp"]).optional(),
            })
          ),
        })
      ),
      execute: createSafeToolWrapper(
        "docker.restartWithPorts",
        restartContainerWithPorts as any
      ),
    }),
  } as const;
}
