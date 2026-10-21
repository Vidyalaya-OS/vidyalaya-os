"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { Guardian, Student } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function ParentsPage() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const parents = useApi<Page<Guardian>>(`guardians/?search=${encodeURIComponent(search)}`);

  return (
    <>
      <PageHeader title="Parents" subtitle="Parents can also be added from a student's page." actions={!adding ? <Button onClick={() => setAdding(true)}>Add parent</Button> : undefined} />
      {adding && <AddParent onDone={() => { setAdding(false); parents.reload(); }} onCancel={() => setAdding(false)} />}
      <Card>
        <Field label="Search" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
        {parents.loading && !parents.data ? <Loading /> : rows(parents.data).length === 0 ? <Empty>No parents yet.</Empty> : (
          <DataTable
            rows={rows(parents.data)}
            rowKey={(g) => g.id}
            columns={[
              { header: "Name", cell: (g) => <><div className="font-medium">{g.name}</div><div className="text-xs text-soft">{g.relation}</div></> },
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
  const matches = useApi<Page<Student>>(search.length >= 2 ? `students/?search=${encodeURIComponent(search)}` : null);

  return (
    <Card title="New parent" className="mb-5">
      <form onSubmit={form.submit((v) => api("guardians/", { method: "POST", body: { ...compact(v), child_ids: children.map((c) => c.id) } }), onDone)} className="space-y-4">
        {form.error && <Alert>{form.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Full name" required {...form.bind("name")} />
          <Field label="Relation" placeholder="Mother" {...form.bind("relation")} />
          <Field label="Email" type="email" {...form.bind("email")} />
          <Field label="Phone" type="tel" {...form.bind("phone")} />
        </div>
        <div>
          <Field label="Link children" placeholder="Type a student's name" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          {search.length >= 2 && (
            <ul className="mt-2 max-w-sm space-y-1 text-sm">
              {rows(matches.data).filter((s) => !children.some((c) => c.id === s.id)).slice(0, 5).map((s) => (
                <li key={s.id}>
                  <button type="button" className="w-full rounded-md px-2 py-1 text-left hover:bg-muted" onClick={() => { setChildren([...children, s]); setSearch(""); }}>
                    {s.name} <span className="text-soft">{s.current_enrollment?.section_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {children.map((c) => (
              <button type="button" key={c.id} onClick={() => setChildren(children.filter((x) => x.id !== c.id))} title="Remove">
                <Badge>{c.name} ✕</Badge>
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
