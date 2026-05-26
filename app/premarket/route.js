import { renderPremarketResponse } from "@/lib/premarket-route-response";

export async function GET(request) {
  return renderPremarketResponse(request);
}
