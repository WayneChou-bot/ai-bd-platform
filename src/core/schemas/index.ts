/**
 * Core data contracts (Spec v0.1 §24, §30 + v0.2 S4, S6, S9).
 *
 * Every agent consumes and returns objects validated against these schemas.
 * The UI never consumes raw LLM text.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const Id = z.string().min(1);
export const Timestamp = z.string().datetime({ offset: true });
/**
 * http(s) URL. Validated via refine, NOT z.string().url(): .url() emits
 * `"format": "uri"` in the JSON schema handed to generateObject, and OpenAI
 * structured outputs rejects that format outright ("'uri' is not a valid
 * format"). refine keeps full runtime validation while emitting a plain
 * string schema every provider accepts.
 */
export const Url = z.string().refine((v) => /^https?:\/\/\S+$/i.test(v), { message: "must be an http(s) URL" });
export const Confidence = z.number().min(0).max(1);
export const Score100 = z.number().min(0).max(100);

export const AppMode = z.enum(["demo", "live"]);
export type AppMode = z.infer<typeof AppMode>;

export const EntityType = z.enum(["company", "individual"]);
export type EntityType = z.infer<typeof EntityType>;

// ---------------------------------------------------------------------------
// Project / Product Understanding (§9, §10)
// ---------------------------------------------------------------------------

export const Project = z.object({
  id: Id,
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().default(""),
  website: Url.optional(),
  repository: Url.optional(),
  created_at: Timestamp,
});
export type Project = z.infer<typeof Project>;

export const ProductUnderstanding = z.object({
  project_id: Id,
  category: z.string(),
  problem: z.array(z.string()).min(1),
  value_propositions: z.array(z.string()).min(1),
  target_roles: z.array(z.string()).min(1),
  target_company_types: z.array(z.string()).min(1),
  confidence: Confidence,
  generated_at: Timestamp,
});
export type ProductUnderstanding = z.infer<typeof ProductUnderstanding>;

// ---------------------------------------------------------------------------
// ICP (§11 + S6)
// ---------------------------------------------------------------------------

export const TargetEntity = z.enum(["company", "individual", "both"]);

export const ICPProfile = z.object({
  id: Id,
  project_id: Id,
  source: z.enum(["ai_suggested", "manual"]),
  target_entity: TargetEntity.default("company"),
  industries: z.array(z.string()),
  company_size: z.object({ min: z.number().int().min(1), max: z.number().int() }).optional(),
  regions: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  target_roles: z.array(z.string()),
  business_problems: z.array(z.string()).default([]),
  positive_signals: z.array(z.string()),
  negative_signals: z.array(z.string()),
  created_at: Timestamp,
});
export type ICPProfile = z.infer<typeof ICPProfile>;

// ---------------------------------------------------------------------------
// Lead (§30, §31 + S6, S10)
// ---------------------------------------------------------------------------

export const LeadStatus = z.enum([
  "DISCOVERED",
  "RESEARCHING",
  "RESEARCHED",
  "QUALIFIED",
  "REJECTED",
  "REVIEW",
  "DRAFTED",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "OUTCOME_RECORDED",
]);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadSource = z.enum(["manual", "csv", "search", "github", "company_page", "fixture", "mention"]);
export type LeadSource = z.infer<typeof LeadSource>;

export const Lead = z.object({
  id: Id,
  project_id: Id,
  entity_type: EntityType.default("company"),
  company_name: z.string().min(1),
  display_name: z.string().optional(), // individual
  headline: z.string().optional(), // individual
  public_profile_urls: z.array(Url).default([]),
  website: Url.optional(),
  industry: z.string().optional(),
  size_estimate: z.string().optional(),
  location: z.string().optional(),
  source: LeadSource,
  discovery_reason: z.string().default(""),
  /** Where outreach is delivered (LIVE). Public business address only (§45). */
  /** One or more addresses, comma-separated — outreach can go to several people. */
  contact_email: z.string().refine(
    (v) => v.split(",").every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())),
    { message: "comma-separated email addresses" },
  ).optional(),
  status: LeadStatus,
  thread_key: z.string().nullable().default(null),
  created_at: Timestamp,
  updated_at: Timestamp,
});
export type Lead = z.infer<typeof Lead>;

// ---------------------------------------------------------------------------
// Evidence (§13, §30)
// ---------------------------------------------------------------------------

