/**
 * Hand-authored demo universe (Spec v0.2 S7): 25 leads for the
 * "LLM Wiki Agent" demo product. All companies and people are fictional.
 *
 * Target mix: 9 High Fit, 9 Medium Fit, 7 Rejected.
 * Rejected includes "looks right but isn't" cases and one insufficient-evidence case.
 */
import type { EntityType, EvidenceCategory, EvidenceType, LeadSource } from "@/core/schemas";

export type Dim = "product_fit" | "problem_evidence" | "intent_signal" | "role_relevance";

export interface EvidenceSeed {
  type: EvidenceType;
  category: EvidenceCategory;
  claim: string;
  path: string; // appended to website
  conf: number;
  supports: Dim;
  negative?: boolean;
  daysAgo: number;
}

export interface CompanySeed {
  slug: string;
  name: string;
  entity_type?: EntityType;
  display_name?: string;
  headline?: string;
  industry: string;
  size: string;
  location: string;
  source: LeadSource;
  reason: string;
  expected: "HIGH_FIT" | "MEDIUM_FIT" | "REJECT" | "LOW_FIT";
  evidence: EvidenceSeed[];
  /** Scripted reply from the prospect, if any. */
  reply?: { subject: string; body: string; daysAfterSend: number };
  /** Where the lead stops in the pipeline if no reply. */
  stopAt?: "REVIEW" | "DRAFTED" | "CONTACTED";
}

const E = (
  type: EvidenceType, category: EvidenceCategory, supports: Dim, conf: number, daysAgo: number, claim: string, path: string, negative = false,
): EvidenceSeed => ({ type, category, supports, conf, daysAgo, claim, path, negative });

