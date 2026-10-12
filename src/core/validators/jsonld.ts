import type { Issue, JsonLdBlock, JsonLdEntity } from '../types.js';

/**
 * Lightweight schema.org rules modelled on Google's rich-result requirements. `required`
 * properties raise errors, `recommended` ones raise warnings. Alternatives are expressed as
 * `a|b` (either satisfies the rule).
 */
interface TypeRule {
  required: string[];
  recommended: string[];
  check?: (node: Record<string, unknown>, issue: (s: Issue['severity'], code: string, msg: string) => void) => void;
}

const ARTICLE: TypeRule = {
  required: ['headline'],
  recommended: ['image', 'datePublished', 'dateModified', 'author', 'publisher'],
  check(node, issue) {
    const headline = node.headline;
    if (typeof headline === 'string' && headline.length > 110) issue('warning', 'jsonld/headline-long', `headline is ${headline.length} characters; Google truncates beyond 110.`);
    for (const key of ['datePublished', 'dateModified']) {
      const v = node[key];
      if (typeof v === 'string' && !isIsoDate(v)) issue('warning', 'jsonld/date-format', `${key} "${v}" is not an ISO 8601 date.`);
    }
    const author = node.author;
    for (const a of asArray(author)) {
      if (typeof a === 'string') issue('warning', 'jsonld/author-string', 'author should be a Person or Organization object with a name, not a plain string.');
      else if (isObject(a) && !a.name) issue('warning', 'jsonld/author-name', 'author is missing name.');
    }
  },
};

export const SCHEMA_RULES: Record<string, TypeRule> = {
  Organization: {
    required: ['name'],
    recommended: ['url', 'logo', 'sameAs'],
    check(node, issue) {
      if (typeof node.url === 'string' && !isUrl(node.url)) issue('warning', 'jsonld/url-invalid', `url "${node.url}" is not an absolute URL.`);
      const logo = isObject(node.logo) ? node.logo.url : node.logo;
      if (typeof logo === 'string' && !isUrl(logo)) issue('warning', 'jsonld/logo-invalid', `logo "${logo}" is not an absolute URL.`);
    },
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['potentialAction'],
    check(node, issue) {
      if (typeof node.url === 'string' && !isUrl(node.url)) issue('warning', 'jsonld/url-invalid', `url "${node.url}" is not an absolute URL.`);
      for (const action of asArray(node.potentialAction)) {
        if (!isObject(action) || !typesOf(action).includes('SearchAction')) continue;
        const target = isObject(action.target) ? action.target.urlTemplate : action.target;
        if (typeof target !== 'string' || !target.includes('{')) issue('error', 'jsonld/searchaction-target', 'SearchAction.target must be a URL template containing a {search_term_string} placeholder.');
        if (!action['query-input'] && !action.query) issue('error', 'jsonld/searchaction-query-input', 'SearchAction is missing "query-input".');
      }
    },
  },
  Article: ARTICLE,
  NewsArticle: ARTICLE,
  BlogPosting: ARTICLE,
  Product: {
    required: ['name', 'offers|review|aggregateRating'],
    recommended: ['image', 'description', 'sku', 'brand'],
    check(node, issue) {
      for (const offer of asArray(node.offers)) {
        if (!isObject(offer)) continue;
        const isAggregate = typesOf(offer).includes('AggregateOffer');
        if (isAggregate ? offer.lowPrice == null : offer.price == null) issue('error', 'jsonld/offer-price', `Offer is missing ${isAggregate ? 'lowPrice' : 'price'}.`);
        if (!offer.priceCurrency) issue('error', 'jsonld/offer-currency', 'Offer is missing priceCurrency.');
        else if (typeof offer.priceCurrency === 'string' && !/^[A-Z]{3}$/.test(offer.priceCurrency)) issue('warning', 'jsonld/offer-currency-format', `priceCurrency "${offer.priceCurrency}" should be an ISO 4217 code (e.g. USD).`);
        if (!offer.availability) issue('warning', 'jsonld/offer-availability', 'Offer is missing availability (e.g. https://schema.org/InStock).');
      }
      const rating = node.aggregateRating;
      if (isObject(rating) && (rating.ratingValue == null || (rating.reviewCount == null && rating.ratingCount == null))) {
        issue('error', 'jsonld/aggregate-rating', 'aggregateRating needs ratingValue and reviewCount or ratingCount.');
      }
    },
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
    check(node, issue) {
      const items = asArray(node.itemListElement);
      if (!items.length) issue('error', 'jsonld/breadcrumb-empty', 'BreadcrumbList.itemListElement is empty.');
      items.forEach((item, i) => {
        if (!isObject(item)) return issue('error', 'jsonld/breadcrumb-item', `itemListElement[${i}] must be a ListItem object.`);
        if (item.position == null) issue('error', 'jsonld/breadcrumb-position', `itemListElement[${i}] is missing position.`);
        else if (Number(item.position) !== i + 1) issue('warning', 'jsonld/breadcrumb-order', `itemListElement[${i}] has position ${String(item.position)}; expected ${i + 1}.`);
        const nested = isObject(item.item) ? item.item : null;
        if (!item.name && !nested?.name) issue('error', 'jsonld/breadcrumb-name', `itemListElement[${i}] is missing name.`);
        if (!item.item && i < items.length - 1) issue('error', 'jsonld/breadcrumb-item-url', `itemListElement[${i}] is missing item (URL); only the last crumb may omit it.`);
      });
    },
  },
};

