// Experimental OpenTUI app. Falls back to Ink via bin wrapper if imports fail.
import { runAgent, cleanup as cleanupAgent } from "./agents";
import type { ModelMessage } from "ai";
import { launchSandbox, shutdownSandbox } from "./sandbox";
import { mcpManager } from "./mcp";
import {
  verifyDockerConnection,
  stopAllManagedContainers,
} from "./tools/docker";

export async function startOpenTui(): Promise<void> {
  // Dynamically import OpenTUI to avoid hard requirement
  const opentui = await import("@opentui/react").catch(() => null as any);
  if (!opentui) throw new Error("@opentui/react not installed");

  const { render, Box, Text, Input } = opentui as any;

  let history: ModelMessage[] = [];
  let phase: "initializing" | "ready" | "processing" | "error" | "exiting" =
    "initializing";
  let lastResponse = "";
  let errorMessage = "";

  async function init() {
    try {
      await verifyDockerConnection();
      mcpManager.startLoadingFromConfig().catch(() => {});
      const runtime = "bun";
      const hostVolumePath = process.env.SANDBOX_VOLUME_PATH || "./.sandbox";
      await launchSandbox(runtime, hostVolumePath);
      phase = "ready";
      rerender();
    } catch (e: any) {
      phase = "error";
      errorMessage = `Initialization failed: ${e?.message || String(e)}`;
      rerender();
    }
  }

  async function onSubmit(value: string) {
    if (!value.trim() || phase !== "ready") return;
    phase = "processing";
    lastResponse = "";
    errorMessage = "";
    rerender();
    try {
      const result = await runAgent(value, history, true);
      history = result.messages;
      lastResponse = result.text;
      phase = "ready";
    } catch (e: any) {
      errorMessage = e?.message || String(e);
      phase = "ready";
    }
    rerender();
  }

  async function cleanup() {
    try {
      await shutdownSandbox();
      await stopAllManagedContainers({ remove: true });
      await cleanupAgent();
    } catch {}
  }

  const App = () =>
    Box({
      direction: "column",
      children: [
        Box({
          children: [
            Text({
              color: "cyan",
              bold: true,
              children: "AI Container (OpenTUI Experimental)",
            }),
          ],
        }),
        phase === "initializing" &&
          Box({
            children: [
              Text({ children: "Initializing sandbox and MCP tools..." }),
            ],
          }),
        phase === "error" &&
          Box({
            direction: "column",
            children: [
              Text({
                color: "red",
                bold: true,
                children: "Initialization Error",
              }),
              Text({ children: errorMessage }),
            ],
          }),
        phase !== "initializing" &&
          phase !== "error" &&
          Box({
            direction: "column",
            children: [
              lastResponse &&
                Box({ children: [Text({ children: lastResponse })] }),
              errorMessage &&
                Box({
                  children: [Text({ color: "red", children: errorMessage })],
                }),
              Input({ placeholder: "Type your instruction...", onSubmit }),
            ],
          }),
      ],
    });

  const { unmount } = render(App());
  function rerender() {
    unmount();
    render(App());
  }

  await init();

  // Ensure cleanup on exit signals if OpenTUI exposes hooks
  process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
}
