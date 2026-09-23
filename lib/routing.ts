export type RoutingContext = {
  country?: string | null;
  region?: string | null;
  city?: string | null;
  device?: string | null;
  localHour?: number;
};

export type RoutingRule = {
  id?: string;
  enabled?: boolean;
  priority?: number;
  destinationUrl: string;
  conditions?: {
    country?: string;
    region?: string;
    city?: string;
    device?: string;
    hourFrom?: number;
    hourTo?: number;
  };
  trafficPercent?: number;
};

function stableBucket(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

function matches(rule: RoutingRule, context: RoutingContext) {
  const c = rule.conditions || {};
  if (c.country && c.country.toLowerCase() !== context.country?.toLowerCase()) return false;
  if (c.region && c.region.toLowerCase() !== context.region?.toLowerCase()) return false;
  if (c.city && c.city.toLowerCase() !== context.city?.toLowerCase()) return false;
  if (c.device && c.device.toLowerCase() !== context.device?.toLowerCase()) return false;
  if (typeof c.hourFrom === "number" && typeof context.localHour === "number" && context.localHour < c.hourFrom) return false;
  if (typeof c.hourTo === "number" && typeof context.localHour === "number" && context.localHour >= c.hourTo) return false;
  return true;
}

export function applyRouting(baseUrl: string, rules: unknown, context: RoutingContext, visitorId: string) {
  if (!Array.isArray(rules) || rules.length === 0) return { url: baseUrl, ruleId: null };
  const ordered = (rules as RoutingRule[])
    .filter(rule => rule?.enabled !== false && Boolean(rule?.destinationUrl))
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  for (const rule of ordered) {
    if (!matches(rule, context)) continue;
    const traffic = Math.max(0, Math.min(100, rule.trafficPercent ?? 100));
    if (stableBucket(`${visitorId}:${rule.id || rule.destinationUrl}`) >= traffic) continue;
    return { url: rule.destinationUrl, ruleId: rule.id || null };
  }
  return { url: baseUrl, ruleId: null };
}
