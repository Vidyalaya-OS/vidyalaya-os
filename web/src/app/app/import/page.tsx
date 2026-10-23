"use client";

import { Download, FileUp, GraduationCap, Users } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, PageHeader, cx } from "@/components/ui";
import { api, ApiError, storage } from "@/lib/api";

type RowError = { row: number; errors: Record<string, unknown> };
type Result = { valid: boolean; rows: number; saved: number };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import from a spreadsheet" subtitle="Upload a CSV or Excel file. Every row is checked first; if any row has a problem, nothing is saved." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Importer kind="students" icon={<GraduationCap aria-hidden />} title="Students" help="Columns: admission_no, name, class, section (required), plus roll_no, dob, gender, email, phone and the parent's name, relation, email and phone. Class and section must already exist for the current year." />
        <Importer kind="teachers" icon={<Users aria-hidden />} title="Teachers" help="Columns: name (required), email or phone, employee_no, qualification, joined_on." />
      </div>
    </>
  );
}

function Importer({ kind, title, help, icon }: { kind: "students" | "teachers"; title: string; help: string; icon: React.ReactNode }) {
  const toast = useToast();
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [error, setError] = useState<string | null>(null);

  const upload = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setRowErrors([]);
    setResult(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const r = await api<Result>(`imports/${kind}${dryRun ? "?dry_run=true" : ""}`, { method: "POST", body });
      setResult(r);
      if (r.saved) toast.success(`Imported ${r.saved} ${kind}.`);
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.data as { errors?: RowError[]; detail?: string };
        setError(data?.detail ?? e.message);
        setRowErrors(data?.errors ?? []);
      } else setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    const res = await fetch(`/api/imports/${kind}`, {
      headers: { Authorization: `Bearer ${storage.session()?.access}`, "X-School": storage.school() ?? "" },
    }).catch(() => null);
    if (!res?.ok) {
      toast.error("Could not download the template. Try again.");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title={title} icon={icon} actions={<Button variant="ghost" size="sm" onClick={downloadTemplate}><Download aria-hidden /> Template</Button>}>
      <p className="mb-4 text-sm text-soft">{help}</p>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setResult(null); setRowErrors([]); setError(null); } }}
        className={cx("flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition", drag ? "border-brand bg-brand-soft" : "border-line hover:border-brand/50 hover:bg-muted/50")}
      >
        <FileUp className="size-8 text-brand" aria-hidden />
        <span className="text-sm font-semibold">{file ? file.name : "Drop a CSV or Excel file here, or tap to choose"}</span>
        <span className="text-xs text-soft">{file ? `${Math.ceil(file.size / 1024)} KB` : ".csv or .xlsx"}</span>
        <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setRowErrors([]); setError(null); }} aria-label={`${title} file`} />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!file} busy={busy} onClick={() => upload(true)}>Check file</Button>
        <Button disabled={!file} busy={busy} onClick={() => upload(false)}>Import</Button>
      </div>
      <div className="mt-4 space-y-2">
        {result && <Alert tone="success">{result.saved ? `Imported ${result.saved} rows. Invites are on their way.` : `All ${result.rows} rows look good. Press Import to save them.`}</Alert>}
        {error && <Alert>{error}</Alert>}
        {rowErrors.length > 0 && (
          <ul className="max-h-72 overflow-y-auto rounded-xl border border-red-200 bg-red-50/50 text-sm dark:border-red-900 dark:bg-red-950/30">
            {rowErrors.map((r) => (
              <li key={r.row} className="border-b border-red-100 px-3 py-2 last:border-0 dark:border-red-900/60">
                <span className="font-medium">Row {r.row}:</span>{" "}
                {Object.entries(r.errors).map(([field, msg]) => `${field.replaceAll("_", " ")}: ${Array.isArray(msg) ? msg.join(" ") : typeof msg === "object" ? JSON.stringify(msg) : msg}`).join("; ")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
