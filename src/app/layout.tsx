import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TimeKeeper",
  description: "Timesheets and holiday requests",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
