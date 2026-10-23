"use client";

import { ShieldCheck, UserPlus } from "lucide-react";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, ErrorState, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

type Admin = { id: string; name: string; email: string; phone: string | null; login_status: string };

export default function AdminsPage() {
  const { user } = useSession();
  const admins = useApi<Admin[]>("admins/");
  const form = useForm({ name: "", email: "", phone: "" });
  const toast = useToast();
  const dialog = useDialog();

  const remove = async (a: Admin) => {
    if (!(await dialog.confirm({ title: `Remove admin rights from ${a.name}?`, body: "Their login stays; they just can't manage the school any more.", confirmLabel: "Remove admin", danger: true }))) return;
    try {
      await api(`admins/${a.id}/`, { method: "DELETE" });
      toast.success(`${a.name} is no longer an admin.`);
      admins.reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader title="School admins" subtitle="Admins can register people and change school settings." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Admins" icon={<ShieldCheck aria-hidden />}>
          {admins.error && !admins.data ? <ErrorState message={admins.error} onRetry={admins.reload} /> : !admins.data ? <Loading /> : (
            <DataTable
              rows={admins.data}
              rowKey={(a) => a.id}
              columns={[
                { header: "Name", cell: (a) => <span className="flex items-center gap-3"><Avatar name={a.name} size="sm" /><span className="min-w-0"><span className="block font-medium">{a.name}</span><span className="block truncate text-xs text-soft">{a.email}</span></span></span> },
                { header: "Login", cell: (a) => <Badge tone={statusTone(a.login_status)}>{a.login_status}</Badge> },
                { header: "", cell: (a) => a.id !== user?.id && <button className="text-sm font-medium text-red-600" onClick={() => remove(a)}>Remove</button> },
              ]}
            />
          )}
        </Card>
        <Card title="Add an admin" icon={<UserPlus aria-hidden />}>
          <form onSubmit={form.submit((v) => api("admins/", { method: "POST", body: compact(v) }), () => { admins.reload(); toast.success("Admin added. Their invite is on its way."); })} className="space-y-3">
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
