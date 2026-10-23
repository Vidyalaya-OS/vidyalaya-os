"use client";

import { BookOpen, CirclePlus, Paperclip } from "lucide-react";
import { useState } from "react";
import { ChildSwitcher } from "@/components/Dashboards";
import { useDialog } from "@/components/dialog";
import { HomeworkList } from "@/components/HomeworkList";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Empty, Field, PageHeader, Select, Tabs, TextArea } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { useChildren } from "@/lib/children";
import { todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export default function HomeworkPage() {
  const { hasRole } = useSession();
  return (
    <>
      <PageHeader title="Homework" subtitle={hasRole("teacher") ? "Post homework to your classes and see who has done it." : "Homework, soonest due first."} />
      <div className="space-y-5">
        {hasRole("teacher") && <TeacherHomework />}
        {hasRole("student") && <Card title="Your homework" icon={<BookOpen aria-hidden />} description="Tick each one when you have finished it."><HomeworkList query="upcoming=true" canMarkDone /></Card>}
        {hasRole("parent") && <ParentHomework />}
        {hasRole("admin") && !hasRole("teacher") && <AdminHomework />}
      </div>
    </>
  );
}

function TeacherHomework() {
  const me = useApi<Page<Teacher>>("teachers/?mine=true");
  const pairs = rows(me.data)[0]?.teaches ?? [];
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");
  const [version, setVersion] = useState(0);
  const dialog = useDialog();
  const toast = useToast();
  return (
    <>
      <PostHomework pairs={pairs} onPosted={() => setVersion((v) => v + 1)} />
      <Card title="Your homework" icon={<BookOpen aria-hidden />}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: "upcoming", label: "Upcoming" }, { key: "all", label: "All" }]} />
        <HomeworkList
          key={`${tab}-${version}`}
          query={tab === "upcoming" ? "upcoming=true" : ""}
          actions={(h, reload) => (
            <button className="font-medium text-red-600" onClick={async () => {
              if (!(await dialog.confirm({ title: `Remove "${h.title}"?`, body: "Students and parents will no longer see it.", confirmLabel: "Remove", danger: true }))) return;
              try {
                await api(`homework/${h.id}/`, { method: "DELETE" });
                toast.success("Homework removed.");
              } catch (e) {
                toast.error(e);
              }
              reload();
            }}>Remove</button>
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
  const toast = useToast();

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
      setTitle(""); setInstructions(""); setDue(""); setFiles(null);
      toast.success("Posted. Students and parents can see it now.");
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
    <Card title="Post homework" icon={<CirclePlus aria-hidden />}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <Select label="Class and subject" required value={pair} onChange={(e) => setPair(e.target.value)}>
          <option value="">Choose…</option>
          {pairs.map((p) => <option key={`${p.section}|${p.subject}`} value={`${p.section}|${p.subject}`}>{p.section_name} · {p.subject_name}</option>)}
        </Select>
        <Field label="Due date" type="date" required min={todayIso()} value={due} onChange={(e) => setDue(e.target.value)} />
        <Field label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2" />
        <TextArea label="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} className="sm:col-span-2" />
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-3 text-sm transition hover:border-brand/50 hover:bg-muted/50 sm:col-span-2">
          <Paperclip className="size-5 text-brand" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{files?.length ? `${files.length} file${files.length === 1 ? "" : "s"} attached` : "Attach files"}</span>
            <span className="block truncate text-xs text-soft">{files?.length ? Array.from(files).map((f) => f.name).join(", ") : "Optional, up to 10 MB each"}</span>
          </span>
          <input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="sr-only" />
        </label>
        <Button type="submit" busy={busy} className="sm:justify-self-start">Post homework</Button>
      </form>
    </Card>
  );
}

function ParentHomework() {
  const { list, chosen, choose, loading } = useChildren();
  if (loading) return null;
  if (!chosen) return <Empty title="No children linked yet">Ask the school office to link your child to your account.</Empty>;
  return (
    <>
      <ChildSwitcher items={list.map((c) => ({ id: c.id, name: c.name, detail: c.current_enrollment?.section_name }))} value={chosen.id} onChange={choose} />
      <Card title={`${chosen.name}'s homework`} icon={<BookOpen aria-hidden />}>
        <HomeworkList key={chosen.id} query={`student=${chosen.id}&upcoming=true`} />
      </Card>
    </>
  );
}

function AdminHomework() {
  const sections = useStaffSections();
  const [section, setSection] = useState("");
  return (
    <Card title="All homework" icon={<BookOpen aria-hidden />} actions={
      <Select label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
        <option value="">All sections</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    }>
      <HomeworkList key={section} query={section ? `section=${section}` : "upcoming=true"} />
    </Card>
  );
}
