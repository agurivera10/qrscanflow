import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateV4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224;
}

function isPrivateV6(ip: string) {
  const value = ip.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
}

export async function assertPublicHttpUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP(S) destinations can be checked");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Local destinations are blocked");

  if (isIP(host)) {
    if ((isIP(host) === 4 && isPrivateV4(host)) || (isIP(host) === 6 && isPrivateV6(host))) throw new Error("Private network destinations are blocked");
    return url;
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("Destination did not resolve");
  for (const address of addresses) {
    if ((address.family === 4 && isPrivateV4(address.address)) || (address.family === 6 && isPrivateV6(address.address))) {
      throw new Error("Destination resolves to a private network");
    }
  }
  return url;
}