export const SUPPORTED_TYPES = Object.keys(SCHEMA_RULES);

export function validateEntity(entity: JsonLdEntity, hasContext: boolean): Issue[] {
  const issues: Issue[] = [];
  const label = entity.type.join(', ') || 'entity';
  const issue = (severity: Issue['severity'], code: string, message: string) =>
    issues.push({ severity, category: 'jsonld', code, message: `${label} (${entity.path}): ${message}` });

  if (!hasContext) issue('error', 'jsonld/context-missing', '@context is missing; expected "https://schema.org".');
  if (!entity.type.length) issue('error', 'jsonld/type-invalid', '@type must be a string.');

  for (const t of entity.type) {
    const rule = SCHEMA_RULES[t];
    if (!rule) continue;
    for (const req of rule.required) {
      if (!req.split('|').some((k) => present(entity.data[k]))) issue('error', 'jsonld/required-missing', `missing required property "${req.replace(/\|/g, '" or "')}".`);
    }
    for (const rec of rule.recommended) {
      if (!rec.split('|').some((k) => present(entity.data[k]))) issue('warning', 'jsonld/recommended-missing', `missing recommended property "${rec}".`);
    }
    rule.check?.(entity.data, issue);
  }
  return issues;
}

export function validateJsonLd(blocks: JsonLdBlock[]): Issue[] {
  const issues: Issue[] = [];
  if (!blocks.length) {
    issues.push({ severity: 'info', category: 'jsonld', code: 'jsonld/none', message: 'No JSON-LD structured data found.', hint: 'Add Organization/WebSite on the home page and Article/Product/BreadcrumbList where relevant.' });
    return issues;
  }
  for (const block of blocks) {
    if (!block.valid) {
      issues.push({ severity: 'error', category: 'jsonld', code: 'jsonld/syntax', message: `JSON-LD block #${block.index + 1} is not valid JSON: ${block.syntaxError}` });
      continue;
    }
    const roots = Array.isArray(block.data) ? block.data : [block.data];
    const blockContext = roots.some((r) => isObject(r) && hasSchemaContext(r['@context']));
    if (!block.entities.length) {
      issues.push({ severity: 'warning', category: 'jsonld', code: 'jsonld/no-type', message: `JSON-LD block #${block.index + 1} contains no @type.` });
    }
    for (const entity of block.entities) {
      const own = hasSchemaContext(entity.data['@context']);
      entity.issues = validateEntity(entity, own || blockContext);
      issues.push(...entity.issues);
    }
  }
  return issues;
}

function hasSchemaContext(ctx: unknown): boolean {
  if (typeof ctx === 'string') return /schema\.org/i.test(ctx);
  if (Array.isArray(ctx)) return ctx.some(hasSchemaContext);
  if (isObject(ctx)) return Object.values(ctx).some(hasSchemaContext) || typeof ctx['@vocab'] === 'string';
  return false;
}

function typesOf(node: Record<string, unknown>): string[] {
  return asArray(node['@type']).filter((t): t is string => typeof t === 'string');
}

const present = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isUrl = (v: string) => /^https?:\/\//i.test(v);
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v);
