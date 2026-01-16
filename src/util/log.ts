import dotenv from "dotenv";
dotenv.config();

import { PostHog } from "posthog-node";

const POSTHOG_API_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
console.log("PostHog Key:", POSTHOG_API_KEY);

const client = new PostHog(POSTHOG_API_KEY, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
});

export async function log(message: string): Promise<void> {
  hogLog("Server", message);
  await client.shutdown();
}

function hogLog(type: string, message: string): void {
  var environment = process.env.NODE_ENV || "development";

  if (environment === "production") {
    client.capture({
      distinctId: type || "LOG",
      event: message,
      properties: { button_color: "red" },
    });
  }
  console.log(message);
}


