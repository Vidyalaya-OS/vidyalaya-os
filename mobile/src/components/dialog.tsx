import { createContext, useCallback, useContext, useState } from "react";
import { View } from "react-native";
import { Button, Field, Sheet, Stack, Txt } from "./ui";

type ConfirmOptions = { title: string; body?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PromptField = { name: string; label: string; type?: "text" | "number" | "email" | "date"; initial?: string; required?: boolean; placeholder?: string; hint?: string; multiline?: boolean };
type PromptOptions = { title: string; body?: React.ReactNode; fields: PromptField[]; confirmLabel?: string; danger?: boolean };

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (values: Record<string, string> | null) => void };

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<Record<string, string> | null>;
};

const DialogContext = createContext<Ctx | null>(null);

/** In-app confirm and prompt dialogs, like the web's. */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", opts, resolve })), []);
  const prompt = useCallback((opts: PromptOptions) => new Promise<Record<string, string> | null>((resolve) => {
    setValues(Object.fromEntries(opts.fields.map((f) => [f.name, f.initial ?? ""])));
    setMissing(null);
    setPending({ kind: "prompt", opts, resolve });
  }), []);

  const close = (result: boolean) => {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(result);
    else {
      if (result) {
        const empty = pending.opts.fields.find((f) => f.required && !values[f.name]?.trim());
        if (empty) {
          setMissing(empty.name);
          return;
        }
      }
      pending.resolve(result ? values : null);
    }
    setPending(null);
  };

  const opts = pending?.opts;

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <Sheet open={Boolean(pending)} onClose={() => close(false)} title={opts?.title ?? ""}>
        <Stack gap={14}>
          {opts?.body != null && (typeof opts.body === "string" ? <Txt size="sm" soft>{opts.body}</Txt> : <View>{opts.body}</View>)}
          {pending?.kind === "prompt" && pending.opts.fields.map((f, i) => (
            <Field
              key={f.name}
              autoFocus={i === 0}
              label={f.label}
              placeholder={f.placeholder ?? (f.type === "date" ? "YYYY-MM-DD" : undefined)}
              hint={f.hint}
              multiline={f.multiline}
              keyboardType={f.type === "number" ? "decimal-pad" : f.type === "email" ? "email-address" : "default"}
              autoCapitalize={f.type === "email" ? "none" : undefined}
              error={missing === f.name ? "This is required." : undefined}
              value={values[f.name] ?? ""}
              onChangeText={(t) => {
                setValues((v) => ({ ...v, [f.name]: t }));
                if (missing === f.name) setMissing(null);
              }}
              onSubmitEditing={i === (pending.opts.fields.length - 1) ? () => close(true) : undefined}
            />
          ))}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <Button variant="secondary" onPress={() => close(false)}>{pending?.kind === "confirm" ? pending.opts.cancelLabel ?? "Cancel" : "Cancel"}</Button>
            <Button variant={opts?.danger ? "danger-solid" : "primary"} onPress={() => close(true)}>
              {opts?.confirmLabel ?? (pending?.kind === "prompt" ? "Save" : "Continue")}
            </Button>
          </View>
        </Stack>
      </Sheet>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside DialogProvider");
  return ctx;
}
