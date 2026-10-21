"use client";

import { useState } from "react";
import { Alert, Button, Card, PageHeader } from "@/components/ui";
import { api, ApiError, storage } from "@/lib/api";

type RowError = { row: number; errors: Record<string, unknown> };
type Result = { valid: boolean; rows: number; saved: number };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import from a spreadsheet" subtitle="Upload a CSV or Excel file. Every row is checked first; if any row has a problem, nothing is saved." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Importer kind="students" title="Students" help="Columns: admission_no, name, class, section (required), plus roll_no, dob, gender, email, phone and the parent's name, relation, email and phone. Class and section must already exist for the current year." />
        <Importer kind="teachers" title="Teachers" help="Columns: name (required), email or phone, employee_no, qualification, joined_on." />
      </div>
    </>
  );
}

function Importer({ kind, title, help }: { kind: "students" | "teachers"; title: string; help: string }) {
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
      setResult(await api<Result>(`imports/${kind}${dryRun ? "?dry_run=true" : ""}`, { method: "POST", body }));
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
    });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title={title} actions={<Button variant="ghost" onClick={downloadTemplate}>Download template</Button>}>
      <p className="mb-4 text-sm text-soft">{help}</p>
      <input type="file" accept=".csv,.xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setRowErrors([]); setError(null); }} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" aria-label={`${title} file`} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!file} busy={busy} onClick={() => upload(true)}>Check file</Button>
        <Button disabled={!file} busy={busy} onClick={() => upload(false)}>Import</Button>
      </div>
      <div className="mt-4 space-y-2">
        {result && <Alert tone="success">{result.saved ? `Imported ${result.saved} rows. Invites are on their way.` : `All ${result.rows} rows look good. Press Import to save them.`}</Alert>}
        {error && <Alert>{error}</Alert>}
        {rowErrors.length > 0 && (
          <ul className="max-h-72 overflow-y-auto rounded-lg border border-line text-sm">
            {rowErrors.map((r) => (
              <li key={r.row} className="border-b border-line px-3 py-2 last:border-0">
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
