/**
 * Mock resolvers for product.understand and icp.suggest (DEMO mode).
 * Keyword-driven so a visitor can type a new product and get a sensible,
 * deterministic ICP without any API key.
 */

type PUPrompt = { name: string; description: string; category_hint?: string; website?: string; repository?: string; notes?: string };
type ICPPrompt = {
  product: string;
  understanding: { category: string; problem: string[]; value_propositions: string[]; target_roles: string[]; target_company_types: string[] };
};

interface Profile {
  match: RegExp;
  category: string;
  problems: string[];
  values: string[];
  roles: string[];
  companyTypes: string[];
  industries: string[];
  technologies: string[];
  positive: string[];
  negative: string[];
  size: { min: number; max: number };
}

const PROFILES: Profile[] = [
  {
    match: /(wiki|knowledge|documentation|docs|rag|notes)/i,
    category: "Developer Tool / Knowledge Management",
    problems: ["fragmented technical knowledge", "role-specific information overload", "documentation drift"],
    values: ["automatic knowledge structuring", "multi-perspective documentation", "always-current role-aware pages"],
    roles: ["Developer Relations", "Knowledge Manager", "AI Platform Engineer", "Engineering Productivity"],
    companyTypes: ["AI infrastructure company", "developer tools company", "engineering-heavy SaaS"],
    industries: ["AI / Developer Tools / SaaS", "Engineering-heavy product companies"],
    technologies: ["Markdown documentation", "RAG", "LLM agents", "GitHub"],
    positive: ["Hiring knowledge engineers", "Launching RAG systems", "Using Markdown documentation", "Publishing AI-agent projects"],
    negative: ["Recruitment agency", "Consulting-only company", "No technical team"],
    size: { min: 20, max: 2000 },
  },
  {
    match: /(agent|automation|workflow|orchestrat)/i,
    category: "AI Agent Platform",
    problems: ["manual multi-step operational work", "brittle hand-built automations", "no visibility into agent behaviour"],
    values: ["composable agent workflows", "observable, auditable runs", "human-in-the-loop controls"],
    roles: ["Platform Engineer", "Head of Operations", "Automation Lead", "CTO"],
    companyTypes: ["operations-heavy SaaS", "AI-native startups", "mid-market with internal tooling teams"],
    industries: ["SaaS", "Fintech", "Logistics", "E-commerce"],
    technologies: ["LLM APIs", "workflow engines", "Python / TypeScript"],
    positive: ["Hiring automation or platform engineers", "Announced internal AI initiative", "Published posts about agent workflows"],
    negative: ["No engineering team", "Regulated industries requiring on-prem only"],
    size: { min: 50, max: 5000 },
  },
  {
    match: /(analytics|data|dashboard|metrics|bi\b)/i,
    category: "Data / Analytics Tool",
    problems: ["slow access to trustworthy metrics", "duplicated dashboards", "data team bottleneck"],
    values: ["self-serve analytics", "single source of truth", "faster decision cycles"],
    roles: ["Head of Data", "Analytics Engineer", "Product Manager", "RevOps"],
    companyTypes: ["product-led SaaS", "marketplaces", "data-mature scale-ups"],
    industries: ["SaaS", "E-commerce", "Marketplaces"],
    technologies: ["dbt", "Snowflake / BigQuery", "Looker / Metabase"],
    positive: ["Hiring analytics engineers", "Migrating data warehouse", "Published data-team blog posts"],
    negative: ["No data team", "Agency / consultancy"],
    size: { min: 50, max: 3000 },
  },
  {
    match: /(security|compliance|audit|vulnerab)/i,
    category: "Security / Compliance Tool",
    problems: ["audit preparation overhead", "unclear security posture", "manual evidence collection"],
    values: ["continuous compliance", "automated evidence", "clear risk visibility"],
    roles: ["CISO", "Security Engineer", "Compliance Manager", "Head of IT"],
    companyTypes: ["B2B SaaS selling to enterprise", "fintech", "healthtech"],
    industries: ["SaaS", "Fintech", "Healthcare"],
    technologies: ["SOC 2 / ISO 27001", "cloud infrastructure", "identity providers"],
    positive: ["Hiring security or compliance roles", "Announced SOC 2 / ISO effort", "Enterprise customer announcements"],
    negative: ["Consumer-only products", "No cloud footprint"],
    size: { min: 30, max: 5000 },
  },
];

const FALLBACK: Profile = {
  match: /.*/,
  category: "B2B Software",
  problems: ["manual, repetitive work in the target workflow", "lack of visibility", "slow iteration"],
  values: ["automation of the core workflow", "clear reporting", "faster time to value"],
  roles: ["Head of Operations", "Product Manager", "Engineering Manager"],
  companyTypes: ["B2B SaaS", "digital-first mid-market companies"],
  industries: ["SaaS", "Technology"],
  technologies: ["cloud SaaS stack"],
  positive: ["Hiring in the relevant function", "Recent product launch", "Published content about the problem"],
  negative: ["No budget owner identified", "Agency / consultancy"],
  size: { min: 20, max: 2000 },
};

function profileFor(text: string): Profile {
  return PROFILES.find((p) => p.match.test(text)) ?? FALLBACK;
}

export function productUnderstandingHeuristic(p: PUPrompt) {
  const text = `${p.name} ${p.description} ${p.category_hint ?? ""} ${p.notes ?? ""}`;
  const pr = profileFor(text);
  const mentionsGithub = /github/i.test(text) || !!p.repository;
  return {
    category: p.category_hint || pr.category,
    problem: pr.problems,
    value_propositions: pr.values,
    target_roles: mentionsGithub && !pr.roles.includes("Developer Relations") ? [...pr.roles, "Developer Relations"] : pr.roles,
    target_company_types: pr.companyTypes,
    confidence: p.description.length > 60 ? 0.86 : 0.7,
  };
}

export function icpSuggestHeuristic(p: ICPPrompt) {
  const pr = profileFor(`${p.product} ${p.understanding.category} ${p.understanding.problem.join(" ")}`);
  return {
    target_entity: /developer|open.?source|github/i.test(p.understanding.category + p.understanding.target_company_types.join(" ")) ? "both" : "company",
    industries: pr.industries,
    company_size: pr.size,
    regions: ["North America", "Europe"],
    technologies: pr.technologies,
    target_roles: p.understanding.target_roles,
    business_problems: p.understanding.problem,
    positive_signals: pr.positive,
    negative_signals: pr.negative,
  };
}
