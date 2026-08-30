/**
 * CRM integration boundary (Spec §29). Designed now, not implemented.
 */
import type { Lead, Outcome } from "@/core/schemas";

export interface CRMAccountRef { id: string }
export interface CRMContactRef { id: string }
export interface CRMLeadRef { id: string }

export interface CRMAdapter {
  readonly name: string;
  createAccount(lead: Lead): Promise<CRMAccountRef>;
  createContact(lead: Lead, account: CRMAccountRef): Promise<CRMContactRef>;
  createLead(lead: Lead, account: CRMAccountRef, contact: CRMContactRef): Promise<CRMLeadRef>;
  addActivity(ref: CRMLeadRef, outcome: Outcome): Promise<void>;
}

/** In-memory adapter that records calls so "Convert to CRM" can be demoed and tested. */
export class DemoCRMAdapter implements CRMAdapter {
  readonly name = "demo";
  readonly calls: Array<{ method: string; args: unknown[] }> = [];
  private n = 0;
  private ref(prefix: string) { return { id: `${prefix}_${++this.n}` }; }

  async createAccount(lead: Lead) { this.calls.push({ method: "createAccount", args: [lead.id] }); return this.ref("acc"); }
  async createContact(lead: Lead, account: CRMAccountRef) { this.calls.push({ method: "createContact", args: [lead.id, account.id] }); return this.ref("con"); }
  async createLead(lead: Lead, account: CRMAccountRef, contact: CRMContactRef) { this.calls.push({ method: "createLead", args: [lead.id, account.id, contact.id] }); return this.ref("crm_lead"); }
  async addActivity(ref: CRMLeadRef, outcome: Outcome) { this.calls.push({ method: "addActivity", args: [ref.id, outcome.outcome] }); }
}
