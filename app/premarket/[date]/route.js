import { renderPremarketResponse } from "@/lib/premarket-route-response";

export async function GET(request, { params }) {
  const { date } = await params;
  return renderPremarketResponse(request, date);
}
