/*
 * The place facts of a route (FR-4.2, FR-4.4) moved to the facade, which
 * reads the implementations of data/ or of the fixture map/implementations.json.
 * Re-exported for src/lib/server/routes.ts and the canned routes until the
 * route pipeline imports @/lib/catalogue.
 */
export { distanceKm, implementersNearby, whereItRuns, withPlaceFacts, type LocatedImplementation } from "@/lib/catalogue";
