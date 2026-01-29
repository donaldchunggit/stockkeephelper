export type ParsedTracking = {
  courier: string | null;
  trackingNumber: string | null;
  trackingUrl: string;
};

function clean(s: string) {
  return s.trim();
}

/**
 * Accepts either a URL or a tracking number.
 * Very basic parser — you can extend per courier later.
 */
export function parseTracking(input: string): ParsedTracking {
  const raw = clean(input);

  const isUrl = /^https?:\/\//i.test(raw);
  if (!isUrl) {
    // Treat it as tracking number only
    return {
      courier: null,
      trackingNumber: raw || null,
      trackingUrl: raw ? `https://www.google.com/search?q=${encodeURIComponent(raw + " tracking")}` : ""
    };
  }

  const url = raw;
  const lower = url.toLowerCase();

  let courier: string | null = null;
  if (lower.includes("auspost") || lower.includes("australiapost")) courier = "AusPost";
  else if (lower.includes("sendle")) courier = "Sendle";
  else if (lower.includes("aramex")) courier = "Aramex";
  else if (lower.includes("dhl")) courier = "DHL";
  else if (lower.includes("fedex")) courier = "FedEx";
  else if (lower.includes("ups")) courier = "UPS";

  // naive: attempt to extract a long-ish alphanumeric token from URL
  const token = url.match(/[A-Z0-9]{8,}/i)?.[0] ?? null;

  return { courier, trackingNumber: token, trackingUrl: url };
}
