"use client";

import { HeartHandshake, Search, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Empty, ErrorState, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { Guardian, Student } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function ParentsPage() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const term = useDebounced(search);
  const toast = useToast();
  const parents = useApi<Page<Guardian>>(`guardians/?search=${encodeURIComponent(term)}`);

  return (
    <>
      <PageHeader title="Parents" subtitle="Parents can also be added from a student's page." actions={!adding ? <Button onClick={() => setAdding(true)}><UserPlus aria-hidden /> Add parent</Button> : undefined} />
      {adding && <AddParent onDone={() => { setAdding(false); parents.reload(); toast.success("Parent added. Their invite is on its way."); }} onCancel={() => setAdding(false)} />}
      <Card>
        <Field label="Search" icon={<Search aria-hidden />} type="search" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
        {parents.error && !parents.data ? <ErrorState message={parents.error} onRetry={parents.reload} /> : parents.loading && !parents.data ? <Loading variant="table" /> : rows(parents.data).length === 0 ? <Empty icon={<HeartHandshake aria-hidden />}>{term ? "No parents match." : "No parents yet."}</Empty> : (
          <DataTable
            rows={rows(parents.data)}
            rowKey={(g) => g.id}
            columns={[
              { header: "Name", cell: (g) => <span className="flex items-center gap-3"><Avatar name={g.name} size="sm" /><span><span className="block font-medium">{g.name}</span><span className="block text-xs text-soft">{g.relation}</span></span></span> },
              { header: "Contact", cell: (g) => [g.email, g.phone].filter(Boolean).join(" · ") },
              { header: "Children", cell: (g) => g.children.map((c) => `${c.name}${c.section_name ? ` (${c.section_name})` : ""}`).join(", ") || "-" },
              { header: "Login", cell: (g) => <Badge tone={statusTone(g.login_status)}>{g.login_status}</Badge> },
            ]}
          />
        )}
      </Card>
    </>
  );
}

function AddParent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const form = useForm({ name: "", relation: "", email: "", phone: "" });
  const [search, setSearch] = useState("");
  const [children, setChildren] = useState<Student[]>([]);
  const term = useDebounced(search);
  const matches = useApi<Page<Student>>(term.length >= 2 ? `students/?search=${encodeURIComponent(term)}` : null);

  return (
    <Card title="New parent" icon={<UserPlus aria-hidden />} className="mb-5 animate-enter">
      <form onSubmit={form.submit((v) => api("guardians/", { method: "POST", body: { ...compact(v), child_ids: children.map((c) => c.id) } }), onDone)} className="space-y-4">
        {form.error && <Alert>{form.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Full name" required {...form.bind("name")} />
          <Field label="Relation" placeholder="Mother" {...form.bind("relation")} />
          <Field label="Email" type="email" {...form.bind("email")} />
          <Field label="Phone" type="tel" {...form.bind("phone")} />
        </div>
        <div>
          <Field label="Link children" icon={<Search aria-hidden />} placeholder="Type a student's name" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          {search.length >= 2 && (
            <ul className="mt-2 max-w-sm animate-fade space-y-1 rounded-xl border border-line bg-surface p-1 text-sm shadow-[var(--shadow-card)]">
              {rows(matches.data).filter((s) => !children.some((c) => c.id === s.id)).slice(0, 5).map((s) => (
                <li key={s.id}>
                  <button type="button" className="min-h-10 w-full rounded-lg px-3 py-1.5 text-left hover:bg-muted" onClick={() => { setChildren([...children, s]); setSearch(""); }}>
                    {s.name} <span className="text-soft">{s.current_enrollment?.section_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {children.map((c) => (
              <button type="button" key={c.id} onClick={() => setChildren(children.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-semibold text-brand transition hover:bg-brand/15">
                {c.name} <X className="size-3.5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" busy={form.busy}>Save and send invite</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
