import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { ErrorAlert } from "@/components/ui/alert";
import Link from "next/link";
import { createProjectAction } from "../actions";
import { getT } from "@/lib/i18n.server";

export default async function NewProject({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { t } = await getT();
  return (
    <>
      <PageHeader title={t("New project")} subtitle={t("Describe what you are promoting. The Product Understanding Agent takes it from here.")} />
      <Card className="max-w-2xl">
        <CardContent className="pt-5">
          <ErrorAlert message={error} />
          <form action={createProjectAction} className="space-y-4">
            <Field label={t("Product name")}><Input name="name" required placeholder="LLM Wiki Agent" /></Field>
            <Field label={t("Category")} hint={t("optional")}>
              <Input name="category" list="category-options" placeholder="Developer Tool / Knowledge Management" />
              <datalist id="category-options">
                <option value="Developer Tool / Knowledge Management" /><option value="AI / ML Platform" /><option value="SaaS / B2B Software" />
                <option value="Data / Analytics" /><option value="Security / Compliance" /><option value="E-commerce" /><option value="Fintech" />
                <option value="IoT / Digital Twin" /><option value="Healthcare / Biotech" /><option value="Open Source Project" />
              </datalist>
            </Field>
            <Field label={t("Description")}><Textarea name="description" rows={4} placeholder="Multi-agent system that transforms raw source material into role-specific interconnected knowledge pages." /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Website")} hint={t("optional")}><Input name="website" type="url" placeholder="https://" /></Field>
              <Field label={t("GitHub repository")} hint={t("optional")}><Input name="repository" type="url" placeholder="https://github.com/…" /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Link href="/projects"><Button type="button" variant="ghost">{t("Cancel")}</Button></Link><Button type="submit" variant="primary">{t("Create project")}</Button></div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
