import { Helmet } from 'react-helmet';

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  noIndex?: boolean;
  structuredData?: object;
}

const SEOHead = ({
  title = "Holezy Golf - Your Golf Tee Time Concierge",
  description = "Struggling to book weekend tee times? Holezy Golf uses AI to monitor 10,000+ courses and secure tee times for you. Fast, simple, and stress-free.",
  canonicalUrl,
  ogImage = "/holezy-og-image.png",
  ogType = "website",
  noIndex = false,
  structuredData,
}: SEOHeadProps) => {
  const baseUrl = "https://holezy-golf.lovable.app";
  const fullCanonicalUrl = canonicalUrl ? `${baseUrl}${canonicalUrl}` : undefined;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${baseUrl}${ogImage}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      
      {/* Canonical URL */}
      {fullCanonicalUrl && <link rel="canonical" href={fullCanonicalUrl} />}
      
      {/* No index if specified */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      
      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={fullOgImage} />
      {fullCanonicalUrl && <meta property="og:url" content={fullCanonicalUrl} />}
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullOgImage} />
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

// Predefined structured data for the homepage
export const homePageStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Holezy Golf",
  "url": "https://holezy-golf.lovable.app",
  "description": "AI-powered golf tee time concierge service that monitors 10,000+ courses and secures tee times for you.",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://holezy-golf.lovable.app/book?course={search_term_string}",
    "query-input": "required name=search_term_string"
  }
};

// Organization structured data
export const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Holezy Golf",
  "url": "https://holezy-golf.lovable.app",
  "logo": "https://holezy-golf.lovable.app/holezy-og-image.png",
  "sameAs": [
    "https://twitter.com/HolezyGolf"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "url": "https://holezy-golf.lovable.app/contact"
  }
};

// Service structured data
export const serviceStructuredData = {
  "@context": "https://schema.org",
  "@type": "Service",
  "serviceType": "Golf Tee Time Booking Concierge",
  "provider": {
    "@type": "Organization",
    "name": "Holezy Golf"
  },
  "description": "AI-powered concierge service that monitors golf courses and secures tee times on your behalf.",
  "offers": {
    "@type": "Offer",
    "price": "5.00",
    "priceCurrency": "USD",
    "priceSpecification": {
      "@type": "UnitPriceSpecification",
      "price": "5.00",
      "priceCurrency": "USD",
      "unitText": "per player"
    }
  },
  "areaServed": {
    "@type": "Country",
    "name": "United States"
  }
};

// Combined structured data for homepage
export const combinedHomeStructuredData = [
  homePageStructuredData,
  organizationStructuredData,
  serviceStructuredData
];

export default SEOHead;
