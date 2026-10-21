"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, DataTable, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

type Admin = { id: string; name: string; email: string; phone: string | null; login_status: string };

export default function AdminsPage() {
  const { user } = useSession();
  const admins = useApi<Admin[]>("admins/");
  const form = useForm({ name: "", email: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const remove = async (a: Admin) => {
    if (!confirm(`Remove admin rights from ${a.name}? Their login stays.`)) return;
    try {
      await api(`admins/${a.id}/`, { method: "DELETE" });
      admins.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That did not work.");
    }
  };

  return (
    <>
      <PageHeader title="School admins" subtitle="Admins can register people and change school settings." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Admins">
          {error && <div className="mb-3"><Alert>{error}</Alert></div>}
          {!admins.data ? <Loading /> : (
            <DataTable
              rows={admins.data}
              rowKey={(a) => a.id}
              columns={[
                { header: "Name", cell: (a) => <><div className="font-medium">{a.name}</div><div className="text-xs text-soft">{a.email}</div></> },
                { header: "Login", cell: (a) => <Badge tone={statusTone(a.login_status)}>{a.login_status}</Badge> },
                { header: "", cell: (a) => a.id !== user?.id && <button className="text-xs text-red-600" onClick={() => remove(a)}>Remove</button> },
              ]}
            />
          )}
        </Card>
        <Card title="Add an admin">
          <form onSubmit={form.submit((v) => api("admins/", { method: "POST", body: compact(v) }), admins.reload)} className="space-y-3">
            {form.error && <Alert>{form.error}</Alert>}
            <Field label="Full name" required {...form.bind("name")} />
            <Field label="Email" type="email" required {...form.bind("email")} />
            <Field label="Phone" type="tel" {...form.bind("phone")} />
            <Button type="submit" busy={form.busy}>Add and send invite</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
