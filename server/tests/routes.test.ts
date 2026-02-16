import { describe, expect, it } from "vitest";
import { userRoutes } from "../src/routes/userRoutes";
import { v1LeadRoutes } from "../src/routes/v1LeadRoutes";

const extractPaths = (router: any) =>
  router.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

describe("routes contract", () => {
  it("keeps legacy /me and adds /users/me alias", () => {
    const paths = extractPaths(userRoutes);
    expect(paths.some((p: any) => p.path === "/me" && p.methods.includes("get"))).toBe(true);
    expect(paths.some((p: any) => p.path === "/users/me" && p.methods.includes("get"))).toBe(true);
  });

  it("exposes v1 leads and marketing endpoints", () => {
    const paths = extractPaths(v1LeadRoutes);
    expect(paths.some((p: any) => p.path === "/api/v1/leads" && p.methods.includes("post"))).toBe(true);
    expect(paths.some((p: any) => p.path === "/api/v1/marketing/events" && p.methods.includes("post"))).toBe(true);
    expect(paths.some((p: any) => p.path === "/api/v1/marketing/events" && p.methods.includes("get"))).toBe(true);
  });
});