export const EvidenceType = z.enum([
  "job_posting",
  "blog_post",
  "press_release",
  "product_page",
  "github_repo",
  "tech_stack",
  "funding",
  "social_post",
  "company_page",
  "documentation",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const EvidenceCategory = z.enum([
  "hiring",
  "product_launch",
  "technology",
  "content",
  "funding",
  "company_profile",
  "negative",
]);
export type EvidenceCategory = z.infer<typeof EvidenceCategory>;

export const Evidence = z.object({
  id: Id,
  lead_id: Id,
  type: EvidenceType,
  category: EvidenceCategory,
  claim: z.string().min(1),
  source_url: Url,
  observed_at: Timestamp,
  confidence: Confidence,
  /** Which scoring dimension this evidence primarily supports. */
  supports: z.enum(["product_fit", "problem_evidence", "intent_signal", "role_relevance"]),
  /** Negative evidence lowers the dimension instead of raising it. */
  polarity: z.enum(["positive", "negative"]).default("positive"),
});
export type Evidence = z.infer<typeof Evidence>;

// ---------------------------------------------------------------------------
// Agent results (§12, §13, §14, §18)
// ---------------------------------------------------------------------------

export const DiscoveryResult = z.object({
  company_name: z.string().min(1),
  entity_type: EntityType.default("company"),
  website: Url.optional(),
  source: LeadSource,
  discovery_reason: z.string().min(1),
  initial_signals: z.array(z.string()),
  discovered_at: Timestamp,
});
export type DiscoveryResult = z.infer<typeof DiscoveryResult>;

export const ResearchResult = z.object({
  lead_id: Id,
  overview: z.string(),
  industry: z.string().optional(),
  size_estimate: z.string().optional(),
  location: z.string().optional(),
  products: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  recent_activity: z.array(z.string()).default([]),
  potential_pain_points: z.array(z.string()).default([]),
  /** Structured evidence, never prose-only. */
  // Zero evidence is a VALID research result (review v6 F02): when no source
  // yields verifiable claims the honest output is an empty list — the score
  // is then withheld. Forcing min(1) made the model invent a row.
  evidence: z.array(Evidence.omit({ id: true, lead_id: true })),
  researched_at: Timestamp,
});
export type ResearchResult = z.infer<typeof ResearchResult>;

export const Classification = z.enum(["HIGH_FIT", "MEDIUM_FIT", "LOW_FIT", "REJECT"]);
export type Classification = z.infer<typeof Classification>;

export const ScoreBreakdown = z.object({
  product_fit: Score100,
  problem_evidence: Score100,
  intent_signal: Score100,
  role_relevance: Score100,
  data_confidence: Score100,
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdown>;

export const QualificationResult = z.object({
  lead_id: Id,
  breakdown: ScoreBreakdown,
  total_score: Score100,
  classification: Classification,
  /** Evidence ids that justify the score. */
  why: z.array(z.object({ evidence_id: Id, text: z.string() })),
  risks: z.array(z.string()),
  /** LLM-written rationale; never the source of the number. */
  rationale: z.string(),
  /** true when evidence was insufficient and the score was withheld (§41). */
  withheld: z.boolean().default(false),
  /** Which ICP the evidence was mapped against (review v6 F01) — a score is
   *  only meaningful relative to a specific ICP version. */
  icp_id: Id.optional(),
  scored_at: Timestamp,
});
export type QualificationResult = z.infer<typeof QualificationResult>;

export const OutreachStatus = z.enum(["DRAFT", "APPROVED", "REJECTED", "SENT", "FAILED", "SUPERSEDED"]);

export const OutreachDraft = z.object({
  id: Id,
  lead_id: Id,
  channel: z.literal("email"),
  subject: z.string().min(1),
  body: z.string().min(1),
  evidence_used: z.array(Id).min(1),
  tone: z.enum(["professional", "friendly", "concise"]),
  confidence: Confidence,
  status: OutreachStatus,
  version: z.number().int().min(1).default(1),
  /** Set when a human edited the body — evidence grounding is not revalidated (roadmap). */
  human_edited: z.boolean().default(false),
  created_at: Timestamp,
  approved_at: Timestamp.nullable().default(null),
});
export type OutreachDraft = z.infer<typeof OutreachDraft>;

// ---------------------------------------------------------------------------
// Delivery / Inbound / Reply (S3, S4)
// ---------------------------------------------------------------------------

export const DeliveryReceipt = z.object({
  id: Id,
  draft_id: Id,
  lead_id: Id,
  provider: z.enum(["mock", "resend", "smtp", "gmail"]),
  message_id: z.string(),
  /** Provider-side conversation id (Gmail threadId) used to match replies. */
  provider_thread_id: z.string().nullable().default(null),
  thread_key: z.string(),
  simulated: z.boolean(),
  sent_at: Timestamp,
  error: z.string().nullable().default(null),
});
export type DeliveryReceipt = z.infer<typeof DeliveryReceipt>;

export const InboundEvent = z.object({
  id: Id,
  source: z.enum(["resend", "gmail", "simulated", "manual"]),
  channel: z.literal("email"),
  thread_key: z.string().nullable(),
  lead_id: Id.nullable(),
  from_address: z.string(),
  subject: z.string(),
  /** UNTRUSTED CONTENT — never executed, rendered as text only. */
  body_text: z.string(),
  received_at: Timestamp,
  raw_ref: z.string().default(""),
  processed_at: Timestamp.nullable().default(null),
});
export type InboundEvent = z.infer<typeof InboundEvent>;

export const ReplyOutcome = z.enum([
  "positive_reply",
  "negative_reply",
  "interested",
  "meeting_requested",
  "not_relevant",
  "auto_reply",
  "unclassified",
]);
export type ReplyOutcome = z.infer<typeof ReplyOutcome>;

export const ReplyClassification = z.object({
  id: Id,
  event_id: Id,
  lead_id: Id,
  outcome: ReplyOutcome,
  confidence: Confidence,
  rationale: z.string(),
  quoted_signal: z.string(),
  needs_human: z.boolean(),
  agent_run_id: Id.nullable().default(null),
  created_at: Timestamp,
});
export type ReplyClassification = z.infer<typeof ReplyClassification>;

// ---------------------------------------------------------------------------
// Outcome / Learning (§20, §21)
// ---------------------------------------------------------------------------

export const OutcomeKind = z.enum([
  "no_response",
  "positive_reply",
  "negative_reply",
  "interested",
  "meeting_requested",
  "not_relevant",
]);
export type OutcomeKind = z.infer<typeof OutcomeKind>;

export const POSITIVE_OUTCOMES: ReadonlySet<OutcomeKind> = new Set([
  "positive_reply",
  "interested",
  "meeting_requested",
]);

export const Outcome = z.object({
  id: Id,
  lead_id: Id,
  outcome: OutcomeKind,
  notes: z.string().default(""),
  recorded_by: z.enum(["user", "reply_agent"]),
  event_id: Id.nullable().default(null),
  recorded_at: Timestamp,
});
export type Outcome = z.infer<typeof Outcome>;

export const LearningInsight = z.object({
  id: Id,
  project_id: Id,
  kind: z.enum(["score_band_response", "evidence_category_performance", "source_performance", "headline"]),
  title: z.string(),
  detail: z.string(),
  data: z.record(z.string(), z.unknown()),
  sample_size: z.number().int().min(0),
  generated_at: Timestamp,
});
export type LearningInsight = z.infer<typeof LearningInsight>;

// ---------------------------------------------------------------------------
// Agent runs / audit (§23, §42)
// ---------------------------------------------------------------------------

export const AgentName = z.enum(["product_understanding", "icp_suggest", "discovery", "research", "qualification", "outreach", "reply", "learning"]);
export type AgentName = z.infer<typeof AgentName>;

export const RunStatus = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED", "RETRYING"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const AgentRun = z.object({
  id: Id,
  project_id: Id,
  agent: AgentName,
  lead_id: Id.nullable().default(null),
  status: RunStatus,
  started_at: Timestamp.nullable().default(null),
  completed_at: Timestamp.nullable().default(null),
  latency_ms: z.number().int().min(0).nullable().default(null),
  model: z.string().nullable().default(null),
  token_usage: z.object({ input: z.number().int(), output: z.number().int() }).nullable().default(null),
  retry_count: z.number().int().min(0).default(0),
  error: z.string().nullable().default(null),
  input_summary: z.string().default(""),
  output_summary: z.string().default(""),
  created_at: Timestamp,
});
export type AgentRun = z.infer<typeof AgentRun>;

export const AuditEvent = z.object({
  id: Id,
  project_id: Id,
  lead_id: Id.nullable().default(null),
  actor: z.enum(["user", "system", "agent"]),
  action: z.string(),
  detail: z.string().default(""),
  created_at: Timestamp,
});
export type AuditEvent = z.infer<typeof AuditEvent>;

// ---------------------------------------------------------------------------
// Source / Signal intelligence (Spec v0.3 — Tracked Entities, Mentions)
// ---------------------------------------------------------------------------

/** What kind of thing a project tracks mentions of (v0.3 §23). */
export const TrackedEntityKind = z.enum(["product", "company", "repository", "person", "technology"]);
export type TrackedEntityKind = z.infer<typeof TrackedEntityKind>;

export const TrackedEntity = z.object({
  id: Id,
  project_id: Id,
  canonical_name: z.string().min(1),
  entity_type: TrackedEntityKind,
  aliases: z.array(z.string()).default([]),
  canonical_url: Url.optional(),
  /** Stable identifiers, e.g. "WayneChou-bot/WareTwin". */
  identifiers: z.array(z.string()).default([]),
  /** Context topics used for confidence + query expansion. */
  keywords: z.array(z.string()).default([]),
  created_at: Timestamp,
});
export type TrackedEntity = z.infer<typeof TrackedEntity>;

/** Where a source document came from (v0.3 §9 — superset of EvidenceType's sources). */
export const SourceType = z.enum([
  "website", "product_page", "careers", "job_posting", "blog", "news", "press_release",
  "documentation", "github", "developer_platform", "youtube", "podcast", "forum", "reddit",
  "social", "conference", "event", "company_database", "csv", "crm", "manual",
]);
export type SourceType = z.infer<typeof SourceType>;

/** Uniform fetched-content model (v0.3 §12): downstream code never needs to
 *  know whether this came from search, GitHub, or (later) a media adapter. */
export const SourceDocument = z.object({
  url: Url,
  title: z.string(),
  /** Untrusted external content — always fence before any LLM prompt. */
  content: z.string(),
  source_type: SourceType,
  language: z.string().default("en"),
  /** Language ≠ country (v0.3 §19); both optional and independent. */
  country: z.string().nullable().default(null),
  published_at: Timestamp.nullable().default(null),
  retrieved_at: Timestamp,
  metadata: z.record(z.string(), z.string()).default({}),
});
export type SourceDocument = z.infer<typeof SourceDocument>;

export const SignalType = z.enum([
  "product_mention", "company_mention", "repository_mention", "hiring_signal", "buying_signal",
  "technology_signal", "problem_signal", "partnership_signal", "competitor_signal",
  "funding_signal", "expansion_signal", "procurement_signal", "content_engagement",
]);
export type SignalType = z.infer<typeof SignalType>;

export const MentionContext = z.enum([
  "evaluation", "adoption", "comparison", "recommendation", "technical_reference", "criticism", "question", "neutral",
]);
export type MentionContext = z.infer<typeof MentionContext>;

/** Sentiment ≠ intent (v0.3 §31): "looks great" is positive with no intent;
 *  "we are evaluating it" is neutral with high intent. Stored separately. */
export const Sentiment = z.enum(["positive", "neutral", "negative"]);
export type Sentiment = z.infer<typeof Sentiment>;
export const IntentLevel = z.enum(["none", "low", "medium", "high"]);
export type IntentLevel = z.infer<typeof IntentLevel>;

export const BusinessRelevance = z.enum(["low", "medium", "high"]);
export type BusinessRelevance = z.infer<typeof BusinessRelevance>;

/** A signal is an EVENT that may have business meaning; evidence is a
 *  traceable statement SUPPORTING a judgement (v0.3 §8). Source → Signal →
 *  Evidence → Qualification. */
export const Signal = z.object({
  id: Id,
  project_id: Id,
  entity_id: Id,
  /** Set when the signal is converted to / attached to a lead. */
  lead_id: Id.nullable().default(null),
  signal_type: SignalType,
  source_type: SourceType,
  source_url: Url,
  title: z.string(),
  /** Original-language snippet — translations are display-only (v0.3 §39, §40). */
  snippet: z.string(),
  language: z.string().default("en"),
  country: z.string().nullable().default(null),
  published_at: Timestamp.nullable().default(null),
  observed_at: Timestamp,
  /** Deterministic mention confidence 0–100 (v0.3 §24). */
  confidence: z.number().int().min(0).max(100),
  business_relevance: BusinessRelevance,
  mention_context: MentionContext.default("neutral"),
  sentiment: Sentiment.default("neutral"),
  intent: IntentLevel.default("none"),
  /** The query that surfaced this signal — audit/replay (v0.3 §33, §34). */
  query: z.string().default(""),
  status: z.enum(["NEW", "CONVERTED", "IGNORED"]).default("NEW"),
  created_at: Timestamp,
});
export type Signal = z.infer<typeof Signal>;

// ---------------------------------------------------------------------------
// Demo dataset bundle (S7)
// ---------------------------------------------------------------------------

export const DemoDataset = z.object({
  version: z.string(),
  generated_at: Timestamp,
  project: Project,
  product_understanding: ProductUnderstanding,
  icp: ICPProfile,
  leads: z.array(Lead),
  evidence: z.array(Evidence),
  qualifications: z.array(QualificationResult),
  drafts: z.array(OutreachDraft),
  receipts: z.array(DeliveryReceipt),
  inbound_events: z.array(InboundEvent),
  reply_classifications: z.array(ReplyClassification),
  outcomes: z.array(Outcome),
  insights: z.array(LearningInsight),
  agent_runs: z.array(AgentRun),
  audit_events: z.array(AuditEvent),
});
export type DemoDataset = z.infer<typeof DemoDataset>;
