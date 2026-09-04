import type { NextConfig } from "next";
import mtaRedirects from "./data/systems/mta-maryland/redirects.json";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      // Per-station redirects from the retired baltimore-metro and
      // baltimore-light-rail systems, generated from their old id maps
      // (they handle the lexington-market slug rename). The wildcards
      // catch everything else: lines, history, railcars, listings.
      ...mtaRedirects.map((r) => ({ ...r, permanent: true })),
      // History and railcars live at system level, not under a network.
      ...["baltimore-metro", "baltimore-light-rail"].flatMap((old) => [
        { source: `/${old}/history`, destination: "/mta-maryland/history", permanent: true },
        {
          source: `/${old}/railcars/:path*`,
          destination: "/mta-maryland/railcars/:path*",
          permanent: true,
        },
      ]),
      {
        source: "/baltimore-metro/:path*",
        destination: "/mta-maryland/metro/:path*",
        permanent: true,
      },
      {
        source: "/baltimore-light-rail/:path*",
        destination: "/mta-maryland/light-rail/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
