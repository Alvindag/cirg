/** Great-circle distance between two points in metres (haversine). */
export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A visit counts as verified when the check-in is within this distance of the customer. */
export const GEOFENCE_METRES = 250;

export type GeoVerdict = {
  distanceM: number | null;
  verified: boolean;
  /** Why the visit could not be verified, when it could not. */
  reason?: "no-customer-location" | "no-checkin-location" | "outside-geofence";
};

export function verifyCheckIn(
  checkIn: { latitude: number | null; longitude: number | null },
  customer: { latitude: number | null; longitude: number | null },
  radius = GEOFENCE_METRES
): GeoVerdict {
  if (checkIn.latitude == null || checkIn.longitude == null)
    return { distanceM: null, verified: false, reason: "no-checkin-location" };
  if (customer.latitude == null || customer.longitude == null)
    return { distanceM: null, verified: false, reason: "no-customer-location" };
  const d = Math.round(
    distanceMetres(
      { latitude: checkIn.latitude, longitude: checkIn.longitude },
      { latitude: customer.latitude, longitude: customer.longitude }
    )
  );
  return d <= radius
    ? { distanceM: d, verified: true }
    : { distanceM: d, verified: false, reason: "outside-geofence" };
}
