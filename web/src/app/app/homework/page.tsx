"use client";

import { useState } from "react";
import { HomeworkList } from "@/components/HomeworkList";
import { useStaffSections } from "@/components/sections";
import { Alert, Button, Card, Field, PageHeader, Select, Tabs, TextArea } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Student, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export default function HomeworkPage() {
  const { hasRole } = useSession();
  return (
    <>
      <PageHeader title="Homework" subtitle={hasRole("teacher") ? "Post homework to your classes and see who has done it." : "Homework, soonest due first."} />
      <div className="space-y-5">
        {hasRole("teacher") && <TeacherHomework />}
        {hasRole("student") && <Card title="Your homework"><HomeworkList query="upcoming=true" canMarkDone /></Card>}
        {hasRole("parent") && <ParentHomework />}
        {hasRole("admin") && !hasRole("teacher") && <AdminHomework />}
      </div>
    </>
  );
}

function TeacherHomework() {
  const me = useApi<Page<Teacher>>("teachers/");
  const pairs = rows(me.data)[0]?.teaches ?? [];
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");
  const [version, setVersion] = useState(0);
  return (
    <>
      <PostHomework pairs={pairs} onPosted={() => setVersion((v) => v + 1)} />
      <Card title="Your homework">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: "upcoming", label: "Upcoming" }, { key: "all", label: "All" }]} />
        <HomeworkList
          key={`${tab}-${version}`}
          query={tab === "upcoming" ? "upcoming=true" : ""}
          actions={(h, reload) => (
            <button className="text-red-600" onClick={async () => { if (confirm(`Remove "${h.title}"?`)) { await api(`homework/${h.id}/`, { method: "DELETE" }).catch(() => {}); reload(); } }}>Remove</button>
          )}
        />
      </Card>
    </>
  );
}

function PostHomework({ pairs, onPosted }: { pairs: Teacher["teaches"]; onPosted: () => void }) {
  const [pair, setPair] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [section, subject] = pair.split("|");
    const body = new FormData();
    Object.entries({ section, subject, title, instructions, due_date: due }).forEach(([k, v]) => body.append(k, v));
    for (const f of Array.from(files ?? [])) body.append("files", f);
    setBusy(true);
    setError(null);
    try {
      await api("homework/", { method: "POST", body });
      setTitle(""); setInstructions(""); setDue(""); setFiles(null); setDone(true);
      (e.target as HTMLFormElement).reset();
      onPosted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  };

  if (pairs.length === 0) return <Alert tone="info">You are not assigned to teach any subject yet, so you can&apos;t post homework.</Alert>;
  return (
    <Card title="Post homework">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        {done && <div className="sm:col-span-2"><Alert tone="success">Posted. Students and parents can see it now.</Alert></div>}
        <Select label="Class and subject" required value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value="">Choose…</option>
          {pairs.map((p) => <option key={`${p.section}|${p.subject}`} value={`${p.section}|${p.subject}`}>{p.section_name} · {p.subject_name}</option>)}
        </Select>
        <Field label="Due date" type="date" required min={todayIso()} value={due} onChange={(e) => setDue(e.target.value)} />
        <Field label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2" />
        <TextArea label="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} className="sm:col-span-2" />
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Attachments (optional, up to 10 MB each)</span>
          <input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="text-sm" />
        </label>
        <Button type="submit" busy={busy} className="sm:justify-self-start">Post homework</Button>
      </form>
    </Card>
  );
}

function ParentHomework() {
  const children = useApi<Student[]>("my-children");
  const [child, setChild] = useState("");
  const list = children.data ?? [];
  const chosen = child || list[0]?.id;
  if (!children.data) return null;
  if (list.length === 0) return <Alert tone="info">No children are linked to your account yet.</Alert>;
  return (
    <Card
      title={list.length > 1 ? "Your children's homework" : `${list[0].name}'s homework`}
      actions={list.length > 1 ? (
        <Select label="Child" value={chosen} onChange={(e) => setChild(e.target.value)}>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      ) : undefined}
    >
      <HomeworkList key={chosen} query={`student=${chosen}&upcoming=true`} />
    </Card>
  );
}

function AdminHomework() {
  const sections = useStaffSections();
  const [section, setSection] = useState("");
  return (
    <Card title="All homework" actions={
      <Select label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
        <option value="">All sections</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    }>
      <HomeworkList key={section} query={section ? `section=${section}` : "upcoming=true"} />
    </Card>
  );
}
