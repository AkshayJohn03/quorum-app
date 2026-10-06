/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next build` and `next dev` must never share a .next directory — builds
  // clobber the dev server's chunk manifest. Set NEXT_DIST_DIR for builds.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
export default nextConfig;
