import { NextRequest } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const trackedUrl = `${request.nextUrl.origin}/r/${encodeURIComponent(slug)}`;
  const png = await QRCode.toBuffer(trackedUrl, {
    errorCorrectionLevel: "H",
    margin: 4,
    width: 1024,
    type: "png",
  });

  const headers = new Headers({
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  });
  if (request.nextUrl.searchParams.get("download") === "1") {
    headers.set("Content-Disposition", `attachment; filename="${slug}.png"`);
  }

  return new Response(new Uint8Array(png), { headers });
}
