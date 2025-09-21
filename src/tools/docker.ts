import Docker from "dockerode";
import type { Container, ImageInfo } from "dockerode";
import { URL } from "node:url";

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
}

export interface StopContainerInput {
  containerId: string;
  remove?: boolean;
}

const DEBUG =
  process.env.DEBUG === "1" || process.env.DEBUG?.toLowerCase() === "true";

let docker: Docker | null = null;

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
}: ExecInContainerInput) {
  dlog("execInContainer", { containerId, cmd, workdir });
  const container: Container = getDockerClient().getContainer(containerId);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
    WorkingDir: workdir,
  });
  const stream = await exec.start({});
  const output = await streamToString(stream);
  return { output };
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
