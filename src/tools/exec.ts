import { execInContainer } from "./docker";
import { getActiveSandbox } from "../sandbox";

export interface ExecCommandInput {
  command: string;
  args?: string[];
  workdir?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface StartServerInput {
  command: string;
  args?: string[];
  port: number;
  env?: Record<string, string>;
  workdir?: string;
  name?: string;
}

export interface StopServerInput {
  name?: string;
  port?: number;
}

// Map to track running server processes
const runningServers = new Map<
  string,
  { containerId: string; port: number; pid?: number }
>();

export async function execCommand({
  command,
  args = [],
  workdir = "/root/workspace",
  env,
  timeout = 30000,
}: ExecCommandInput) {
  const { containerId } = getActiveSandbox();

  // Prepare command array
  const cmd = [command, ...args];

  // Add environment variables if provided
  if (env) {
    const envArray = Object.entries(env).map(
      ([key, value]) => `${key}=${value}`
    );
    cmd.unshift("env", ...envArray);
  }

  try {
    const startTime = Date.now();
    const result = await Promise.race([
      execInContainer({ containerId, cmd, workdir }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Command timed out after ${timeout}ms`)),
          timeout
        )
      ),
    ]);

    const duration = Date.now() - startTime;

    return {
      success: true,
      output: result.output,
      duration,
      command: cmd.join(" "),
    };
  } catch (error) {
    return {
      success: false,
      output: "",
      error: (error as Error).message,
      command: cmd.join(" "),
    };
  }
}

export async function startServer({
  command,
  args = [],
  port,
  env,
  workdir = "/root/workspace",
  name,
}: StartServerInput) {
  const { containerId } = getActiveSandbox();

  // Generate server name if not provided
  const serverName = name || `server-${port}`;

  // Proactively check for port conflicts
  const inUse = await findPidsByPort(port).catch(() => ({
    success: false,
    pids: [] as number[],
  }));
  if (inUse && inUse.success && inUse.pids.length > 0) {
    return {
      success: false,
      message: `Port ${port} is already in use`,
      port,
      pids: inUse.pids,
    } as const;
  }

  // Check if server is already running
  if (runningServers.has(serverName)) {
    return {
      success: false,
      message: `Server ${serverName} is already running`,
      port: runningServers.get(serverName)?.port,
    };
  }

  // Prepare command to run server in background
  const cmd = [
    "sh",
    "-c",
    `nohup ${command} ${args.join(
      " "
    )} > /tmp/${serverName}.log 2>&1 & echo $!`,
  ];

  // Add environment variables if provided
  if (env) {
    const envVars = Object.entries(env)
      .map(([key, value]) => `export ${key}="${value}"`)
      .join("; ");
    cmd[2] = `${envVars}; ${cmd[2]}`;
  }

  try {
    const result = await execInContainer({ containerId, cmd, workdir });
    const pid = parseInt(result.output.trim());

    if (isNaN(pid)) {
      return {
        success: false,
        message: "Failed to start server - could not get process ID",
        output: result.output,
      };
    }

    // Store server info
    runningServers.set(serverName, { containerId, port, pid });

    // Wait a moment and check if process is still running
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const checkResult = await execInContainer({
      containerId,
      cmd: ["ps", "-p", pid.toString()],
    });

    if (!checkResult.output.includes(pid.toString())) {
      runningServers.delete(serverName);

      // Try to get error log
      const logResult = await execInContainer({
        containerId,
        cmd: ["cat", `/tmp/${serverName}.log`],
      });

      return {
        success: false,
        message: "Server failed to start",
        error: logResult.output,
      };
    }

    return {
      success: true,
      message: `Server ${serverName} started successfully`,
      name: serverName,
      port,
      pid,
      logFile: `/tmp/${serverName}.log`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to start server: ${(error as Error).message}`,
    };
  }
}

export async function stopServer({ name, port }: StopServerInput) {
  let serverName = name;

  // If no name provided, try to find by port
  if (!serverName && port) {
    for (const [sName, info] of runningServers.entries()) {
      if (info.port === port) {
        serverName = sName;
        break;
      }
    }
  }

  if (!serverName) {
    return {
      success: false,
      message: "No server name or port specified",
    };
  }

  const serverInfo = runningServers.get(serverName);
  if (!serverInfo) {
    return {
      success: false,
      message: `Server ${serverName} is not running`,
    };
  }

  const { containerId, pid } = serverInfo;

  try {
    // Kill the process
    if (pid) {
      await execInContainer({
        containerId,
        cmd: ["kill", pid.toString()],
      });
    }

    // Remove from tracking
    runningServers.delete(serverName);

    return {
      success: true,
      message: `Server ${serverName} stopped successfully`,
      name: serverName,
    };
  } catch (error) {
    // Remove from tracking even if kill failed (process might already be dead)
    runningServers.delete(serverName);

    return {
      success: true,
      message: `Server ${serverName} stopped (process may have already exited)`,
      warning: (error as Error).message,
    };
  }
}

export async function listServers() {
  const servers = Array.from(runningServers.entries()).map(([name, info]) => ({
    name,
    port: info.port,
    pid: info.pid,
    containerId: info.containerId,
  }));

  return {
    success: true,
    servers,
    count: servers.length,
  };
}

export async function getServerLogs(serverName: string, lines: number = 50) {
  const serverInfo = runningServers.get(serverName);
  if (!serverInfo) {
    return {
      success: false,
      message: `Server ${serverName} is not running`,
    };
  }

  const { containerId } = serverInfo;

  try {
    const result = await execInContainer({
      containerId,
      cmd: ["tail", "-n", lines.toString(), `/tmp/${serverName}.log`],
    });

    return {
      success: true,
      logs: result.output,
      serverName,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to get logs for ${serverName}: ${
        (error as Error).message
      }`,
    };
  }
}

// --- Process management helpers ---

export async function findPidsByPort(port: number): Promise<{
  success: boolean;
  pids: number[];
  method?: string;
  error?: string;
}> {
  const { containerId } = getActiveSandbox();

  function parsePids(text: string): number[] {
    const set = new Set<number>();
    const pidRegex = /pid=(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = pidRegex.exec(text))) {
      set.add(Number(m[1]));
    }
    // netstat format: ... PID/NAME -> capture numbers
    const netstatPidRegex = /\s(\d+)\//g;
    while ((m = netstatPidRegex.exec(text))) {
      set.add(Number(m[1]));
    }
    // Fallback: raw lines that are just PIDs
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => {
        const n = Number(l);
        if (!Number.isNaN(n) && n > 0) set.add(n);
      });
    return Array.from(set.values());
  }

  const portStr = String(port);
  // Try ss
  try {
    const res = await execInContainer({
      containerId,
      cmd: [
        "sh",
        "-lc",
        `ss -lntp 2>/dev/null | grep -E ":${portStr}\\b" || true`,
      ],
    });
    const pids = parsePids(res.output);
    if (pids.length > 0) return { success: true, pids, method: "ss" };
  } catch {}

  // Try netstat
  try {
    const res = await execInContainer({
      containerId,
      cmd: [
        "sh",
        "-lc",
        `netstat -ltnp 2>/dev/null | grep -E ":${portStr}\\b" || true`,
      ],
    });
    const pids = parsePids(res.output);
    if (pids.length > 0) return { success: true, pids, method: "netstat" };
  } catch {}

  // Fallback: /proc scan for LISTEN sockets
  try {
    const hex = port.toString(16).toUpperCase().padStart(4, "0");
    const res = await execInContainer({
      containerId,
      cmd: [
        "sh",
        "-lc",
        // Find processes whose tcp/tcp6 tables have a LISTEN entry on the port
        `for f in /proc/[0-9]*/net/tcp*; do awk 'NR>1 && $4=="0A" && index($2, ":${hex}")>0 {print FILENAME}' "$f"; done | awk -F/ '{print $3}' | sort -u`,
      ],
    });
    const pids = parsePids(res.output);
    return { success: true, pids, method: "/proc" };
  } catch (error) {
    return { success: false, pids: [], error: (error as Error).message };
  }
}

// --- Workspace grep helper ---

export interface GrepWorkspaceOptions {
  pattern: string;
  path?: string; // relative to workspace
  ignoreCase?: boolean;
  maxResults?: number; // lines to return
}

export async function grepWorkspace({
  pattern,
  path = ".",
  ignoreCase = false,
  maxResults = 200,
}: GrepWorkspaceOptions): Promise<{
  success: boolean;
  count: number;
  matches?: Array<{ file: string; line: number; text: string }>;
  raw?: string;
  command: string;
  error?: string;
}> {
  const { containerId } = getActiveSandbox();

  function shEscapeSingleQuotes(input: string): string {
    return `'${input.replace(/'/g, `"'"'`)}'`;
  }

  const grepFlags = ["-R", "-n", "-I"]; // recursive, line numbers, skip binaries
  if (ignoreCase) grepFlags.push("-i");
  const grepCmd = `grep ${grepFlags.join(" ")} -- ${shEscapeSingleQuotes(
    pattern
  )} ${shEscapeSingleQuotes(path)} | head -n ${Math.max(1, maxResults)}`;

  try {
    const { output } = await execInContainer({
      containerId,
      cmd: ["sh", "-lc", grepCmd],
      workdir: "/root/workspace",
    });

    const lines = output
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const matches: Array<{ file: string; line: number; text: string }> = [];
    for (const line of lines) {
      const idx1 = line.indexOf(":");
      const idx2 = idx1 >= 0 ? line.indexOf(":", idx1 + 1) : -1;
      if (idx1 < 0 || idx2 < 0) continue;
      const file = line.slice(0, idx1);
      const lineNumStr = line.slice(idx1 + 1, idx2);
      const text = line.slice(idx2 + 1);
      const lineNum = Number(lineNumStr);
      if (!Number.isNaN(lineNum)) {
        matches.push({ file, line: lineNum, text });
      }
    }

    return {
      success: true,
      count: matches.length,
      matches,
      command: grepCmd,
      raw: matches.length === 0 ? output : undefined,
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      command: grepCmd,
      error: (error as Error).message,
    };
  }
}

export async function killPid({
  pid,
  signal = "TERM",
}: {
  pid: number;
  signal?: string;
}): Promise<{
  success: boolean;
  pid: number;
  signal: string;
  message?: string;
  error?: string;
}> {
  const { containerId } = getActiveSandbox();
  try {
    await execInContainer({
      containerId,
      cmd: [
        "sh",
        "-lc",
        `kill -s ${signal} ${pid} 2>/dev/null || kill -${signal} ${pid}`,
      ],
    });
    return { success: true, pid, signal, message: "Signal sent" };
  } catch (error) {
    return {
      success: false,
      pid,
      signal,
      error: (error as Error).message,
    };
  }
}

export async function freePort({
  port,
  timeoutMs = 3000,
}: {
  port: number;
  timeoutMs?: number;
}): Promise<{
  success: boolean;
  port: number;
  killedPids: number[];
  remainingPids: number[];
  error?: string;
}> {
  const killedPids: number[] = [];
  let found = await findPidsByPort(port);
  if (!found.success) {
    return {
      success: false,
      port,
      killedPids,
      remainingPids: [],
      error: found.error,
    };
  }
  if (found.pids.length === 0) {
    return { success: true, port, killedPids, remainingPids: [] };
  }

  // Try TERM first
  for (const pid of found.pids) {
    const r = await killPid({ pid, signal: "TERM" });
    if (r.success) killedPids.push(pid);
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 200));
    found = await findPidsByPort(port);
    if (found.success && found.pids.length === 0) {
      return { success: true, port, killedPids, remainingPids: [] };
    }
  }

  // Force kill remaining
  if (found.success && found.pids.length > 0) {
    for (const pid of found.pids) {
      await killPid({ pid, signal: "KILL" });
    }
  }

  // Final check
  const final = await findPidsByPort(port);
  const remaining = final.success ? final.pids : [];
  return {
    success: remaining.length === 0,
    port,
    killedPids,
    remainingPids: remaining,
    error:
      remaining.length === 0 ? undefined : "Some processes could not be killed",
  };
}
