import { Mail, Phone, UserRound } from "lucide-react";
import { cx } from "@/components/ui";
import { CONTACT, contactLinks } from "@/lib/contact";

const ITEMS = [
  { icon: UserRound, label: "Product owner", value: CONTACT.productOwner },
  { icon: Mail, label: "Email", value: CONTACT.email, href: contactLinks.email, wide: true },
  { icon: Phone, label: "Mobile", value: CONTACT.phoneLabel, href: contactLinks.phone },
];

/** The product owner, email and mobile number, as a grid of tiles. */
export function ContactDetails({ className }: { className?: string }) {
  return (
    <ul className={cx("grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]", className)}>
      {ITEMS.map(({ icon: Icon, label, value, href, wide }) => {
        const body = (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wider text-soft">{label}</span>
              <span className="block [overflow-wrap:anywhere] font-semibold text-ink">{value}</span>
            </span>
          </>
        );
        const box = "flex h-full items-center gap-3 rounded-2xl border border-line bg-background/60 p-4";
        return (
          <li key={label} className={cx(wide && "sm:order-last sm:col-span-2 lg:order-none lg:col-span-1")}>
            {href ? (
              <a href={href} className={cx(box, "transition hover:border-brand/40 hover:shadow-[var(--shadow-lift)]")}>{body}</a>
            ) : (
              <div className={box}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
