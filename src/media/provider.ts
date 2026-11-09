import { LiveKitMediaProvider } from "./livekit";
import type { CloudflareRequest, MediaCallbacks, MediaProvider } from "./types";

// Cloudflare를 붙일 때는 같은 MediaProvider를 구현하고 여기서 선택한다.
export async function createMediaProvider(name: string, callbacks: MediaCallbacks, requestCloudflare: CloudflareRequest): Promise<MediaProvider> {
  if (name === "livekit") return new LiveKitMediaProvider(callbacks);
  if (name === "daily") {
    const { DailyMediaProvider } = await import("./daily");
    return new DailyMediaProvider(callbacks);
  }
  if (name === "cloudflare") {
    const { CloudflareTestMediaProvider } = await import("./cloudflare-test");
    return new CloudflareTestMediaProvider(callbacks, requestCloudflare);
  }
  throw new Error("unsupported_provider");
}
