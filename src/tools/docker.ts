import Docker from "dockerode";
import type { Container, ImageInfo } from "dockerode";
import { URL } from "node:url";

/**
 * Docker Network Management Tools
 *
 * This module provides comprehensive Docker container and network management capabilities:
 *
 * 1. Container Management:
 *    - Start containers with port bindings and network settings
 *    - Execute commands in running containers
 *    - Stop and remove containers
 *    - Get current container information
 *    - Restart containers with new port bindings
 *
 * 2. Network Management:
 *    - List available Docker networks
 *    - Create new networks
 *    - Connect/disconnect containers to/from networks
 *
 * 3. Port Binding Examples:
 *    - When starting a container:
 *      ports: [{ hostPort: 8080, containerPort: 80, protocol: "tcp" }]
 *    - When restarting with new ports:
 *      Use docker.restartWithPorts to modify existing container port bindings
 *
 * 4. Network Examples:
 *    - Create custom network: docker.createNetwork({ name: "myapp-network" })
 *    - Connect container: docker.connectToNetwork({ containerId: "abc123", networkName: "myapp-network" })
 *    - Start container on specific network: { network: "myapp-network" } in startContainer options
 */

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: Array<{
    hostPort?: number;
    containerPort: number;
    protocol: string;
  }>;
  networks: string[];
  created: string;
}

export interface StartContainerInput {
  image: string;
  cmd?: string[];
  name?: string;
  workdir?: string;
  env?: Record<string, string>;
  volumes?: Array<{
    hostPath: string;
    containerPath: string;
    mode?: "ro" | "rw";
  }>;
  ports?: Array<{
    hostPort: number;
    containerPort: number;
    protocol?: "tcp" | "udp";
  }>;
  network?: string;
}

export interface ExecInContainerInput {
  containerId: string;
  cmd: string[];
  workdir?: string;
  timeout?: number;
  background?: boolean;
}

export interface StopContainerInput {
  containerId: string;
  remove?: boolean;
}

export interface ModifyContainerNetworkInput {
  containerId: string;
  ports?: Array<{
    hostPort: number;
    containerPort: number;
    protocol?: "tcp" | "udp";
  }>;
  networks?: Array<{
    name: string;
    aliases?: string[];
  }>;
}

export interface GetCurrentContainerInput {
  // No input needed - will auto-detect current container
}

export interface ConnectToNetworkInput {
  containerId: string;
  networkName: string;
  aliases?: string[];
}

const DEBUG =
  process.env.DEBUG === "1" || process.env.DEBUG?.toLowerCase() === "true";

let docker: Docker | null = null;

// Managed containers registry for this process session
const SESSION_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
const managedContainerIds: Set<string> = new Set();

export function getManagedContainers(): string[] {
  return Array.from(managedContainerIds);
}

function dlog(...args: unknown[]) {
  if (DEBUG) console.log("[docker]", ...args);
}

function getDockerClient(): Docker {
  if (docker) return docker;
  const host = process.env.DOCKER_HOST;
  if (!host) {
    throw new Error(
      "DOCKER_HOST is not set. Set DOCKER_HOST to npipe://./pipe/docker_engine (Windows), unix:///var/run/docker.sock (Linux/macOS), or http(s)://host:port."
    );
  }
  try {
    if (host.startsWith("npipe://") || host.startsWith("npipe:////")) {
      // Windows named pipe. Accept both npipe://./pipe/docker_engine and npipe:////./pipe/docker_engine
      const cleaned = host.replace("npipe:////", "").replace("npipe://", "");
      const socketPath = cleaned.startsWith("//") ? cleaned : `//${cleaned}`;
      dlog("Using Windows npipe socket", socketPath);
      docker = new Docker({ socketPath });
      return docker;
    }
    if (host.startsWith("unix://")) {
      // Unix domain socket
      const socketPath = host.replace("unix://", "");
      dlog("Using unix socket", socketPath);
      docker = new Docker({ socketPath });
      return docker;
    }
    const u = new URL(host);
    const proto = u.protocol.replace(":", "");
    const protocol =
      proto === "https" || proto === "http" || proto === "ssh"
        ? (proto as "https" | "http" | "ssh")
        : undefined;
    const port = u.port ? parseInt(u.port, 10) : 2375;
    dlog("Using TCP", { protocol, host: u.hostname, port });
    docker = new Docker({ protocol, host: u.hostname, port });
    return docker;
  } catch {
    dlog(
      "Failed to parse DOCKER_HOST, falling back to dockerode autodetect",
      process.env.DOCKER_HOST
    );
    // Fallback to autodetect if DOCKER_HOST is malformed
    docker = new Docker();
    return docker;
  }
}

