import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { DialogProvider } from "@/components/dialog";
import { ToastProvider } from "@/components/toast";
import { SessionProvider } from "@/lib/session";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ variable: "--font-sans-app", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "School Management System", template: "%s · School Management System" },
  description: "One place for schools, teachers, students and parents: timetable, attendance, homework, tests, report cards, quizzes and fees.",
  applicationName: "School Management System",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "School", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.ico", apple: "/apple-icon.png" },
  // Signed-in screens hold private school data; only the login page is meant to be found.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2f5bea" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1018" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans text-base">
        <ThemeProvider>
          <ToastProvider>
            <DialogProvider>
              <SessionProvider>{children}</SessionProvider>
            </DialogProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
