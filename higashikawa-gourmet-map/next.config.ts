import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Notion の画像 URL（署名付き S3）と一般的な外部画像ホストを許可する
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'prod-files-secure.s3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 's3.us-west-2.amazonaws.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
