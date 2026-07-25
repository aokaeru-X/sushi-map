import type { MetadataRoute } from 'next';
import { canonicalUrl } from '@/utils/urlGenerator';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/ja/admin', '/en/admin', '/zh-TW/admin'] }],
    sitemap: canonicalUrl('/sitemap.xml'),
  };
}