export async function startContainer(options: StartContainerInput) {
  const binds = (options.volumes || []).map(
    (v) => `${v.hostPath}:${v.containerPath}${v.mode ? `:${v.mode}` : ""}`
  );
  const env = options.env
    ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`)
    : undefined;

  // Handle port bindings
  const portBindings: Record<string, Array<{ HostPort: string }>> = {};
  const exposedPorts: Record<string, {}> = {};

  if (options.ports) {
    for (const port of options.ports) {
      const containerPort = `${port.containerPort}/${port.protocol || "tcp"}`;
      portBindings[containerPort] = [{ HostPort: port.hostPort.toString() }];
      exposedPorts[containerPort] = {};
    }
  }

  dlog("startContainer", {
    image: options.image,
    binds,
    workdir: options.workdir,
    ports: options.ports,
    network: options.network,
  });
  await pullImageIfNeeded(options.image);

  let container: Container;
  try {
    container = await getDockerClient().createContainer({
      Image: options.image,
      name: options.name,
      Tty: true,
      WorkingDir: options.workdir,
      Env: env,
      ExposedPorts: exposedPorts,
      Labels: {
        "ai-container.managed": "true",
        "ai-container.session": SESSION_ID,
      },
      HostConfig: {
        Binds: binds,
        PortBindings: portBindings,
        NetworkMode: options.network,
      },
      Cmd: options.cmd,
    });
  } catch (err) {
    dlog("createContainer failed", err);
    throw err;
  }

  try {
    await container.start();
  } catch (err) {
    dlog("container.start failed", err);
    throw err;
  }
  // Track managed container
  managedContainerIds.add(container.id);
  const inspection = await container.inspect();
  return {
    id: container.id,
    name: inspection.Name,
    state: inspection.State,
    mounts: inspection.Mounts,
  };
}

export async function execInContainer({
  containerId,
  cmd,
  workdir,
  timeout = 120000, // 2 minutes default timeout
  background = false,
}: ExecInContainerInput) {
  dlog("execInContainer", { containerId, cmd, workdir, timeout, background });
  const container: Container = getDockerClient().getContainer(containerId);

  // For background processes, we need to track PIDs
  if (background || cmd.join(" ").includes("&")) {
    // For background processes, use nohup and detach properly
    const backgroundCmd = ["nohup", "sh", "-c", `${cmd.join(" ")} > /dev/null 2>&1 & echo $!`];
    
    const exec = await container.exec({
      Cmd: backgroundCmd,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: workdir,
    });

    const stream = await exec.start({});
    const output = await streamToString(stream);
    
    // The output should contain the PID of the background process
    let pid: number | undefined;
    const pidMatch = output.trim().split("\n").pop();
    if (pidMatch && !isNaN(parseInt(pidMatch))) {
      pid = parseInt(pidMatch);
    }

    // For background processes, return immediately with the PID
    return { 
      output: `Background process started with PID ${pid}. Use exec.getProcessLogs with PID to check status.`, 
      pid, 
      isBackground: true 
    };
  }

  // For regular commands with timeout
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    WorkingDir: workdir,
  });

  const stream = await exec.start({});

  try {
    const output = await Promise.race([
      streamToString(stream),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`TIMEOUT_${timeout}`)), timeout)
      ),
    ]);
    return { output };
  } catch (error) {
    const err = error as Error;
    if (err.message.startsWith("TIMEOUT_")) {
      // Command timed out - likely a continuous process
      // Try to get partial output and PID
      let partialOutput = "";
      let pid: number | undefined;

      try {
        // Get any output that was captured so far
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        await new Promise((resolve) => setTimeout(resolve, 100)); // Brief wait for data
        partialOutput = Buffer.concat(chunks).toString();
      } catch (e) {
        // Ignore partial output collection failures
      }

      // Try to find the PID of the running process
      try {
        const pidExec = await container.exec({
          Cmd: ["pgrep", "-f", cmd.join(" ")],
          AttachStdout: true,
          AttachStderr: false,
          Tty: false,
        });
        const pidStream = await pidExec.start({});
        const pidOutput = await streamToString(pidStream);
        const pidMatch = pidOutput.trim().split("\n").pop();
        if (pidMatch && !isNaN(parseInt(pidMatch))) {
          pid = parseInt(pidMatch);
        }
      } catch (e) {
        // Ignore PID lookup failures
      }

      // Try to get process info if we have a PID
      if (pid) {
        try {
          const psExec = await container.exec({
            Cmd: [
              "ps",
              "-p",
              pid.toString(),
              "-o",
              "pid,ppid,cmd",
              "--no-headers",
            ],
            AttachStdout: true,
            AttachStderr: false,
            Tty: false,
          });
          const psStream = await psExec.start({});
          const processInfo = await streamToString(psStream);
          if (processInfo.trim()) {
            partialOutput += "\n\n🔍 Process Status:\n" + processInfo.trim();
          }
        } catch (e) {
          // Ignore process info failures
        }
      }

      return {
        output:
          partialOutput ||
          "Process started but timed out waiting for completion",
        pid,
        timedOut: true,
        timeout,
        isLongRunning: true,
      };
    }
    throw error;
  }
}

export async function stopContainer({
  containerId,
  remove,
}: StopContainerInput) {
  dlog("stopContainer", { containerId, remove });
  const container: Container = getDockerClient().getContainer(containerId);
  try {
    await container.stop({ t: 2 });
  } catch {}
  if (remove) {
    try {
      await container.remove({ force: true });
    } catch {}
  }
  // Deregister if it was tracked
  managedContainerIds.delete(containerId);
  return { ok: true };
}

async function pullImageIfNeeded(image: string) {
  dlog("pullImageIfNeeded", { image });
  const images: ImageInfo[] = await getDockerClient().listImages();
  const exists = images.some((img: ImageInfo) =>
    (img.RepoTags || []).includes(image)
  );
  if (!exists) {
    console.log(`[docker] pulling image ${image} ...`);
    await new Promise<void>((resolve, reject) => {
      getDockerClient().pull(
        image,
        (err: unknown, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err as Error);
          getDockerClient().modem.followProgress(
            stream,
            (err2: unknown) => {
              if (err2) return reject(err2 as Error);
              console.log(`[docker] pulled image ${image}`);
              resolve();
            },
            (evt: any) => {
              const id = evt?.id ? ` ${evt.id}` : "";
              const status = evt?.status ?? "";
              const progress = evt?.progress ?? "";
              if (status) {
                console.log(`[docker]${id} ${status} ${progress}`.trim());
              }
            }
          );
        }
      );
    });
  }
}

export async function verifyDockerConnection() {
  dlog("verifyDockerConnection", { DOCKER_HOST: process.env.DOCKER_HOST });
  try {
    const client = getDockerClient();
    await client.ping();
    const v: any = await client.version();
    dlog("docker.version", v);
    return {
      ok: true,
      version: v?.Version,
      apiVersion: v?.ApiVersion,
    } as const;
  } catch (err) {
    dlog("docker.ping/version failed", err);
    throw err;
  }
}

export async function getCurrentContainer(): Promise<{
  id: string;
  name: string;
  networks: Record<string, any>;
  ports: Array<{ hostPort: number; containerPort: number; protocol: string }>;
} | null> {
  dlog("getCurrentContainer - attempting to detect current container");
  try {
    const containers = await getDockerClient().listContainers();

    // Try to find current container by checking if we're running inside one
    // Look for container that has our process running
    const hostname = process.env.HOSTNAME;
    if (hostname) {
      for (const containerInfo of containers) {
        if (
          containerInfo.Id.startsWith(hostname) ||
          containerInfo.Names.some((name) => name.includes(hostname))
        ) {
          const container = getDockerClient().getContainer(containerInfo.Id);
          const inspection = await container.inspect();

          // Extract port mappings
          const ports: Array<{
            hostPort: number;
            containerPort: number;
            protocol: string;
          }> = [];
          if (inspection.NetworkSettings?.Ports) {
            for (const [containerPort, hostBindings] of Object.entries(
              inspection.NetworkSettings.Ports
            )) {
              if (hostBindings) {
                for (const binding of hostBindings as any[]) {
                  const [port, protocol] = containerPort.split("/");
                  if (port) {
                    ports.push({
                      hostPort: parseInt(binding.HostPort),
                      containerPort: parseInt(port),
                      protocol: protocol || "tcp",
                    });
                  }
                }
              }
            }
          }

          return {
            id: containerInfo.Id,
            name: inspection.Name,
            networks: inspection.NetworkSettings?.Networks || {},
            ports,
          };
        }
      }
    }

    // Fallback: if we can't detect, return null
    dlog("Could not detect current container");
    return null;
  } catch (err) {
    dlog("getCurrentContainer failed", err);
    throw err;
  }
}

export async function connectToNetwork({
  containerId,
  networkName,
  aliases,
}: ConnectToNetworkInput) {
  dlog("connectToNetwork", { containerId, networkName, aliases });
  try {
    const network = getDockerClient().getNetwork(networkName);
    await network.connect({
      Container: containerId,
      EndpointConfig: {
        Aliases: aliases,
      },
    });
    return {
      ok: true,
      message: `Connected container ${containerId} to network ${networkName}`,
    };
  } catch (err) {
    dlog("connectToNetwork failed", err);
    throw err;
  }
}

export async function disconnectFromNetwork(
  containerId: string,
  networkName: string
) {
  dlog("disconnectFromNetwork", { containerId, networkName });
  try {
    const network = getDockerClient().getNetwork(networkName);
    await network.disconnect({ Container: containerId });
    return {
      ok: true,
      message: `Disconnected container ${containerId} from network ${networkName}`,
    };
  } catch (err) {
    dlog("disconnectFromNetwork failed", err);
    throw err;
  }
}

export async function listNetworks() {
  dlog("listNetworks");
  try {
    const networks = await getDockerClient().listNetworks();
    return networks.map((network) => ({
      id: network.Id,
      name: network.Name,
      driver: network.Driver,
      scope: network.Scope,
      created: network.Created,
      containers: Object.keys(network.Containers || {}).length,
    }));
  } catch (err) {
    dlog("listNetworks failed", err);
    throw err;
  }
}

export async function createNetwork(name: string, driver: string = "bridge") {
  dlog("createNetwork", { name, driver });
  try {
    const network = await getDockerClient().createNetwork({
      Name: name,
      Driver: driver,
    });
    return {
      ok: true,
      id: network.id,
      message: `Created network ${name} with driver ${driver}`,
    };
  } catch (err) {
    dlog("createNetwork failed", err);
    throw err;
  }
}

export async function restartContainerWithPorts({
  containerId,
  ports,
}: {
  containerId: string;
  ports: Array<{
    hostPort: number;
    containerPort: number;
    protocol?: "tcp" | "udp";
  }>;
}) {
  dlog("restartContainerWithPorts", { containerId, ports });

  try {
    // Get current container information
    const container = getDockerClient().getContainer(containerId);
    const inspection = await container.inspect();

    // Stop the current container
    await container.stop({ t: 2 });

    // Prepare new port bindings
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    const exposedPorts: Record<string, {}> = {};

    if (ports) {
      for (const port of ports) {
        const containerPort = `${port.containerPort}/${port.protocol || "tcp"}`;
        portBindings[containerPort] = [{ HostPort: port.hostPort.toString() }];
        exposedPorts[containerPort] = {};
      }
    }

    // Create new container with updated port bindings
    const newContainer = await getDockerClient().createContainer({
      Image: inspection.Config.Image,
      name: `${inspection.Name}_updated`,
      Tty: inspection.Config.Tty,
      WorkingDir: inspection.Config.WorkingDir,
      Env: inspection.Config.Env,
      Cmd: inspection.Config.Cmd,
      Labels: {
        ...(inspection.Config.Labels || {}),
        "ai-container.managed": "true",
        "ai-container.session": SESSION_ID,
      },
      ExposedPorts: { ...inspection.Config.ExposedPorts, ...exposedPorts },
      HostConfig: {
        ...inspection.HostConfig,
        PortBindings: {
          ...inspection.HostConfig.PortBindings,
          ...portBindings,
        },
      },
    });

    // Start the new container
    await newContainer.start();

    // Remove the old container
    await container.remove({ force: true });

    // Update registry: replace old ID with new one
    managedContainerIds.delete(containerId);
    managedContainerIds.add(newContainer.id);

    const newInspection = await newContainer.inspect();
    return {
      ok: true,
      id: newContainer.id,
      name: newInspection.Name,
      message: `Restarted container with new port bindings`,
    };
  } catch (err) {
    dlog("restartContainerWithPorts failed", err);
    throw err;
  }
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stream.on("data", (chunk) => {
      data += chunk.toString();
    });
    stream.on("end", () => resolve(data));
    stream.on("error", reject);
  });
}

export async function stopAllManagedContainers(options?: {
  excludeIds?: string[];
  remove?: boolean;
}): Promise<{ stopped: string[] }> {
  const exclude = new Set(options?.excludeIds || []);
  const toStop = Array.from(managedContainerIds).filter(
    (id) => !exclude.has(id)
  );
  const stopped: string[] = [];
  for (const id of toStop) {
    try {
      await stopContainer({ containerId: id, remove: options?.remove ?? true });
      stopped.push(id);
    } catch (err) {
      dlog("stopAllManagedContainers: failed to stop", id, err);
      // continue
    }
  }
  return { stopped };
}

export async function getContainers(options?: {
  all?: boolean;
  filters?: Record<string, string[]>;
}): Promise<{ success: boolean; containers?: ContainerInfo[]; error?: string }> {
  try {
    const docker = getDockerClient();
    const containers = await docker.listContainers({
      all: options?.all ?? false,
      filters: options?.filters
    });

    const containerInfos: ContainerInfo[] = containers.map((container) => {
      // Extract port information
      const ports = (container.Ports || []).map((port) => ({
        hostPort: port.PublicPort,
        containerPort: port.PrivatePort,
        protocol: port.Type || 'tcp'
      }));

      // Extract network information
      const networks = Object.keys(container.NetworkSettings?.Networks || {});

      // Get container name (remove leading slash)
      const name = (container.Names?.[0] || '').replace(/^\//, '');

      return {
        id: container.Id,
        name,
        image: container.Image,
        status: container.Status,
        state: container.State,
        ports,
        networks,
        created: new Date(container.Created * 1000).toISOString()
      };
    });

    return {
      success: true,
      containers: containerInfos
    };
  } catch (error: any) {
    dlog("getContainers error:", error);
    return {
      success: false,
      error: `Failed to get containers: ${error.message}`
    };
  }
}
