import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Without these hosts Next blocks /_next assets and HMR, and the page never
  // hydrates (blank or frozen). cursor.com covers the Cursor preview pane.
  allowedDevOrigins: ["127.0.0.1", "localhost", "cursor.com", "**.cursor.com"],
  // Stops Turbopack from treating a stray lockfile in a parent folder (e.g. ~)
  // as the workspace root.
  turbopack: { root: __dirname },
}

export default nextConfig
