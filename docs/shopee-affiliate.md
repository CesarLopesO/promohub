# Shopee Affiliate Link Generation

## Status

Automatic Shopee affiliate link generation remains pending.

The application stores the user's Shopee AppID and secret encrypted with
`APP_ENCRYPTION_KEY`, but it does not call an external Shopee endpoint yet.
Shopee links remain unchanged and use the
`SHOPEE_GENERATOR_NOT_IMPLEMENTED` reason when credentials are configured.

## Code audit

- `extractLinks` recognizes `shopee.com.br`, `www.shopee.com.br`, and
  `shope.ee`.
- `ShopeeAffiliateProvider` does not add query parameters or replace domains.
- `AffiliateCredential.apiKey` and `apiSecret` hold the encrypted AppID and
  secret.
- `decryptAffiliateCredential` decrypts both fields only inside the backend
  rewrite flow.
- `AffiliateLinkCache` can be reused for Shopee after the official response
  contract is confirmed.
- No `ShopeeGenerator` or `ShopeeClient` currently exists.

## Technical investigation

The public Brazilian affiliate page is available at:

- https://affiliate.shopee.com.br/open_api

That page does not expose the authenticated Open API documentation or its
request schema without an affiliate account session.

Third-party sources consistently mention a Brazilian GraphQL endpoint and an
AppID/secret signature, but they are not sufficient to implement a production
integration:

- https://www.affiliateshopee.com.br/documentacao describes
  `generateShortLink`, a SHA256 concatenation signature, and a `shortLink`
  response. The page explicitly identifies itself as unofficial.
- https://apify.com/viralanalyzer/shopee-affiliate-products describes
  `generateBatchShortLink` and calls the authentication HMAC-SHA256.

These sources disagree on the mutation name and signature terminology. The
official public Shopee Open Platform documentation found during the
investigation covers seller APIs, not the Affiliate Open API contract.

## Required confirmation

Before implementing `ShopeeAffiliateGenerator`, confirm all items below from
the authenticated Shopee Affiliate Open API documentation or written Shopee
support guidance:

1. Production endpoint for Brazil.
2. Exact mutation name and GraphQL input type.
3. Exact JSON serialization used when calculating the signature.
4. Whether the signature is a plain SHA256 digest or an HMAC.
5. Required timestamp precision and accepted clock-skew window.
6. Successful response schema and expected affiliate-link domains.
7. Error codes, rate limits, timeout guidance, and retry policy.
8. Whether `shope.ee` links are accepted directly or must first be resolved.

## Implementation gate

After the contract is confirmed, the generator must:

- use a short timeout and conservative retry policy;
- never log AppID, secret, authorization headers, or complete external
  responses;
- validate the returned URL as HTTP(S) and allow only confirmed Shopee
  affiliate domains;
- cache by user, marketplace, credential identity, and original URL;
- return `SHOPEE_INVALID_RESPONSE` for invalid successful responses;
- return `SHOPEE_GENERATION_FAILED` for transport or API failures;
- block automatic forwarding when generation was attempted and failed.
