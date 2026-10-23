"use client";

import { Building2, CalendarRange, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Field, PageHeader, Select, StickyBar } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const EMPTY = {
  name: "", subdomain: "", board: "", address: "", plan: "trial", timezone: "Asia/Kolkata", currency: "INR",
  admin_name: "", admin_email: "", admin_phone: "",
  academic_year_name: "", academic_year_start: "", academic_year_end: "",
};

export default function NewSchool() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ""));
    try {
      await api("platform/schools/", { method: "POST", body, school: null });
      toast.success(`${form.name} is ready. The admin's invite is on its way.`);
      router.push("/platform");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(Object.keys(err.fields).length ? "Check the highlighted fields." : err.message);
      } else setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader back={{ href: "/platform", label: "Schools" }} title="Onboard a school" subtitle="The school's admin gets an email invite to set their password and finish setup." />
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Card title="School" icon={<Building2 aria-hidden />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School name" required value={form.name} onChange={set("name")} error={errors.name} />
            <Field label="Web address" required value={form.subdomain} onChange={set("subdomain")} error={errors.subdomain} hint={`${form.subdomain || "greenvalley"}.yourapp.com`} />
            <Field label="Board" placeholder="CBSE, ICSE, State" value={form.board} onChange={set("board")} error={errors.board} />
            <Select label="Plan" value={form.plan} onChange={set("plan")}>
              <option value="trial">Trial</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </Select>
            <Field label="Address" className="sm:col-span-2" value={form.address} onChange={set("address")} error={errors.address} />
            <Field label="Time zone" value={form.timezone} onChange={set("timezone")} error={errors.timezone} />
            <Field label="Currency" maxLength={3} value={form.currency} onChange={set("currency")} error={errors.currency} />
          </div>
        </Card>
        <Card title="Academic year" icon={<CalendarRange aria-hidden />} description="Optional. The admin can add it later.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" placeholder="2026-27" value={form.academic_year_name} onChange={set("academic_year_name")} error={errors.academic_year_name} />
            <Field label="Starts" type="date" value={form.academic_year_start} onChange={set("academic_year_start")} error={errors.academic_year_start} />
            <Field label="Ends" type="date" value={form.academic_year_end} onChange={set("academic_year_end")} error={errors.academic_year_end} />
          </div>
        </Card>
        <Card title="First admin" icon={<UserCog aria-hidden />} description="They get an email to set their password.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" required value={form.admin_name} onChange={set("admin_name")} error={errors.admin_name} />
            <Field label="Email" type="email" required value={form.admin_email} onChange={set("admin_email")} error={errors.admin_email} />
            <Field label="Phone" type="tel" value={form.admin_phone} onChange={set("admin_phone")} error={errors.admin_phone} />
          </div>
        </Card>
        <StickyBar>
          <Button type="submit" busy={busy}>Create school and send invite</Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        </StickyBar>
      </form>
    </>
  );
}