export const COMPANIES: CompanySeed[] = [
  // ───────────────────────────── HIGH FIT (9) ─────────────────────────────
  {
    slug: "acme-ai", name: "Acme AI", industry: "AI Infrastructure", size: "200–500", location: "San Francisco, CA", source: "search",
    reason: "Hiring Knowledge Engineer; recently published RAG article", expected: "HIGH_FIT",
    evidence: [
      E("job_posting", "hiring", "role_relevance", 0.94, 3, "Hiring a Knowledge Engineer to structure internal technical documentation", "/careers/knowledge-engineer"),
      E("blog_post", "content", "problem_evidence", 0.9, 12, "Published an engineering post on retrieval quality problems in their internal RAG platform", "/blog/rag-retrieval-quality"),
      E("tech_stack", "technology", "product_fit", 0.88, 20, "Engineering docs are maintained in Markdown in a public docs repository", "/docs"),
      E("product_page", "product_launch", "intent_signal", 0.86, 15, "Announced an internal AI assistant initiative for engineering teams", "/blog/ai-assistant-launch"),
      E("job_posting", "hiring", "product_fit", 0.82, 6, "Hiring a Developer Relations lead focused on documentation quality", "/careers/devrel-lead"),
      E("github_repo", "technology", "intent_signal", 0.8, 30, "Maintains an open-source agent framework repository with active commits", "/github"),
    ],
    reply: { subject: "Re: Your knowledge engineering roles at Acme AI", body: "Thanks for reaching out. This is timely — we're mid-way through rebuilding our internal docs pipeline. Could you send a short overview and we can set up 20 minutes next week?", daysAfterSend: 2 },
  },
  {
    slug: "northwind-labs", name: "Northwind Labs", industry: "Developer Tools", size: "50–200", location: "Berlin, Germany", source: "github",
    reason: "Publishes AI-agent projects; docs in Markdown", expected: "HIGH_FIT",
    evidence: [
      E("github_repo", "technology", "product_fit", 0.92, 5, "Public repository contains an LLM agent toolkit with 2k+ stars", "/github/agent-toolkit"),
      E("documentation", "technology", "product_fit", 0.85, 25, "Documentation site is generated from Markdown sources", "/docs"),
      E("job_posting", "hiring", "role_relevance", 0.9, 8, "Open role: Technical Writer / Documentation Engineer", "/jobs/docs-engineer"),
      E("blog_post", "content", "problem_evidence", 0.87, 18, "Blog post describes onboarding friction caused by fragmented internal knowledge", "/blog/onboarding-friction"),
      E("social_post", "content", "intent_signal", 0.78, 4, "Founder posted about evaluating knowledge-management tooling for the team", "/social/founder-post"),
    ],
    reply: { subject: "Re: Documentation engineering at Northwind", body: "Interesting. We are indeed looking at this. Happy to have a call — what does the integration with an existing Markdown repo look like?", daysAfterSend: 3 },
  },
  {
    slug: "helios-platform", name: "Helios Platform", industry: "AI Platform / SaaS", size: "500–1,000", location: "Austin, TX", source: "search",
    reason: "Launching RAG system; hiring AI platform engineers", expected: "HIGH_FIT",
    evidence: [
      E("press_release", "product_launch", "intent_signal", 0.9, 10, "Announced launch of an internal retrieval-augmented knowledge assistant", "/press/knowledge-assistant"),
      E("job_posting", "hiring", "role_relevance", 0.93, 2, "Hiring three AI Platform Engineers with RAG experience", "/careers/ai-platform"),
      E("blog_post", "content", "problem_evidence", 0.84, 22, "Engineering blog post on keeping architecture docs current across 40 teams", "/blog/architecture-docs"),
      E("tech_stack", "technology", "product_fit", 0.86, 35, "Public tech stack lists vector database and LLM orchestration tooling", "/engineering/stack"),
      E("documentation", "technology", "product_fit", 0.8, 40, "Developer portal built on Markdown-based static site generator", "/developers"),
    ],
    reply: { subject: "Re: Keeping architecture docs current at Helios", body: "Appreciate the specific references. We have a pilot budget for this quarter. Can you do a demo on Thursday? Adding my colleague from the platform team.", daysAfterSend: 1 },
  },
  {
    slug: "quantleaf", name: "Quantleaf Analytics", industry: "Data / Analytics SaaS", size: "200–500", location: "London, UK", source: "search",
    reason: "Knowledge management article; hiring DevRel", expected: "HIGH_FIT",
    evidence: [
      E("blog_post", "content", "problem_evidence", 0.9, 9, "Published a post titled 'Our internal wiki is where knowledge goes to die'", "/blog/wiki-problem"),
      E("job_posting", "hiring", "role_relevance", 0.88, 7, "Hiring a Developer Relations Engineer", "/careers/devrel"),
      E("job_posting", "hiring", "intent_signal", 0.85, 7, "Hiring an AI Engineer for internal tooling", "/careers/ai-engineer"),
      E("github_repo", "technology", "product_fit", 0.83, 28, "Public SDK documentation maintained as Markdown in GitHub", "/github/sdk-docs"),
      E("company_page", "company_profile", "product_fit", 0.8, 60, "Company page states 180 engineers across 4 offices", "/about"),
    ],
    reply: { subject: "Re: 'Where knowledge goes to die'", body: "Ha — that post got more attention than expected. Yes, let's talk. I'm interested in how role-specific pages work.", daysAfterSend: 4 },
  },
  {
    slug: "orbital-devtools", name: "Orbital DevTools", industry: "Developer Tools", size: "20–50", location: "Toronto, Canada", source: "github",
    reason: "Agent projects on GitHub; Markdown docs; hiring writer", expected: "HIGH_FIT",
    evidence: [
      E("github_repo", "technology", "product_fit", 0.9, 6, "Maintains multiple public LLM-agent example repositories", "/github"),
      E("job_posting", "hiring", "role_relevance", 0.86, 11, "Hiring a Developer Educator / Technical Writer", "/jobs/dev-educator"),
      E("blog_post", "content", "problem_evidence", 0.85, 14, "Blog post on documentation drift between SDK versions", "/blog/docs-drift"),
      E("social_post", "content", "intent_signal", 0.8, 3, "CTO asked publicly for recommendations on AI documentation tooling", "/social/cto-question"),
      E("documentation", "technology", "product_fit", 0.78, 45, "Docs site built from Markdown with versioned sections", "/docs"),
    ],
    reply: { subject: "Re: Docs drift at Orbital", body: "Thanks — saw your note. We're small but this is a real pain. Would love to be a design partner if pricing works for a 20-person team.", daysAfterSend: 2 },
  },
  {
    slug: "meridian-health-ai", name: "Meridian Health AI", industry: "Healthcare AI", size: "200–500", location: "Boston, MA", source: "search",
    reason: "Internal AI initiative; knowledge engineering roles", expected: "HIGH_FIT",
    evidence: [
      E("job_posting", "hiring", "role_relevance", 0.9, 5, "Hiring a Clinical Knowledge Engineer to structure protocol documentation", "/careers/knowledge-engineer"),
      E("press_release", "product_launch", "intent_signal", 0.88, 16, "Announced company-wide internal AI knowledge initiative", "/press/ai-initiative"),
      E("blog_post", "content", "problem_evidence", 0.86, 24, "Post describes difficulty keeping clinical and engineering documentation consistent", "/blog/doc-consistency"),
      E("tech_stack", "technology", "product_fit", 0.8, 33, "Engineering handbook is public and written in Markdown", "/handbook"),
      E("job_posting", "hiring", "product_fit", 0.76, 5, "Hiring a Platform Engineer with LLM integration experience", "/careers/platform"),
    ],
    reply: { subject: "Automatic reply: Out of office", body: "I am out of the office until next Monday with limited access to email. For urgent matters contact the team inbox.", daysAfterSend: 0 },
  },
  {
    slug: "tessera-robotics", name: "Tessera Robotics", industry: "Robotics / AI", size: "100–200", location: "Munich, Germany", source: "search",
    reason: "Hiring knowledge roles; engineering blog on documentation", expected: "HIGH_FIT",
    evidence: [
      E("job_posting", "hiring", "role_relevance", 0.9, 4, "Hiring a Knowledge Management Lead for the engineering org", "/careers/km-lead"),
      E("blog_post", "content", "problem_evidence", 0.88, 13, "Engineering post: 'Why our new hires take 3 months to find the right document'", "/blog/onboarding"),
      E("github_repo", "technology", "product_fit", 0.84, 19, "Public robotics SDK with Markdown documentation and active issues", "/github/sdk"),
      E("press_release", "product_launch", "intent_signal", 0.82, 21, "Announced internal 'AI copilots for engineers' program", "/press/copilots"),
      E("company_page", "company_profile", "product_fit", 0.78, 50, "Engineering team of 120 across 3 sites", "/about"),
    ],
    reply: { subject: "Re: Onboarding documentation at Tessera", body: "Not the right time for us — we just committed to another vendor for this. Please check back next year.", daysAfterSend: 5 },
  },
  {
    slug: "lumen-fintech", name: "Lumen Fintech", industry: "Fintech", size: "500–1,000", location: "New York, NY", source: "csv",
    reason: "Imported list; matches AI hiring and documentation signals", expected: "HIGH_FIT",
    evidence: [
      E("job_posting", "hiring", "role_relevance", 0.9, 6, "Hiring an Engineering Productivity Manager focused on documentation and onboarding", "/careers/eng-productivity"),
      E("job_posting", "hiring", "intent_signal", 0.88, 6, "Hiring two AI Engineers for internal developer tooling", "/careers/ai-engineer"),
      E("blog_post", "content", "problem_evidence", 0.85, 17, "Blog post about compliance documentation scattered across wikis and tickets", "/blog/compliance-docs"),
      E("tech_stack", "technology", "product_fit", 0.82, 29, "Public engineering blog shows Markdown-based ADR process", "/blog/adr"),
      E("documentation", "technology", "product_fit", 0.75, 41, "Public API documentation generated from Markdown", "/docs/api"),
    ],
    reply: { subject: "Re: Compliance documentation at Lumen", body: "Thanks for the note. We'd like to see it. Please send over available slots for a 30-min intro, our platform lead will join.", daysAfterSend: 3 },
  },
  {
    slug: "sable-security", name: "Sable Security", industry: "Cybersecurity", size: "200–500", location: "Tel Aviv, Israel", source: "search",
    reason: "Hiring knowledge engineer; open-source agent tooling", expected: "HIGH_FIT",
    evidence: [
      E("job_posting", "hiring", "role_relevance", 0.9, 8, "Hiring a Security Knowledge Engineer to maintain detection documentation", "/careers/knowledge-engineer"),
      E("github_repo", "technology", "product_fit", 0.88, 12, "Open-source detection-rule repository documented in Markdown", "/github/rules"),
      E("blog_post", "content", "problem_evidence", 0.84, 20, "Post on analysts spending hours locating the right runbook", "/blog/runbooks"),
      E("press_release", "product_launch", "intent_signal", 0.8, 26, "Launched an AI assistant feature for security analysts", "/press/ai-assistant"),
      E("social_post", "content", "intent_signal", 0.72, 9, "Engineering lead shared an article about agentic documentation", "/social/eng-lead"),
    ],
    stopAt: "CONTACTED",
  },

  // ──────────────────────────── MEDIUM FIT (9) ────────────────────────────
  {
    slug: "example-labs", name: "Example Labs", industry: "AI Research", size: "50–200", location: "Seattle, WA", source: "search",
    reason: "AI research org publishing agent work; no hiring signal", expected: "MEDIUM_FIT",
    evidence: [
      E("github_repo", "technology", "product_fit", 0.9, 7, "Publishes research code with detailed Markdown READMEs", "/github"),
      E("blog_post", "content", "problem_evidence", 0.8, 30, "Research post mentions difficulty organizing experimental notes", "/blog/lab-notes"),
      E("company_page", "company_profile", "role_relevance", 0.7, 60, "Team page lists research engineers and a developer advocate", "/team"),
      E("social_post", "content", "intent_signal", 0.55, 15, "Researcher tweeted about trying an LLM wiki tool", "/social/researcher"),
    ],
    reply: { subject: "Re: Organizing research notes", body: "Thanks for reaching out. Not a priority this quarter, but keep me posted on the open-source side.", daysAfterSend: 6 },
  },
  {
    slug: "dataworks", name: "DataWorks", industry: "Data Engineering SaaS", size: "200–500", location: "Chicago, IL", source: "csv",
    reason: "Imported; engineering blog with documentation topics", expected: "MEDIUM_FIT",
    evidence: [
      E("blog_post", "content", "problem_evidence", 0.85, 25, "Post on maintaining data pipeline documentation across teams", "/blog/pipeline-docs"),
      E("job_posting", "hiring", "role_relevance", 0.75, 14, "Hiring a Developer Advocate", "/careers/devadvocate"),
      E("tech_stack", "technology", "product_fit", 0.7, 40, "Docs site uses a Markdown-based generator", "/docs"),
      E("company_page", "company_profile", "intent_signal", 0.5, 70, "Company page mentions 'AI-ready' data platform", "/about"),
    ],
    reply: { subject: "Re: Pipeline documentation at DataWorks", body: "We've a lot on our plate, but the role-specific pages idea is interesting. Could you share a demo video?", daysAfterSend: 4 },
  },
  {
    slug: "brightpath-edtech", name: "BrightPath EdTech", industry: "EdTech", size: "100–200", location: "Denver, CO", source: "search",
    reason: "AI initiative announced; documentation pain in blog", expected: "MEDIUM_FIT",
    evidence: [
      E("press_release", "product_launch", "intent_signal", 0.82, 18, "Announced an AI tutoring initiative", "/press/ai-tutor"),
      E("blog_post", "content", "problem_evidence", 0.78, 35, "Post mentions scattered curriculum documentation across tools", "/blog/curriculum-docs"),
      E("company_page", "company_profile", "product_fit", 0.65, 80, "Engineering team of ~40", "/about"),
      E("job_posting", "hiring", "role_relevance", 0.6, 20, "Hiring a Product Manager, Platform", "/careers/pm-platform"),
    ],
    reply: { subject: "Re: Curriculum documentation", body: "Please remove me from your list.", daysAfterSend: 2 },
  },
  {
    slug: "kestrel-logistics", name: "Kestrel Logistics Tech", industry: "Logistics Software", size: "200–500", location: "Rotterdam, Netherlands", source: "search",
    reason: "AI hiring; large engineering org", expected: "MEDIUM_FIT",
    evidence: [
      E("job_posting", "hiring", "intent_signal", 0.85, 9, "Hiring an ML Engineer for internal tooling", "/careers/ml-engineer"),
      E("company_page", "company_profile", "product_fit", 0.72, 55, "Engineering organisation of 150 people", "/about"),
      E("blog_post", "content", "problem_evidence", 0.7, 40, "Post mentions onboarding new engineers takes too long", "/blog/onboarding"),
      E("documentation", "technology", "role_relevance", 0.6, 65, "Public API docs mention a platform team", "/docs"),
    ],
    reply: { subject: "Re: Onboarding engineers at Kestrel", body: "Thanks, could be relevant for our platform team. Forwarding to them; they'll reach out if interested.", daysAfterSend: 5 },
  },
  {
    slug: "verdant-climate", name: "Verdant Climate", industry: "Climate Tech", size: "50–200", location: "Copenhagen, Denmark", source: "github",
    reason: "Open-source data tooling with Markdown docs", expected: "MEDIUM_FIT",
    evidence: [
      E("github_repo", "technology", "product_fit", 0.88, 10, "Open-source climate data toolkit documented in Markdown", "/github/toolkit"),
      E("blog_post", "content", "problem_evidence", 0.72, 28, "Post on keeping methodology docs synchronized with code", "/blog/methodology"),
      E("company_page", "company_profile", "role_relevance", 0.65, 90, "Team page lists a developer relations role", "/team"),
      E("social_post", "content", "intent_signal", 0.5, 12, "Shared an article about AI for scientific documentation", "/social/share"),
    ],
    stopAt: "CONTACTED",
  },
  {
    slug: "harbor-commerce", name: "Harbor Commerce Cloud", industry: "E-commerce SaaS", size: "500–1,000", location: "Sydney, Australia", source: "csv",
    reason: "Imported; AI launch and docs generator", expected: "MEDIUM_FIT",
    evidence: [
      E("press_release", "product_launch", "intent_signal", 0.8, 22, "Launched AI product-description generator", "/press/ai-descriptions"),
      E("documentation", "technology", "product_fit", 0.75, 45, "Developer docs built from Markdown", "/developers"),
      E("job_posting", "hiring", "role_relevance", 0.7, 16, "Hiring a Technical Writer", "/careers/tech-writer"),
      E("company_page", "company_profile", "problem_evidence", 0.55, 100, "Engineering blog mentions 30+ microservices teams", "/engineering"),
    ],
    reply: { subject: "Re: Developer documentation at Harbor", body: "Interested. Our docs team has been asking for something like this. Can we schedule a call for next week?", daysAfterSend: 3 },
  },
  {
    slug: "maya-chen", name: "Maya Chen — Independent AI Consultant", entity_type: "individual", display_name: "Maya Chen", headline: "Independent AI engineer & technical writer",
    industry: "Consulting (solo)", size: "1", location: "Vancouver, Canada", source: "github",
    reason: "Publishes agent projects and documentation guides on GitHub", expected: "MEDIUM_FIT",
    evidence: [
      E("github_repo", "technology", "product_fit", 0.9, 4, "Maintains a popular open-source guide to LLM agent patterns (Markdown)", "/github/agent-patterns"),
      E("blog_post", "content", "problem_evidence", 0.8, 11, "Wrote about clients' fragmented technical documentation", "/blog/client-docs"),
      E("social_post", "content", "intent_signal", 0.7, 5, "Asked followers for tools that auto-structure documentation", "/social/ask"),
      E("company_page", "company_profile", "role_relevance", 0.6, 30, "Personal site lists technical writing and AI engineering services", "/"),
    ],
    reply: { subject: "Re: Auto-structuring docs", body: "Oh nice, this is exactly what I asked about last week. Very interested — happy to try it on a client project and give feedback.", daysAfterSend: 1 },
  },
  {
    slug: "pinewood-games", name: "Pinewood Games", industry: "Game Development", size: "100–200", location: "Montreal, Canada", source: "search",
    reason: "Engineering blog on documentation; Markdown handbook", expected: "MEDIUM_FIT",
    evidence: [
      E("blog_post", "content", "problem_evidence", 0.8, 27, "Post on engine documentation being out of date", "/blog/engine-docs"),
      E("tech_stack", "technology", "product_fit", 0.75, 48, "Studio handbook is public and written in Markdown", "/handbook"),
      E("job_posting", "hiring", "role_relevance", 0.65, 19, "Hiring a Tools Programmer", "/careers/tools"),
      E("social_post", "content", "intent_signal", 0.45, 14, "Studio account shared an article on AI in game production", "/social/share"),
    ],
    stopAt: "DRAFTED",
  },
  {
    slug: "atlas-biotech", name: "Atlas Biotech Informatics", industry: "Biotech Software", size: "50–200", location: "Cambridge, UK", source: "search",
    reason: "Knowledge management article; AI role", expected: "MEDIUM_FIT",
    evidence: [
      E("blog_post", "content", "problem_evidence", 0.85, 15, "Post on scientists unable to find prior experiment documentation", "/blog/experiment-docs"),
      E("job_posting", "hiring", "intent_signal", 0.78, 10, "Hiring an AI Engineer, Knowledge Systems", "/careers/ai-knowledge"),
      E("company_page", "company_profile", "role_relevance", 0.6, 75, "Team page lists a platform engineering group", "/team"),
      E("documentation", "technology", "product_fit", 0.6, 60, "Docs site uses Markdown", "/docs"),
    ],
    reply: { subject: "Re: Experiment documentation at Atlas", body: "Thanks. We're evaluating options. Could you share pricing and whether it supports on-prem deployment?", daysAfterSend: 4 },
  },

  // ───────────────────────────── REJECT (7) ─────────────────────────────
  {
    slug: "talentbridge", name: "TalentBridge Recruiting", industry: "Recruitment Agency", size: "50–200", location: "Dallas, TX", source: "search",
    reason: "Appeared in search for 'hiring AI engineers' — many AI job posts", expected: "REJECT",
    evidence: [
      E("job_posting", "hiring", "role_relevance", 0.85, 3, "Posts dozens of AI engineer roles on behalf of clients", "/jobs"),
      E("company_page", "negative", "product_fit", 0.95, 30, "Company is a recruitment agency; no internal engineering team", "/about", true),
      E("company_page", "negative", "role_relevance", 0.9, 30, "Job posts are for third-party clients, not internal roles", "/about", true),
      E("company_page", "company_profile", "intent_signal", 0.4, 30, "Website mentions 'AI-driven matching'", "/"),
    ],
  },
  {
    slug: "summit-consulting", name: "Summit Strategy Consulting", industry: "Management Consulting", size: "200–500", location: "Zurich, Switzerland", source: "search",
    reason: "Published a knowledge-management whitepaper", expected: "REJECT",
    evidence: [
      E("blog_post", "content", "problem_evidence", 0.8, 20, "Published a whitepaper on enterprise knowledge management", "/insights/km-whitepaper"),
      E("company_page", "negative", "product_fit", 0.92, 40, "Consulting-only firm with no software product or engineering team", "/about", true),
      E("company_page", "negative", "role_relevance", 0.85, 40, "No technical roles listed on careers page", "/careers", true),
    ],
  },
  {
    slug: "cobalt-manufacturing", name: "Cobalt Manufacturing", industry: "Industrial Manufacturing", size: "1,000+", location: "Detroit, MI", source: "csv",
    reason: "Imported from CSV list", expected: "REJECT",
    evidence: [
      E("company_page", "company_profile", "product_fit", 0.6, 90, "Manufactures industrial components", "/about"),
      E("company_page", "negative", "role_relevance", 0.8, 90, "No software engineering or documentation roles on careers page", "/careers", true),
    ],
  },
  {
    slug: "stealth-startup", name: "Stealth Startup (unnamed)", industry: "Unknown", size: "Unknown", location: "Unknown", source: "search",
    reason: "Founder mentioned 'building AI agents' on social", expected: "REJECT",
    evidence: [
      E("social_post", "content", "intent_signal", 0.45, 6, "Founder post says they are 'building something with AI agents'", "/social/founder"),
    ],
  },
  {
    slug: "greenfield-realty", name: "Greenfield Realty Group", industry: "Real Estate", size: "50–200", location: "Phoenix, AZ", source: "search",
    reason: "Matched keyword 'knowledge base' on website", expected: "REJECT",
    evidence: [
      E("company_page", "company_profile", "problem_evidence", 0.5, 45, "Website has a customer FAQ labelled 'knowledge base'", "/help"),
      E("company_page", "negative", "product_fit", 0.9, 45, "Real estate brokerage with no technical team", "/about", true),
      E("company_page", "negative", "role_relevance", 0.85, 45, "Careers page lists only agent and admin roles", "/careers", true),
    ],
  },
  {
    slug: "jordan-lee", name: "Jordan Lee — Marketing Freelancer", entity_type: "individual", display_name: "Jordan Lee", headline: "Freelance growth marketer",
    industry: "Marketing (solo)", size: "1", location: "Lisbon, Portugal", source: "github",
    reason: "GitHub profile forked an AI agent repository", expected: "REJECT",
    evidence: [
      E("github_repo", "technology", "product_fit", 0.4, 8, "Forked an AI agent repository (no commits)", "/github"),
      E("company_page", "negative", "role_relevance", 0.85, 20, "Personal site offers marketing services only; no technical writing or engineering", "/", true),
      E("social_post", "negative", "intent_signal", 0.6, 10, "Posts focus on marketing tactics, not documentation or engineering", "/social", true),
    ],
  },
  {
    slug: "aurora-ai-media", name: "Aurora AI Media", industry: "Media / Content", size: "20–50", location: "Los Angeles, CA", source: "search",
    reason: "Company name contains 'AI'", expected: "REJECT",
    evidence: [
      E("company_page", "company_profile", "product_fit", 0.5, 30, "Produces AI-themed news and video content", "/about"),
      E("company_page", "negative", "product_fit", 0.85, 30, "No engineering team or technical documentation", "/team", true),
      E("company_page", "negative", "role_relevance", 0.8, 30, "Roles are editorial and video production", "/careers", true),
    ],
  },
];
