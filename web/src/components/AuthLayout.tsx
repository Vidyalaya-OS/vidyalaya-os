import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Wallet } from "lucide-react";
import { ThemeButton } from "@/components/AppShell";

const FEATURES = [
  { icon: ClipboardCheck, text: "Attendance in a few taps, with alerts for low attendance" },
  { icon: BookOpen, text: "Homework, quizzes and report cards in one place" },
  { icon: CalendarDays, text: "Timetables and due dates on a calendar" },
  { icon: Wallet, text: "Fees, receipts and overdue lists for the office" },
];

/** The frame for sign-in screens: a welcome panel beside the form on wide
 * screens, the form alone on phones. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#2347c5] via-[#3b5fe8] to-[#7c4ddb] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-violet-300/20 blur-3xl" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><GraduationCap className="size-6" aria-hidden /></span>
          <span className="text-lg font-semibold">School Management System</span>
        </div>
        <div className="relative max-w-md animate-enter">
          <h2 className="text-4xl font-bold leading-tight tracking-tight">Everything your school runs on, in one calm place.</h2>
          <p className="mt-4 text-lg text-white/80">For admins, teachers, students and parents, on any phone or computer.</p>
          <ul className="stagger mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15"><Icon className="size-[1.1rem]" aria-hidden /></span>
                <span className="text-white/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Each school&apos;s data is kept private to that school.</p>
      </aside>
      <main className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="absolute right-3 top-3"><ThemeButton /></div>
        <div className="w-full max-w-sm animate-enter">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-violet-500 text-white shadow-lg shadow-brand/30"><GraduationCap className="size-6" aria-hidden /></span>
            <span className="font-semibold">School Management System</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
