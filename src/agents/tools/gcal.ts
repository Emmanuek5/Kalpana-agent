import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  isCalendarLinked,
  linkCalendarAccount,
  unlinkCalendarAccount,
  listCalendars,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  quickAdd,
} from "../../tools/gcal";
import { createSafeToolWrapper } from "../safeToolWrapper";

export function buildGCalTools() {
  return {
    "gcal.isLinked": tool<{}, any>({
      description:
        "Check if Google Calendar account is linked and token is valid.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gcal.isLinked", async () => {
        return await isCalendarLinked();
      }),
    }),

    "gcal.linkAccount": tool<{}, any>({
      description:
        "Start OAuth flow to link Google Calendar account. Returns authorization URL.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gcal.linkAccount", async () => {
        return await linkCalendarAccount();
      }),
    }),

    "gcal.unlinkAccount": tool<{}, any>({
      description:
        "Unlink the connected Google Calendar account and remove stored tokens.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gcal.unlinkAccount", async () => {
        return await unlinkCalendarAccount();
      }),
    }),

    "gcal.listCalendars": tool<{}, any>({
      description: "List calendars available in the user's Google account.",
      inputSchema: zodSchema(z.object({})),
      execute: createSafeToolWrapper("gcal.listCalendars", async () => {
        return await listCalendars();
      }),
    }),

    "gcal.listEvents": tool<
      {
        calendarId?: string;
        timeMin?: string;
        timeMax?: string;
        maxResults?: number;
        q?: string;
        singleEvents?: boolean;
        orderBy?: "startTime" | "updated";
      },
      any
    >({
      description: "List events for a calendar within an optional time window.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z
            .string()
            .optional()
            .describe("Calendar ID (default: primary)"),
          timeMin: z.string().optional().describe("ISO start time filter"),
          timeMax: z.string().optional().describe("ISO end time filter"),
          maxResults: z
            .number()
            .optional()
            .describe("Max events to return (default: 50)"),
          q: z.string().optional().describe("Search query"),
          singleEvents: z
            .boolean()
            .optional()
            .describe("Expand recurring events (default: true)"),
          orderBy: z.enum(["startTime", "updated"]).optional(),
        })
      ),
      execute: createSafeToolWrapper("gcal.listEvents", async (args: any) => {
        return await listEvents(args);
      }),
    }),

    "gcal.createEvent": tool<
      {
        calendarId?: string;
        summary: string;
        description?: string;
        location?: string;
        start: { dateTime?: string; date?: string; timeZone?: string };
        end: { dateTime?: string; date?: string; timeZone?: string };
        attendees?: Array<{ email: string; optional?: boolean }>;
      },
      any
    >({
      description: "Create a new Google Calendar event.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z.string().optional(),
          summary: z.string(),
          description: z.string().optional(),
          location: z.string().optional(),
          start: z.object({
            dateTime: z.string().optional(),
            date: z.string().optional(),
            timeZone: z.string().optional(),
          }),
          end: z.object({
            dateTime: z.string().optional(),
            date: z.string().optional(),
            timeZone: z.string().optional(),
          }),
          attendees: z
            .array(
              z.object({ email: z.string(), optional: z.boolean().optional() })
            )
            .optional(),
        })
      ),
      execute: createSafeToolWrapper("gcal.createEvent", async (args: any) => {
        return await createEvent(args);
      }),
    }),

    "gcal.updateEvent": tool<
      {
        calendarId?: string;
        eventId: string;
        summary?: string;
        description?: string;
        location?: string;
        start?: { dateTime?: string; date?: string; timeZone?: string };
        end?: { dateTime?: string; date?: string; timeZone?: string };
        attendees?: Array<{ email: string; optional?: boolean }>;
      },
      any
    >({
      description: "Update fields on an existing Google Calendar event.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z.string().optional(),
          eventId: z.string(),
          summary: z.string().optional(),
          description: z.string().optional(),
          location: z.string().optional(),
          start: z
            .object({
              dateTime: z.string().optional(),
              date: z.string().optional(),
              timeZone: z.string().optional(),
            })
            .optional(),
          end: z
            .object({
              dateTime: z.string().optional(),
              date: z.string().optional(),
              timeZone: z.string().optional(),
            })
            .optional(),
          attendees: z
            .array(
              z.object({ email: z.string(), optional: z.boolean().optional() })
            )
            .optional(),
        })
      ),
      execute: createSafeToolWrapper("gcal.updateEvent", async (args: any) => {
        return await updateEvent(args);
      }),
    }),

    "gcal.deleteEvent": tool<{ calendarId?: string; eventId: string }, any>({
      description: "Delete a Google Calendar event by ID.",
      inputSchema: zodSchema(
        z.object({ calendarId: z.string().optional(), eventId: z.string() })
      ),
      execute: createSafeToolWrapper("gcal.deleteEvent", async (args: any) => {
        return await deleteEvent(args);
      }),
    }),

    "gcal.quickAdd": tool<{ calendarId?: string; text: string }, any>({
      description:
        "Quick add an event using natural language (e.g., 'Lunch tomorrow 12pm').",
      inputSchema: zodSchema(
        z.object({ calendarId: z.string().optional(), text: z.string() })
      ),
      execute: createSafeToolWrapper("gcal.quickAdd", async (args: any) => {
        return await quickAdd(args);
      }),
    }),
  } as const;
}
