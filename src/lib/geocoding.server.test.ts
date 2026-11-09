// @ts-nocheck — run with `bun test` (bun:test types are not installed in this project)
import { describe, expect, it, mock, beforeEach } from "bun:test";

const googleGeocode = mock(async (_: { address: string }) => ({
  status: "OK",
  results: [
    {
      formatted_address: "Calle 1, 06100 CDMX, México",
      place_id: "pid",
      geometry: { location: { lat: 19.4, lng: -99.1 } },
      address_components: [{ long_name: "06100", short_name: "06100", types: ["postal_code"] }],
    },
  ],
}));
mock.module("./valinor-proxy.server", () => ({ googleGeocode }));

const { geocodeWithCache, buildGeocodeQuery } = await import("./geocoding.server");

function fakeSupabase(cached: unknown[] | null) {
  const calls: Array<{ fn: string; args: any }> = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args });
        if (fn === "geocode_cache_get") return { data: cached ?? [], error: null };
        return { data: null, error: null };
      },
    } as any,
  };
}

beforeEach(() => googleGeocode.mockClear());

describe("geocodeWithCache", () => {
  it("uses the saved coordinates and does not call Google when the address is cached", async () => {
    const sb = fakeSupabase([
      { status: "ok", latitude: "19.1234567", longitude: "-99.7654321", formatted_address: "x", place_id: null, postal_code: null },
    ]);
    const r = await geocodeWithCache(sb.client, "Calle 1, México");
    expect(googleGeocode).toHaveBeenCalledTimes(0);
    expect(r.source).toBe("cache");
    expect(r.lat).toBe(19.1234567);
  });

  it("does not call Google again for an address already known to have no result", async () => {
    const sb = fakeSupabase([{ status: "sin_resultado", latitude: null, longitude: null }]);
    const r = await geocodeWithCache(sb.client, "Dirección rara");
    expect(googleGeocode).toHaveBeenCalledTimes(0);
    expect(r.status).toBe("sin_resultado");
  });

  it("calls Google once on a miss and saves the result", async () => {
    const sb = fakeSupabase(null);
    const r = await geocodeWithCache(sb.client, "Calle 1, México");
    expect(googleGeocode).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ status: "ok", lat: 19.4, lng: -99.1, postal_code: "06100", source: "google" });
    const put = sb.calls.find((c) => c.fn === "geocode_cache_put");
    expect(put?.args).toMatchObject({ _status: "ok", _lat: 19.4, _lng: -99.1 });
  });

  it("does not save temporary Google errors so they can be retried", async () => {
    googleGeocode.mockImplementationOnce(async () => ({ status: "OVER_QUERY_LIMIT", results: [] }) as any);
    const sb = fakeSupabase(null);
    await expect(geocodeWithCache(sb.client, "Calle 1")).rejects.toThrow();
    expect(sb.calls.some((c) => c.fn === "geocode_cache_put")).toBe(false);
  });
});

describe("buildGeocodeQuery", () => {
  it("adds the postal code only when the address does not already contain it", () => {
    expect(buildGeocodeQuery("Puno 628", "07300")).toBe("Puno 628, CP 07300, México");
    expect(buildGeocodeQuery("Puno 628, 07300 CDMX, México", "07300")).toBe("Puno 628, 07300 CDMX, México");
  });
});
