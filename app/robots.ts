import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://money.ashwinsi.in'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/profile', '/expenses', '/savings', '/tags'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
