import { describe, expect, it } from 'vitest';
import { parseJsonLdBlock } from '../src/core/parsers/jsonld.js';
import { validateJsonLd } from '../src/core/validators/jsonld.js';

const codes = (raw: string) => validateJsonLd([parseJsonLdBlock(raw, 0)]).map((i) => i.code);

describe('JSON-LD validation', () => {
  it('reports syntax errors with location', () => {
    const block = parseJsonLdBlock('{ "@type": "Thing", }', 0);
    expect(block.valid).toBe(false);
    expect(block.syntaxError).toMatch(/line 1/);
    expect(codes('{ "@type": "Thing", }')).toEqual(['jsonld/syntax']);
  });

  it('unwraps @graph and validates each entity', () => {
    const raw = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Acme', url: 'https://acme.example', logo: 'https://acme.example/l.png', sameAs: [] }, { '@type': 'WebSite' }] });
    const block = parseJsonLdBlock(raw, 0);
    expect(block.entities.map((e) => e.type[0])).toEqual(['Organization', 'WebSite']);
    const c = codes(raw);
    expect(c.filter((x) => x === 'jsonld/required-missing')).toHaveLength(2); // WebSite name + url
  });

  it('requires @context', () => {
    expect(codes('{"@type":"Organization","name":"Acme"}')).toContain('jsonld/context-missing');
  });

  it('validates Product offers', () => {
    const raw = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Booster', offers: { '@type': 'Offer', price: '10' } });
    const c = codes(raw);
    expect(c).toContain('jsonld/offer-currency');
    expect(c).not.toContain('jsonld/offer-price');
  });

  it('accepts alternative required properties', () => {
    const raw = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: 'Booster', aggregateRating: { ratingValue: 4.5, reviewCount: 10 } });
    expect(codes(raw)).not.toContain('jsonld/required-missing');
  });

  it('checks BreadcrumbList positions', () => {
    const raw = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 2, name: 'A', item: 'https://a' }, { '@type': 'ListItem', position: 3, name: 'B' }] });
    expect(codes(raw)).toContain('jsonld/breadcrumb-order');
  });

  it('flags articles without a headline', () => {
    expect(codes('{"@context":"https://schema.org","@type":"Article","datePublished":"2024-01-01"}')).toContain('jsonld/required-missing');
  });
});
