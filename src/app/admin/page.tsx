import type { Metadata } from "next";
import { AdminPanel } from "@/components/community/AdminPanel";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function Page() {
  return <AdminPanel />;
}
