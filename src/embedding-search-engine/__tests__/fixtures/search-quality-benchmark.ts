/**
 * Realistic project-memory search-quality benchmark fixtures.
 *
 * Each fixture is one "correct" fact plus one or more natural-language queries
 * that a real developer would type expecting that exact fact back. All
 * fixtures in this file are loaded together into one memory store per
 * benchmark run, so a query must find its correct match *among* every other
 * fixture's fact — this is what makes top-1/top-5 accuracy meaningful rather
 * than trivially 100% (a single-fact store would always "win").
 *
 * Categories mirror aimem's own documented memory types (see
 * requirements/functional-requirements.md, workflows/): credentials,
 * architecture decisions, bug fixes/experience, and manual "remember this"
 * notes.
 */

export interface BenchmarkFixture {
  readonly id: string;
  readonly category: "credential" | "architecture_fact" | "decision" | "bug_fix" | "manual_note";
  readonly entity: string;
  readonly observation: string;
  /** Natural-language queries that should retrieve this fixture's observation. */
  readonly queries: readonly string[];
}

export const BENCHMARK_FIXTURES: readonly BenchmarkFixture[] = [
  // --- Credentials ---
  {
    id: "staging-db-password",
    category: "credential",
    entity: "staging-db",
    observation: "Staging database password was rotated; use the STAGING_DB_PASS environment variable, never hardcode it.",
    queries: ["what's the staging db password", "staging database credentials", "how do I connect to staging db"],
  },
  {
    id: "prod-api-key-location",
    category: "credential",
    entity: "payment-gateway",
    observation: "The production Stripe API key is stored in AWS Secrets Manager under 'prod/stripe/api-key', not in .env.",
    queries: ["where is the stripe api key", "production payment gateway credentials", "how do I get the stripe key"],
  },
  {
    id: "ssh-jump-host",
    category: "credential",
    entity: "deploy-server",
    observation: "SSH access to the deploy server requires going through the jump host at bastion.internal.example.com first, using your personal key.",
    queries: ["how do I ssh into the deploy server", "ssh access to production server", "jump host details"],
  },

  // --- Architecture decisions ---
  {
    id: "primary-db-engine",
    category: "architecture_fact",
    entity: "primary-db",
    observation: "We switched the primary database engine from MySQL to PostgreSQL for better JSON column support and native full-text search.",
    queries: ["what database do we use", "why did we pick postgres", "primary db engine"],
  },
  {
    id: "session-cache-choice",
    category: "decision",
    entity: "session-cache",
    observation: "Decided to use Redis for session caching instead of in-memory storage, so sessions survive a server restart.",
    queries: ["how do we handle session storage", "why redis for sessions", "session cache implementation"],
  },
  {
    id: "auth-token-strategy",
    category: "decision",
    entity: "auth-service",
    observation: "Authentication uses JWT access tokens with a 15-minute expiry, paired with a 7-day refresh token stored in an httpOnly cookie.",
    queries: ["how does auth work", "jwt token expiry settings", "what's our authentication strategy"],
  },
  {
    id: "deploy-pipeline",
    category: "architecture_fact",
    entity: "ci-cd",
    observation: "Deploys go through GitHub Actions: tests run on every PR, and merging to main triggers an automatic deploy to staging, with a manual approval gate before production.",
    queries: ["how does deployment work", "ci/cd pipeline setup", "what happens when I merge to main"],
  },

  // --- Bug fixes / experience memory ---
  {
    id: "n-plus-one-fix",
    category: "bug_fix",
    entity: "order-list-endpoint",
    observation: "Fixed a N+1 query bug on the order list endpoint by eager-loading the customer relation; response time dropped from 4s to 200ms.",
    queries: ["order list endpoint was slow", "n+1 query bug fix", "why was the orders page slow"],
  },
  {
    id: "race-condition-webhook",
    category: "bug_fix",
    entity: "webhook-handler",
    observation: "There was a race condition in the webhook handler when two events arrived within the same millisecond; fixed by adding a unique constraint on the idempotency key.",
    queries: ["webhook race condition", "duplicate webhook processing bug", "idempotency key fix"],
  },
  {
    id: "memory-leak-worker",
    category: "bug_fix",
    entity: "background-worker",
    observation: "The background worker had a memory leak from unclosed database connections in the retry loop; fixed by wrapping the connection in a try/finally.",
    queries: ["worker process memory leak", "background job using too much memory", "why does the worker crash after a while"],
  },

  // --- Manual "remember this" notes ---
  {
    id: "no-friday-deploys",
    category: "manual_note",
    entity: "deploy-process",
    observation: "Never deploy on Fridays — if something breaks, the team doesn't have coverage over the weekend.",
    queries: ["can I deploy today", "deployment schedule rules", "friday deploy policy"],
  },
  {
    id: "code-review-requirement",
    category: "manual_note",
    entity: "code-review",
    observation: "All pull requests need at least one approval from a senior engineer before merging, even for small fixes.",
    queries: ["code review requirements", "who needs to approve my pr", "pr approval policy"],
  },
];

/**
 * "Distractor" facts with no correct query mapped to them — included in every
 * benchmark run alongside BENCHMARK_FIXTURES so the store isn't trivially
 * small. These deliberately overlap in topic/vocabulary with real fixtures
 * (e.g. another database, another auth detail) to make retrieval genuinely
 * discriminate between similar-sounding facts, not just match on category.
 */
export const DISTRACTOR_OBSERVATIONS: readonly { entity: string; observation: string }[] = [
  { entity: "analytics-db", observation: "The analytics database runs on ClickHouse for fast aggregate queries over event data." },
  { entity: "cache-layer", observation: "We use Memcached for caching rendered HTML fragments, separate from the Redis session store." },
  { entity: "admin-auth", observation: "The internal admin panel uses basic auth over a VPN connection, not the main JWT flow." },
  { entity: "legacy-deploy", observation: "The old deploy script used Capistrano before we migrated to GitHub Actions in 2025." },
  { entity: "search-indexing", observation: "Product search is powered by Elasticsearch, reindexed nightly via a cron job." },
  { entity: "email-provider", observation: "Transactional emails are sent through Postmark, not SES, due to better deliverability rates." },
  { entity: "rate-limiting", observation: "API rate limiting is enforced at 100 requests per minute per API key, using a sliding window in Redis." },
  { entity: "logging-stack", observation: "Application logs are shipped to Datadog, with a 30-day retention window on the free tier." },
];
